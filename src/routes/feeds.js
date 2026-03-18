/**
 * RSS Feeds Routes
 * Manage RSS feeds for companies
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');

/**
 * GET /api/feeds
 * List RSS feeds for current company
 */
router.get('/', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data: feeds, error } = await supabase
      .from('rss_feeds')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('List feeds error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      feeds: feeds || []
    });
  } catch (error) {
    logger.error('List feeds error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/feeds
 * Add new feed
 */
router.post('/', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { name, url, type } = req.body;

    if (!name || !url || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, url, type'
      });
    }

    const supabase = getSupabaseAdmin();
    const { data: feed, error } = await supabase
      .from('rss_feeds')
      .insert({
        company_id: req.company.id,
        name,
        url,
        type,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Create feed error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.status(201).json({
      success: true,
      feed
    });
  } catch (error) {
    logger.error('Create feed error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/feeds/:id
 * Update feed
 */
router.put('/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, type } = req.body;

    const supabase = getSupabaseAdmin();

    // Verify feed belongs to this company
    const { data: existingFeed } = await supabase
      .from('rss_feeds')
      .select('id')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!existingFeed) {
      return res.status(404).json({
        success: false,
        error: 'Feed not found'
      });
    }

    const { data: feed, error } = await supabase
      .from('rss_feeds')
      .update({
        ...(name && { name }),
        ...(url && { url }),
        ...(type && { type }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Update feed error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      feed
    });
  } catch (error) {
    logger.error('Update feed error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/feeds/:id
 * Deactivate feed (soft delete)
 */
router.delete('/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;

    const supabase = getSupabaseAdmin();

    // Verify feed belongs to this company
    const { data: existingFeed } = await supabase
      .from('rss_feeds')
      .select('id')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!existingFeed) {
      return res.status(404).json({
        success: false,
        error: 'Feed not found'
      });
    }

    const { error } = await supabase
      .from('rss_feeds')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      logger.error('Delete feed error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Feed deactivated'
    });
  } catch (error) {
    logger.error('Delete feed error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/feeds/:id/check
 * Trigger immediate feed check
 */
router.post('/:id/check', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;

    const supabase = getSupabaseAdmin();

    // Verify feed belongs to this company
    const { data: feed } = await supabase
      .from('rss_feeds')
      .select('*')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!feed) {
      return res.status(404).json({
        success: false,
        error: 'Feed not found'
      });
    }

    // Update last_checked timestamp
    const { error } = await supabase
      .from('rss_feeds')
      .update({
        last_checked: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      logger.error('Check feed error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    // In production, this would trigger a background job
    logger.info(`Feed check triggered for feed ${id}`);

    res.json({
      success: true,
      message: 'Feed check started'
    });
  } catch (error) {
    logger.error('Check feed error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
