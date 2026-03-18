/**
 * Engagement Routes
 * Manage engagement bot configs, templates, and activity logs
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');

/**
 * GET /api/engagement/config
 * Get bot config for current company + platform
 */
router.get('/config', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { platform } = req.query;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('engagement_bot_configs')
      .select('*')
      .eq('company_id', req.company.id);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: configs, error } = await query;

    if (error) {
      logger.error('Get engagement config error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      configs: configs || []
    });
  } catch (error) {
    logger.error('Get engagement config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/engagement/config
 * Update bot config
 */
router.put('/config', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id, platform, enabled, settings } = req.body;

    if (!id || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, platform'
      });
    }

    const supabase = getSupabaseAdmin();

    // Verify config belongs to this company
    const { data: existing } = await supabase
      .from('engagement_bot_configs')
      .select('id')
      .eq('id', id)
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
        ...(typeof enabled === 'boolean' && { enabled }),
        ...(settings && { settings }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Update engagement config error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      config
    });
  } catch (error) {
    logger.error('Update engagement config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/templates
 * List comment/reply templates
 */
router.get('/templates', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: templates, error } = await supabase
      .from('engagement_templates')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('List templates error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      templates: templates || []
    });
  } catch (error) {
    logger.error('List templates error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/engagement/templates
 * Add template
 */
router.post('/templates', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { name, content, type } = req.body;

    if (!name || !content || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, content, type'
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: template, error } = await supabase
      .from('engagement_templates')
      .insert({
        company_id: req.company.id,
        name,
        content,
        type,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Create template error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      template
    });
  } catch (error) {
    logger.error('Create template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/engagement/templates/:id
 * Update template
 */
router.put('/templates/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, content, type } = req.body;

    const supabase = getSupabaseAdmin();

    // Verify template belongs to this company
    const { data: existing } = await supabase
      .from('engagement_templates')
      .select('id')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const { data: template, error } = await supabase
      .from('engagement_templates')
      .update({
        ...(name && { name }),
        ...(content && { content }),
        ...(type && { type })
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Update template error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    logger.error('Update template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/engagement/templates/:id
 * Deactivate template
 */
router.delete('/templates/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;

    const supabase = getSupabaseAdmin();

    // Verify template belongs to this company
    const { data: existing } = await supabase
      .from('engagement_templates')
      .select('id')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const { error } = await supabase
      .from('engagement_templates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      logger.error('Delete template error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Template deactivated'
    });
  } catch (error) {
    logger.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/log
 * Paginated engagement activity log
 */
router.get('/log', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const supabase = getSupabaseAdmin();
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const offsetNum = parseInt(offset) || 0;

    const { data: logs, error, count } = await supabase
      .from('engagement_log')
      .select('*', { count: 'exact' })
      .eq('company_id', req.company.id)
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) {
      logger.error('List engagement log error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      logs: logs || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count
      }
    });
  } catch (error) {
    logger.error('List engagement log error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/stats
 * Summary stats (likes/comments/follows today)
 */
router.get('/stats', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get engagement stats from log (this is a simple implementation)
    // In production, you might want to calculate these from actual social media APIs
    const { data: logs } = await supabase
      .from('engagement_log')
      .select('action_type, action_count')
      .eq('company_id', req.company.id)
      .gte('created_at', today.toISOString());

    // Aggregate the data
    const stats = {
      likes: 0,
      comments: 0,
      follows: 0,
      timestamp: new Date().toISOString()
    };

    (logs || []).forEach(log => {
      if (log.action_type === 'like') stats.likes += log.action_count || 0;
      if (log.action_type === 'comment') stats.comments += log.action_count || 0;
      if (log.action_type === 'follow') stats.follows += log.action_count || 0;
    });

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Get engagement stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/status
 * Alias for /api/engagement/config - Frontend compatibility
 */
router.get('/status', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const { data: configs, error } = await supabase
      .from('engagement_bot_configs')
      .select('*')
      .eq('company_id', req.company.id);

    if (error) {
      logger.error('Get engagement status error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: {
        enabled: configs && configs.length > 0 && configs[0].enabled,
        configs: configs || []
      }
    });
  } catch (error) {
    logger.error('Get engagement status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/engagement/status
 * Alias for updating bot enabled status - Frontend compatibility
 */
router.put('/status', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { enabled } = req.body;
    const supabase = getSupabaseAdmin();

    // Get or create config for primary platform
    const { data: existing } = await supabase
      .from('engagement_bot_configs')
      .select('*')
      .eq('company_id', req.company.id)
      .limit(1)
      .single();

    if (!existing) {
      // Create new config
      const { data: config, error } = await supabase
        .from('engagement_bot_configs')
        .insert([{
          company_id: req.company.id,
          platform: 'all',
          enabled: enabled !== undefined ? enabled : true,
          settings: {}
        }])
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, data: config });
    }

    // Update existing config
    const { data: config, error } = await supabase
      .from('engagement_bot_configs')
      .update({
        enabled: enabled !== undefined ? enabled : existing.enabled,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Update engagement status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/hashtags
 * Get hashtags for engagement automation
 */
router.get('/hashtags', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    // For now, return empty hashtags. In production, fetch from DB or config
    res.json({
      success: true,
      data: {
        hashtags: [],
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Get engagement hashtags error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/engagement/hashtags
 * Update hashtags for engagement automation
 */
router.put('/hashtags', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { hashtags } = req.body;

    // In production, save to config/DB
    res.json({
      success: true,
      data: {
        hashtags: hashtags || [],
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Update engagement hashtags error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/engagement/activities
 * Alias for /api/engagement/log - Frontend compatibility
 */
router.get('/activities', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();

    const { data: activities, error } = await supabase
      .from('engagement_log')
      .select('*')
      .eq('company_id', req.company.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Get engagement activities error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      data: activities || []
    });
  } catch (error) {
    logger.error('Get engagement activities error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
