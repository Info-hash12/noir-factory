/**
 * Engagement Bot Routes
 * Manage and trigger engagement bot cycles
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');
const engagementBot = require('../jobs/engagementBot');
const { getSupabaseAdmin } = require('../db/supabase');

/**
 * POST /api/engagement/run-cycle
 * Manually trigger one engagement bot cycle for current company
 * Body: { platform } - optional, defaults to all active platforms
 */
router.post('/run-cycle', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { platform } = req.body;
    const supabase = getSupabaseAdmin();

    if (platform) {
      // Run for specific platform
      await engagementBot.runBotCycle(req.company.id, platform);

      res.json({
        success: true,
        message: `Engagement cycle triggered for ${platform}`,
        company_id: req.company.id,
        platform
      });
    } else {
      // Get all active platforms for this company
      const { data: configs } = await supabase
        .from('engagement_bot_configs')
        .select('platform')
        .eq('company_id', req.company.id)
        .eq('is_active', true);

      if (!configs || configs.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No active engagement bot configurations found'
        });
      }

      const platforms = [...new Set(configs.map(c => c.platform))];

      // Run for all platforms
      for (const p of platforms) {
        await engagementBot.runBotCycle(req.company.id, p);
      }

      res.json({
        success: true,
        message: `Engagement cycle triggered for ${platforms.length} platform(s)`,
        company_id: req.company.id,
        platforms
      });
    }
  } catch (error) {
    logger.error('Error triggering engagement cycle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/bot/status
 * Get engagement bot status and next run time
 */
router.get('/bot/status', requireAuth, async (req, res) => {
  try {
    const status = engagementBot.getBotStatus();

    res.json({
      success: true,
      status
    });
  } catch (error) {
    logger.error('Error getting bot status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/config/:id
 * Get specific engagement bot config
 */
router.get('/config/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const { data: config, error } = await supabase
      .from('engagement_bot_configs')
      .select('*')
      .eq('id', req.params.id)
      .eq('company_id', req.company.id)
      .single();

    if (error || !config) {
      return res.status(404).json({
        success: false,
        error: 'Config not found'
      });
    }

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Error fetching config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engagement/config
 * Create new engagement bot config
 * Body: { platform, target_hashtags, actions, limits, active_hours, timezone, ... }
 */
router.post('/config', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const {
      platform,
      target_hashtags = [],
      actions = {},
      limits = {},
      active_hours = {},
      timezone = 'UTC'
    } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'platform required'
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: config, error } = await supabase
      .from('engagement_bot_configs')
      .insert({
        company_id: req.company.id,
        platform,
        target_hashtags,
        actions,
        limits,
        active_hours,
        timezone,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`Created engagement config for ${platform}`);

    res.status(201).json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Error creating config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/engagement/config/:id
 * Update engagement bot config
 */
router.put('/config/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    // Verify ownership
    const { data: existing } = await supabase
      .from('engagement_bot_configs')
      .select('id')
      .eq('id', req.params.id)
      .eq('company_id', req.company.id)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Config not found'
      });
    }

    const { data: config, error } = await supabase
      .from('engagement_bot_configs')
      .update({
        ...req.body,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Error updating config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/engagement/config/:id
 * Deactivate engagement bot config
 */
router.delete('/config/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('engagement_bot_configs')
      .select('id')
      .eq('id', req.params.id)
      .eq('company_id', req.company.id)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Config not found'
      });
    }

    const { error } = await supabase
      .from('engagement_bot_configs')
      .update({ is_active: false })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Config deactivated'
    });
  } catch (error) {
    logger.error('Error deleting config:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/bot/activity-log
 * Get engagement bot activity log for company
 * Query: ?limit=50&offset=0&action_type=like&platform=instagram
 */
router.get('/bot/activity-log', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { action_type, platform } = req.query;

    let query = supabase
      .from('engagement_log')
      .select('*', { count: 'exact' })
      .eq('company_id', req.company.id);

    if (action_type) query = query.eq('action_type', action_type);
    if (platform) query = query.eq('platform', platform);

    const { data: logs, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      logs: logs || [],
      pagination: {
        limit,
        offset,
        total: count || 0
      }
    });
  } catch (error) {
    logger.error('Error fetching activity log:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/bot/stats
 * Get engagement bot statistics
 * Query: ?period=today|week|month&platform=instagram
 */
router.get('/bot/stats', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { period = 'today', platform } = req.query;

    // Calculate date range
    const now = new Date();
    let since = new Date();

    if (period === 'week') {
      since.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      since.setDate(now.getDate() - 30);
    } else {
      since.setHours(0, 0, 0, 0);
    }

    let query = supabase
      .from('engagement_log')
      .select('*')
      .eq('company_id', req.company.id)
      .gte('created_at', since.toISOString());

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: logs } = await query;

    // Aggregate stats
    const stats = {
      total_actions: logs?.length || 0,
      likes: 0,
      comments: 0,
      follows: 0,
      success_rate: 0,
      by_platform: {}
    };

    if (logs && logs.length > 0) {
      let successCount = 0;

      logs.forEach(log => {
        if (log.success) successCount++;

        stats[`${log.action_type}s`] = (stats[`${log.action_type}s`] || 0) + 1;

        if (!stats.by_platform[log.platform]) {
          stats.by_platform[log.platform] = {
            total: 0,
            likes: 0,
            comments: 0,
            follows: 0,
            success: 0
          };
        }

        const p = stats.by_platform[log.platform];
        p.total++;
        p[`${log.action_type}s`]++;
        if (log.success) p.success++;
      });

      stats.success_rate = Math.round((successCount / logs.length) * 100);
    }

    res.json({
      success: true,
      period,
      stats
    });
  } catch (error) {
    logger.error('Error fetching bot stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
