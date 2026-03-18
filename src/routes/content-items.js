/**
 * Content Items Routes
 * Manage content items (RSS articles) for review and posting
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin } = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireCompanyContext } = require('../middleware/companyContext');
const logger = require('../utils/logger');

/**
 * GET /api/content-items
 * Paginated list for current company
 * Supports ?status=pending&feed_id=xxx&limit=20&offset=0
 */
router.get('/', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { status, feed_id, limit = 20, offset = 0 } = req.query;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('content_items')
      .select('*, rss_feeds(name, url)', { count: 'exact' })
      .eq('company_id', req.company.id);

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Filter by feed_id if provided
    if (feed_id) {
      query = query.eq('feed_id', feed_id);
    }

    // Pagination
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;

    const { data: items, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (error) {
      logger.error('List content items error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      items: items || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: count
      }
    });
  } catch (error) {
    logger.error('List content items error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-items/:id
 * Get single item
 */
router.get('/:id', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;

    const supabase = getSupabaseAdmin();
    const { data: item, error } = await supabase
      .from('content_items')
      .select('*, rss_feeds(name, url)')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (error || !item) {
      return res.status(404).json({
        success: false,
        error: 'Content item not found'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    logger.error('Get content item error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-items/:id/approve
 * Approve for post generation
 */
router.post('/:id/approve', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { job_type, target_platforms } = req.body;

    if (!job_type || !target_platforms) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: job_type, target_platforms'
      });
    }

    const supabase = getSupabaseAdmin();

    // Verify item exists and belongs to this company
    const { data: item } = await supabase
      .from('content_items')
      .select('id')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Content item not found'
      });
    }

    // Update status to approved
    const { error: updateError } = await supabase
      .from('content_items')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id
      })
      .eq('id', id);

    if (updateError) {
      logger.error('Approve content item error:', updateError);
      return res.status(500).json({
        success: false,
        error: updateError.message
      });
    }

    // Create content job
    const { data: job, error: jobError } = await supabase
      .from('content_jobs')
      .insert({
        content_item_id: id,
        company_id: req.company.id,
        job_type,
        target_platforms: Array.isArray(target_platforms) ? target_platforms : [target_platforms],
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError) {
      logger.error('Create content job error:', jobError);
      return res.status(500).json({
        success: false,
        error: jobError.message
      });
    }

    res.json({
      success: true,
      item: { id },
      job
    });
  } catch (error) {
    logger.error('Approve content item error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-items/:id/reject
 * Reject content item
 */
router.post('/:id/reject', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const supabase = getSupabaseAdmin();

    // Verify item exists
    const { data: item } = await supabase
      .from('content_items')
      .select('id')
      .eq('id', id)
      .eq('company_id', req.company.id)
      .single();

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Content item not found'
      });
    }

    // Update status to rejected
    const { error } = await supabase
      .from('content_items')
      .update({
        status: 'rejected',
        rejection_reason: reason || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id
      })
      .eq('id', id);

    if (error) {
      logger.error('Reject content item error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    res.json({
      success: true,
      message: 'Content item rejected'
    });
  } catch (error) {
    logger.error('Reject content item error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-items/batch-approve
 * Approve multiple items at once
 */
router.post('/batch-approve', requireAuth, requireCompanyContext, async (req, res) => {
  try {
    const { ids, job_type, target_platforms } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ids (array), job_type, target_platforms'
      });
    }

    if (!job_type || !target_platforms) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: job_type, target_platforms'
      });
    }

    const supabase = getSupabaseAdmin();

    // Update all items to approved
    const { error: updateError } = await supabase
      .from('content_items')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id
      })
      .in('id', ids)
      .eq('company_id', req.company.id);

    if (updateError) {
      logger.error('Batch approve error:', updateError);
      return res.status(500).json({
        success: false,
        error: updateError.message
      });
    }

    // Create content jobs for each item
    const jobs = ids.map(contentItemId => ({
      content_item_id: contentItemId,
      company_id: req.company.id,
      job_type,
      target_platforms: Array.isArray(target_platforms) ? target_platforms : [target_platforms],
      status: 'pending',
      created_at: new Date().toISOString()
    }));

    const { data: createdJobs, error: jobError } = await supabase
      .from('content_jobs')
      .insert(jobs)
      .select();

    if (jobError) {
      logger.error('Batch create jobs error:', jobError);
      // Don't fail - items are already approved
      logger.warn('Items approved but job creation failed');
    }

    res.json({
      success: true,
      approvedCount: ids.length,
      jobsCreated: createdJobs?.length || 0
    });
  } catch (error) {
    logger.error('Batch approve error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
