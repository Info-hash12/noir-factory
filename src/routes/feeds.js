/**
 * RSS Feeds Routes — Supabase-backed
 */
const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');

// GET /api/feeds
router.get('/', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('rss_feeds')
      .select('*')
      .eq('company_id', req.company.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const feeds = (data || []).map(f => ({
      id: f.id, name: f.feed_name, url: f.feed_url, type: f.feed_type,
      is_active: f.is_active, last_checked_at: f.last_checked_at, created_at: f.created_at
    }));
    res.json({ success: true, feeds });
  } catch (error) {
    logger.error('List feeds error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/feeds
router.post('/', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { name, url, type } = req.body;
    if (!name || !url) return res.status(400).json({ success: false, error: 'Name and URL required' });

    // Validate feed type
    const validTypes = ['generic', 'rss', 'reddit', 'twitter', 'x_twitter', 'instagram', 'tiktok', 'linkedin', 'competitor', 'news', 'youtube'];
    const feedType = type || 'generic';
    if (!validTypes.includes(feedType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid feed type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // For competitor feeds, validate that URL is provided (will be a social media profile URL)
    if (feedType === 'competitor' && !url) {
      return res.status(400).json({
        success: false,
        error: 'Competitor feeds require a social media profile URL'
      });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('rss_feeds')
      .insert({
        company_id: req.company.id,
        feed_name: name,
        feed_url: url,
        feed_type: feedType,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ success: true, feed: {
      id: data.id, name: data.feed_name, url: data.feed_url, type: data.feed_type,
      is_active: data.is_active, created_at: data.created_at
    }});
  } catch (error) {
    logger.error('Create feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/feeds/:id
router.put('/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { name, url, type } = req.body;
    const updates = { updated_at: new Date().toISOString() };
    if (name) updates.feed_name = name;
    if (url) updates.feed_url = url;
    if (type) {
      // Validate feed type
      const validTypes = ['generic', 'rss', 'reddit', 'twitter', 'x_twitter', 'instagram', 'tiktok', 'linkedin', 'competitor', 'news', 'youtube'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid feed type. Must be one of: ${validTypes.join(', ')}`
        });
      }
      updates.feed_type = type;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('rss_feeds')
      .update(updates).eq('id', req.params.id).eq('company_id', req.company.id).select().single();

    if (error) throw error;
    res.json({ success: true, feed: data });
  } catch (error) {
    logger.error('Update feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/feeds/:id
router.delete('/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('rss_feeds')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('company_id', req.company.id);

    if (error) throw error;
    res.json({ success: true, message: 'Feed deactivated' });
  } catch (error) {
    logger.error('Delete feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/feeds/:id/check
router.post('/:id/check', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('rss_feeds')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('company_id', req.company.id);

    logger.info(`Feed check triggered for ${req.params.id}`);
    res.json({ success: true, message: 'Feed check started' });
  } catch (error) {
    logger.error('Check feed error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
