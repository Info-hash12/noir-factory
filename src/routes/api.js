/**
 * API Routes
 * Express routes for API endpoints
 */

const express = require('express');
const router = express.Router();
const { triggerManualCheck } = require('../jobs/rssMonitor.v2');
const { getAllPosts, getPostById } = require('../models/post');
const { getSupabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

/**
 * GET /api/_routes
 * Debug endpoint - lists all routes in this router
 */
router.get('/_routes', (req, res) => {
  const routes = router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => layer.route.methods[m])
    }));
  res.json({ 
    mountedAt: '/api',
    routes: routes,
    count: routes.length
  });
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'noir-factory'
  });
});

/**
 * POST /api/trigger
 * Manually trigger RSS feed processing
 */
router.post('/trigger', async (req, res) => {
  try {
    logger.info('Manual trigger endpoint called');
    
    // Trigger RSS check asynchronously
    triggerManualCheck().catch(error => {
      logger.error('Manual trigger processing failed:', error.message);
    });

    res.json({
      success: true,
      message: 'RSS feed processing triggered successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Manual trigger endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/posts
 * Get all posts with optional status filter
 * Query params: status (optional), limit (optional)
 */
router.get('/posts', async (req, res) => {
  try {
    const { status, limit } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (limit) filters.limit = parseInt(limit, 10);

    const posts = await getAllPosts(filters);

    res.json({
      success: true,
      count: posts.length,
      posts: posts
    });

  } catch (error) {
    logger.error('Get posts endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/posts/:id
 * Get a single post by ID
 */
router.get('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const post = await getPostById(id);

    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Post not found'
      });
    }

    res.json({
      success: true,
      post: post
    });

  } catch (error) {
    logger.error('Get post by ID endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/stats
 * Get statistics about processed posts
 */
router.get('/stats', async (req, res) => {
  try {
    const allPosts = await getAllPosts({});
    
    const stats = {
      total: allPosts.length,
      pending: allPosts.filter(p => p.status === 'pending').length,
      processing: allPosts.filter(p => p.status === 'processing').length,
      completed: allPosts.filter(p => p.status === 'completed').length,
      failed: allPosts.filter(p => p.status === 'failed').length,
      averageScore: 0
    };

    const completedPosts = allPosts.filter(p => p.status === 'completed' && p.ai_score !== null);
    if (completedPosts.length > 0) {
      const totalScore = completedPosts.reduce((sum, p) => sum + p.ai_score, 0);
      stats.averageScore = Math.round(totalScore / completedPosts.length);
    }

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    logger.error('Get stats endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/config
 * Get all configuration items from noir_config table
 */
router.get('/config', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database connection not available');
      return res.status(503).json([]);
    }

    const { data, error } = await supabase
      .from('noir_config')
      .select('*')
      .order('key');
    
    if (error) {
      logger.error('Failed to fetch config:', error.message);
      return res.status(500).json([]);
    }

    logger.info(`Returned ${(data || []).length} config items`);
    res.json(data || []);

  } catch (error) {
    logger.error('Get config endpoint failed:', error.message);
    res.status(500).json([]);
  }
});

/**
 * POST /api/config
 * Update or insert configuration item
 */
router.post('/config', async (req, res) => {
  try {
    const { key, value } = req.body;
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database connection not available');
      return res.status(503).json({ message: 'Database unavailable' });
    }

    if (!key || value === undefined) {
      return res.status(400).json({ message: 'Key and value are required' });
    }
    
    // Check if config exists
    const { data: existing, error: fetchError } = await supabase
      .from('noir_config')
      .select('*')
      .eq('key', key)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      logger.error('Failed to check existing config:', fetchError.message);
      throw fetchError;
    }
    
    let result;
    const now = new Date().toISOString();
    
    if (existing) {
      // Update existing
      result = await supabase
        .from('noir_config')
        .update({ 
          value, 
          updated_at: now
        })
        .eq('key', key);
      
      logger.info(`Updated config key: ${key}`);
    } else {
      // Insert new
      result = await supabase
        .from('noir_config')
        .insert({ 
          key, 
          value, 
          category: 'general',
          created_at: now,
          updated_at: now
        });
      
      logger.info(`Created config key: ${key}`);
    }
    
    if (result.error) {
      logger.error('Failed to save config:', result.error.message);
      throw result.error;
    }
    
    // Get updated config
    const { data: updated } = await supabase
      .from('noir_config')
      .select('*')
      .eq('key', key)
      .single();
    
    res.json(updated);

  } catch (error) {
    logger.error('Post config endpoint failed:', error.message);
    res.status(500).json({ message: 'Failed to update configuration' });
  }
});

/**
 * GET /api/jobs
 * Get all jobs from noir_jobs table - returns raw database rows
 */
router.get('/jobs', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database connection not available');
      return res.status(503).json([]);
    }

    // Query noir_jobs table - SELECT ALL COLUMNS
    const { data: jobs, error } = await supabase
      .from('noir_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('Failed to fetch jobs:', error.message);
      return res.status(500).json([]);
    }

    logger.info(`Returned ${(jobs || []).length} jobs`);
    res.json(jobs || []);

  } catch (error) {
    logger.error('Get jobs endpoint failed:', error.message);
    res.status(500).json([]);
  }
});

/**
 * GET /api/dashboard/costs
 * Get cost analytics from noir_costs table and noir_daily_costs view
 */
router.get('/dashboard/costs', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database connection not available for costs');
      return res.status(503).json({
        dailySpend: 0,
        dailyCap: 150.00,
        jobsToday: 0,
        avgCostPerJob: 0
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Query noir_costs table for today's costs
    const { data: costs, error: costsError } = await supabase
      .from('noir_costs')
      .select('amount')
      .gte('created_at', today);

    if (costsError) {
      logger.error('Failed to fetch costs:', costsError.message);
    }

    // Query noir_jobs table to get count of today's jobs
    const { data: jobs, error: jobsError } = await supabase
      .from('noir_jobs')
      .select('id')
      .gte('created_at', today);

    if (jobsError) {
      logger.error('Failed to fetch jobs count:', jobsError.message);
    }

    // Get daily cap from noir_config
    const { data: capConfig } = await supabase
      .from('noir_config')
      .select('value')
      .eq('key', 'DAILY_SPEND_CAP')
      .single();

    const dailyCap = capConfig ? parseFloat(capConfig.value) : 150.00;

    // Calculate daily spend from noir_costs table
    const dailySpend = (costs || []).reduce((sum, cost) => sum + (parseFloat(cost.amount) || 0), 0);
    const jobsToday = (jobs || []).length;
    const avgCostPerJob = jobsToday > 0 ? dailySpend / jobsToday : 0;

    const costData = {
      dailySpend: parseFloat(dailySpend.toFixed(2)),
      dailyCap: dailyCap,
      jobsToday: jobsToday,
      avgCostPerJob: parseFloat(avgCostPerJob.toFixed(2))
    };

    logger.info(`Cost analytics: ${costData.jobsToday} jobs today, $${costData.dailySpend} spent`);
    res.json(costData);

  } catch (error) {
    logger.error('Get costs endpoint failed:', error.message);
    res.status(500).json({
      dailySpend: 0,
      dailyCap: 150.00,
      jobsToday: 0,
      avgCostPerJob: 0
    });
  }
});

/**
 * POST /api/pipeline/batch
 * Trigger batch processing of approved jobs from noir_jobs table
 */
router.post('/pipeline/batch', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database not available for batch processing');
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    // Find approved jobs from noir_jobs table
    const { data: approvedJobs, error: fetchError } = await supabase
      .from('noir_jobs')
      .select('id, title, status')
      .eq('status', 'approved')
      .limit(5);

    if (fetchError) {
      logger.error('Failed to fetch approved jobs:', fetchError.message);
      throw new Error(fetchError.message);
    }

    if (!approvedJobs || approvedJobs.length === 0) {
      logger.info('No approved jobs found for batch processing');
      return res.json({
        success: true,
        message: 'No approved jobs to process',
        jobs: []
      });
    }

    // Update jobs to 'fetched' status
    const jobIds = approvedJobs.map(j => j.id);
    const { error: updateError } = await supabase
      .from('noir_jobs')
      .update({ 
        status: 'fetched',
        updated_at: new Date().toISOString()
      })
      .in('id', jobIds);

    if (updateError) {
      logger.error('Failed to update job statuses:', updateError.message);
      throw new Error(updateError.message);
    }

    logger.info(`Batch processing started for ${approvedJobs.length} jobs: ${jobIds.join(', ')}`);

    res.json({
      success: true,
      message: `Processing ${approvedJobs.length} jobs`,
      jobs: approvedJobs.map(j => ({ id: j.id, title: j.title }))
    });

  } catch (error) {
    logger.error('Batch pipeline endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/:id/approve
 * Approve a specific job in noir_jobs table
 */
router.post('/jobs/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database not available for job approval');
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('noir_jobs')
      .update({ 
        status: 'approved',
        approved_at: now,
        updated_at: now
      })
      .eq('id', id);

    if (error) {
      logger.error(`Failed to approve job ${id}:`, error.message);
      throw new Error(error.message);
    }

    logger.info(`✅ Job ${id} approved`);

    res.json({
      success: true,
      message: 'Job approved'
    });

  } catch (error) {
    logger.error('Approve job endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs/:id/reject
 * Reject a specific job in noir_jobs table
 */
router.post('/jobs/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    
    if (!supabase) {
      logger.error('Database not available for job rejection');
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('noir_jobs')
      .update({ 
        status: 'rejected',
        rejected_at: now,
        updated_at: now
      })
      .eq('id', id);

    if (error) {
      logger.error(`Failed to reject job ${id}:`, error.message);
      throw new Error(error.message);
    }

    logger.info(`❌ Job ${id} rejected`);

    res.json({
      success: true,
      message: 'Job rejected'
    });

  } catch (error) {
    logger.error('Reject job endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper functions
function formatTimeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function calculateCostEstimate(status) {
  const costs = {
    'completed': 0.34,
    'processing': 0.28,
    'rendering': 0.12,
    'pending': 0.08,
    'approved': 0.08,
    'queued': 0.15
  };
  return costs[status] || 0.10;
}

module.exports = router;
