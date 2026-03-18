/**
 * Smart Scheduling Routes
 * Manage post scheduling with optimal timing recommendations
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');
const schedulerService = require('../services/scheduler.service');

/**
 * GET /api/schedule/suggestions
 * Get optimal posting time suggestions for platforms
 * Query: ?platforms=instagram,tiktok,facebook&timezone=America/New_York
 */
router.get('/suggestions', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { platforms = [], timezone = 'UTC' } = req.query;

    if (!platforms || (typeof platforms === 'string' && !platforms.trim())) {
      return res.status(400).json({
        success: false,
        error: 'platforms parameter required (comma-separated list)'
      });
    }

    // Parse platforms
    const platformList = typeof platforms === 'string'
      ? platforms.split(',').map(p => p.trim())
      : Array.isArray(platforms) ? platforms : [];

    if (platformList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one platform required'
      });
    }

    const suggestions = schedulerService.getScheduleSuggestions(platformList, timezone);

    res.json({
      success: true,
      timezone,
      suggestions,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting schedule suggestions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/schedule/set
 * Schedule post(s) for publishing
 * Body: { job_id, platform, scheduled_time } OR { job_ids: [...], scheduled_times: {...} }
 */
router.post('/set', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { job_id, platform, scheduled_time, job_ids, scheduled_times } = req.body;

    if (!job_id && !job_ids) {
      return res.status(400).json({
        success: false,
        error: 'job_id or job_ids required'
      });
    }

    if (!platform && !scheduled_times) {
      return res.status(400).json({
        success: false,
        error: 'platform or scheduled_times required'
      });
    }

    if (!scheduled_time && !scheduled_times) {
      return res.status(400).json({
        success: false,
        error: 'scheduled_time or scheduled_times required'
      });
    }

    const results = [];
    const errors = [];

    // Single job
    if (job_id) {
      try {
        const result = await schedulerService.schedulePost(job_id, platform, scheduled_time);
        results.push({
          job_id,
          platform,
          scheduled_time,
          success: true
        });
      } catch (error) {
        errors.push({
          job_id,
          error: error.message
        });
      }
    }

    // Multiple jobs
    if (job_ids && scheduled_times) {
      for (const jid of job_ids) {
        const platform = Object.keys(scheduled_times).find(p =>
          scheduled_times[p] && typeof scheduled_times[p] === 'string'
        );

        if (!platform) {
          errors.push({ job_id: jid, error: 'No scheduled time found for platform' });
          continue;
        }

        try {
          const result = await schedulerService.schedulePost(jid, platform, scheduled_times[platform]);
          results.push({
            job_id: jid,
            platform,
            scheduled_time: scheduled_times[platform],
            success: true
          });
        } catch (error) {
          errors.push({
            job_id: jid,
            error: error.message
          });
        }
      }
    }

    res.json({
      success: errors.length === 0,
      scheduled: results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: results.length + errors.length,
        succeeded: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    logger.error('Error scheduling posts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schedule/pending
 * Get scheduled posts pending for next 24 hours
 */
router.get('/pending', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const jobs = await schedulerService.getPendingScheduledPosts(req.company.id);

    res.json({
      success: true,
      pending_count: jobs.length,
      jobs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching pending scheduled posts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/schedule/list
 * List all scheduled posts
 * Query: ?limit=50&offset=0
 */
router.get('/list', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;

    const result = await schedulerService.getScheduledPosts(req.company.id, { limit, offset });

    res.json({
      success: true,
      jobs: result.jobs,
      pagination: {
        limit,
        offset,
        total: result.total
      }
    });
  } catch (error) {
    logger.error('Error listing scheduled posts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/schedule/:job_id
 * Unschedule a post (revert to draft)
 */
router.delete('/:job_id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { job_id } = req.params;

    const { getSupabaseAdmin } = require('../db/supabase');
    const supabase = getSupabaseAdmin();

    // Verify job belongs to company
    const { data: job } = await supabase
      .from('content_jobs')
      .select('id')
      .eq('id', job_id)
      .eq('company_id', req.company.id)
      .single();

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Clear scheduled_at
    const { error } = await supabase
      .from('content_jobs')
      .update({
        scheduled_at: null,
        scheduled_platform: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Post unscheduled',
      job_id
    });
  } catch (error) {
    logger.error('Error unscheduling post:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
