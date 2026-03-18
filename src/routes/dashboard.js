/**
 * Dashboard API Routes
 * Budget controls, queue visibility, and metrics
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../db/local-adapter');
const { getAllConfig, setConfig, getTodaysSpend, getMonthlySpend } = require('../middleware/budget-control');
const { getConnectedAccounts, ALL_PLATFORMS } = require('../services/publer.service');
const logger = require('../utils/logger');

/**
 * GET /api/dashboard/publer-accounts
 * Returns connected Publer social accounts and all known platforms
 */
router.get('/publer-accounts', async (req, res) => {
  try {
    const accounts = await getConnectedAccounts();
    res.json({
      success: true,
      accounts,
      allPlatforms: ALL_PLATFORMS
    });
  } catch (e) {
    logger.error('Failed to fetch Publer accounts:', e.message);
    res.json({
      success: true,
      accounts: [],
      allPlatforms: ALL_PLATFORMS,
      error: e.message
    });
  }
});

/**
 * GET /api/dashboard/settings
 * Returns all app configuration
 */
router.get('/settings', async (req, res) => {
  try {
    const config = await getAllConfig();
    const todaySpend = await getTodaysSpend();
    const monthlySpend = await getMonthlySpend();
    
    res.json({
      success: true,
      config,
      currentSpend: {
        today: todaySpend,
        month: monthlySpend
      }
    });
    
  } catch (error) {
    logger.error('Failed to get settings:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/dashboard/settings
 * Updates app configuration
 * Body: { key, value }
 */
router.put('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing key or value'
      });
    }
    
    // All allowed config keys — no restriction, any valid key is accepted
    const BLOCKED_KEYS = ['__proto__', 'constructor', 'prototype'];
    if (BLOCKED_KEYS.includes(key)) {
      return res.status(400).json({ success: false, error: 'Invalid key' });
    }

    await setConfig(key, value);
    
    res.json({
      success: true,
      message: `${key} updated to ${value}`
    });
    
  } catch (error) {
    logger.error('Failed to update settings:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dashboard/queue
 * Returns jobs with stage status, timestamps, and cost estimates
 */
router.get('/queue', async (req, res) => {
  try {
    const { limit = 50, status, processing_step, hide_complete } = req.query;

    let query = supabase
      .from('content_jobs')
      .select(`
        id,
        source_title,
        source_url,
        publish_status,
        processing_step,
        review_status,
        created_at,
        processed_at,
        failed_at,
        generation_cost_estimate,
        gpu_seconds,
        one_off_run,
        retry_count,
        failed_stage,
        error_message,
        publer_post_id,
        screenshot_url,
        script_text,
        avatar_name
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('publish_status', status);
    } else if (hide_complete !== 'false') {
      // By default hide completed+published and rejected jobs
      query = query.not('publish_status', 'eq', 'rejected')
                   .not('review_status', 'eq', 'rejected');
    }

    if (processing_step) {
      query = query.eq('processing_step', processing_step);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Calculate stage durations and add metadata
    const enrichedJobs = data.map(job => ({
      ...job,
      cost_usd: job.generation_cost_estimate || 0,
      gpu_hours: job.gpu_seconds ? (job.gpu_seconds / 3600).toFixed(2) : 0,
      is_stuck: job.publish_status === 'processing' && 
                new Date() - new Date(job.created_at) > 3600000, // > 1 hour
      age_hours: ((new Date() - new Date(job.created_at)) / 3600000).toFixed(1)
    }));
    
    res.json({
      success: true,
      jobs: enrichedJobs,
      count: enrichedJobs.length
    });
    
  } catch (error) {
    logger.error('Failed to get queue:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dashboard/metrics
 * Returns cost per successful draft, failure heatmap, and top errors
 */
router.get('/metrics', async (req, res) => {
  try {
    // Cost metrics (7-day average)
    const { data: costMetrics, error: costError } = await supabase
      .from('cost_metrics')
      .select('*')
      .single();
    
    if (costError && costError.code !== 'PGRST116') throw costError;
    
    // Failure heatmap by stage
    const { data: failureHeatmap, error: heatmapError } = await supabase
      .from('failure_heatmap')
      .select('*');
    
    if (heatmapError) throw heatmapError;
    
    // Top error messages (last 7 days)
    const { data: topErrors, error: errorsError } = await supabase
      .from('content_jobs')
      .select('error_message, failed_stage')
      .not('error_message', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(20);
    
    if (errorsError) throw errorsError;
    
    // Group errors by message
    const errorGroups = {};
    topErrors.forEach(err => {
      const key = err.error_message;
      if (!errorGroups[key]) {
        errorGroups[key] = {
          message: key,
          count: 0,
          stages: new Set()
        };
      }
      errorGroups[key].count++;
      if (err.failed_stage) {
        errorGroups[key].stages.add(err.failed_stage);
      }
    });
    
    const topErrorMessages = Object.values(errorGroups)
      .map(group => ({
        ...group,
        stages: Array.from(group.stages)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Success rate by day (last 7 days)
    const { data: dailyStats, error: statsError } = await supabase
      .from('content_jobs')
      .select('created_at, publish_status')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    if (statsError) throw statsError;
    
    // Group by day
    const dailySuccess = {};
    dailyStats.forEach(job => {
      const day = new Date(job.created_at).toISOString().split('T')[0];
      if (!dailySuccess[day]) {
        dailySuccess[day] = { total: 0, successful: 0, failed: 0 };
      }
      dailySuccess[day].total++;
      if (job.publish_status === 'ready') dailySuccess[day].successful++;
      if (job.publish_status === 'failed') dailySuccess[day].failed++;
    });
    
    const successRateByDay = Object.entries(dailySuccess).map(([day, stats]) => ({
      date: day,
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      success_rate: ((stats.successful / stats.total) * 100).toFixed(1)
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({
      success: true,
      metrics: {
        cost: costMetrics || {
          avg_cost_per_draft: 0,
          total_spend_7d: 0,
          successful_drafts_7d: 0,
          total_gpu_hours: 0
        },
        failure_heatmap: failureHeatmap || [],
        top_errors: topErrorMessages,
        success_rate_by_day: successRateByDay
      }
    });
    
  } catch (error) {
    logger.error('Failed to get metrics:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/run-one-off
 * Manually triggers a one-off job for a specific URL
 * Body: { source_url, priority }
 */
router.post('/run-one-off', async (req, res) => {
  try {
    const { source_url, priority = 100 } = req.body;
    
    if (!source_url) {
      return res.status(400).json({
        success: false,
        error: 'source_url is required'
      });
    }
    
    // Check if URL already exists
    const { data: existing, error: checkError } = await supabase
      .from('content_jobs')
      .select('id, publish_status')
      .eq('source_url', source_url)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') throw checkError;
    
    if (existing) {
      // Update existing job to one-off and move to top of queue
      const { error: updateError } = await supabase
        .from('content_jobs')
        .update({
          one_off_run: true,
          review_status: 'approved',
          publish_status: existing.publish_status === 'failed' ? 'draft' : existing.publish_status,
          created_at: new Date().toISOString() // Move to top of queue
        })
        .eq('id', existing.id);
      
      if (updateError) throw updateError;
      
      logger.info(`✅ Existing job ${existing.id} updated to one-off`);
      
      return res.json({
        success: true,
        message: 'Existing job updated and moved to top of queue',
        job_id: existing.id,
        action: 'updated'
      });
    }
    
    // Create new job
    const { data: newJob, error: insertError } = await supabase
      .from('content_jobs')
      .insert({
        source_url,
        source_title: 'One-off job',
        one_off_run: true,
        review_status: 'approved',
        publish_status: 'draft',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (insertError) throw insertError;
    
    logger.info(`✅ New one-off job created: ${newJob.id}`);
    
    res.json({
      success: true,
      message: 'One-off job created and queued',
      job_id: newJob.id,
      action: 'created'
    });
    
  } catch (error) {
    logger.error('Failed to create one-off job:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dashboard/analytics/cost-per-draft
 * Returns rolling 7-day cost per successful draft chart data
 */
router.get('/analytics/cost-per-draft', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('created_at, generation_cost_estimate, cost_estimate, publish_status')
      .eq('publish_status', 'ready')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    // Group by day
    const dailyCosts = {};
    data.forEach(job => {
      const day = new Date(job.created_at).toISOString().split('T')[0];
      if (!dailyCosts[day]) {
        dailyCosts[day] = { total_cost: 0, count: 0 };
      }
      const cost = job.cost_estimate || job.generation_cost_estimate || 0;
      dailyCosts[day].total_cost += cost;
      dailyCosts[day].count++;
    });
    
    const chartData = Object.entries(dailyCosts).map(([day, data]) => ({
      date: day,
      total_cost: parseFloat(data.total_cost.toFixed(4)),
      count: data.count,
      avg_cost: parseFloat((data.total_cost / data.count).toFixed(4))
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({
      success: true,
      data: chartData
    });
    
  } catch (error) {
    logger.error('Failed to get cost per draft analytics:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dashboard/analytics/gpu-utilization
 * Returns total GPU seconds per day
 */
router.get('/analytics/gpu-utilization', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('created_at, gpu_seconds')
      .not('gpu_seconds', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    // Group by day
    const dailyGpu = {};
    data.forEach(job => {
      const day = new Date(job.created_at).toISOString().split('T')[0];
      if (!dailyGpu[day]) {
        dailyGpu[day] = { total_seconds: 0, count: 0 };
      }
      dailyGpu[day].total_seconds += job.gpu_seconds || 0;
      dailyGpu[day].count++;
    });
    
    const chartData = Object.entries(dailyGpu).map(([day, data]) => ({
      date: day,
      gpu_hours: parseFloat((data.total_seconds / 3600).toFixed(2)),
      gpu_seconds: data.total_seconds,
      jobs_count: data.count,
      avg_gpu_per_job: parseFloat((data.total_seconds / data.count).toFixed(1))
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({
      success: true,
      data: chartData
    });
    
  } catch (error) {
    logger.error('Failed to get GPU utilization:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/dashboard/analytics/token-usage
 * Returns sum of OpenRouter tokens per day
 */
router.get('/analytics/token-usage', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('created_at, openrouter_tokens, openrouter_prompt_tokens, openrouter_completion_tokens')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    // Group by day
    const dailyTokens = {};
    data.forEach(job => {
      const day = new Date(job.created_at).toISOString().split('T')[0];
      if (!dailyTokens[day]) {
        dailyTokens[day] = { prompt: 0, completion: 0, total: 0, count: 0 };
      }
      
      // Handle both JSONB and integer columns
      if (job.openrouter_tokens && typeof job.openrouter_tokens === 'object') {
        dailyTokens[day].prompt += job.openrouter_tokens.prompt || 0;
        dailyTokens[day].completion += job.openrouter_tokens.completion || 0;
        dailyTokens[day].total += job.openrouter_tokens.total || 0;
      } else {
        dailyTokens[day].prompt += job.openrouter_prompt_tokens || 0;
        dailyTokens[day].completion += job.openrouter_completion_tokens || 0;
        dailyTokens[day].total += (job.openrouter_prompt_tokens || 0) + (job.openrouter_completion_tokens || 0);
      }
      dailyTokens[day].count++;
    });
    
    const chartData = Object.entries(dailyTokens).map(([day, data]) => ({
      date: day,
      prompt_tokens: data.prompt,
      completion_tokens: data.completion,
      total_tokens: data.total,
      jobs_count: data.count
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    res.json({
      success: true,
      data: chartData
    });
    
  } catch (error) {
    logger.error('Failed to get token usage:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
