/**
 * Content Jobs Routes
 * Handles job management for content generation and publishing
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin, createSupabaseClient } = require('../db/supabase');
const logger = require('../utils/logger');

/**
 * GET /api/content-jobs
 * List all content jobs for a company
 */
router.get('/', async (req, res) => {
  try {
    const { 'x-company-id': companyId } = req.headers;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    const client = getSupabaseAdmin();

    const { data, error } = await client
      .from('content_jobs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch content jobs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch jobs'
      });
    }

    res.json({
      success: true,
      data: data || []
    });

  } catch (error) {
    logger.error('GET /content-jobs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-jobs
 * Create a new content job
 */
router.post('/', async (req, res) => {
  try {
    const { 'x-company-id': companyId, authorization } = req.headers;
    const { contentItemId, type, platforms, firstComment } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    if (!contentItemId || !type) {
      return res.status(400).json({
        success: false,
        error: 'contentItemId and type are required'
      });
    }

    const client = getSupabaseAdmin();

    const jobData = {
      company_id: companyId,
      content_item_id: contentItemId,
      type,
      platforms: platforms || [],
      first_comment: firstComment || '',
      status: 'queued',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from('content_jobs')
      .insert([jobData])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create content job:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create job'
      });
    }

    res.status(201).json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('POST /content-jobs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-jobs/:id
 * Get a specific content job
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 'x-company-id': companyId } = req.headers;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    const client = getSupabaseAdmin();

    const { data, error } = await client
      .from('content_jobs')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('GET /content-jobs/:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/content-jobs/:id
 * Update a content job
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 'x-company-id': companyId } = req.headers;
    const updates = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    const client = getSupabaseAdmin();

    // Verify job belongs to company
    const { data: existing, error: checkError } = await client
      .from('content_jobs')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Update the job
    const { data, error } = await client
      .from('content_jobs')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update content job:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update job'
      });
    }

    res.json({
      success: true,
      data
    });

  } catch (error) {
    logger.error('PATCH /content-jobs/:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-jobs/:id/retry
 * Retry a failed content job
 */
router.post('/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const { 'x-company-id': companyId } = req.headers;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    const client = getSupabaseAdmin();

    // Verify job exists and belongs to company
    const { data: existing, error: checkError } = await client
      .from('content_jobs')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (checkError || !existing) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Reset job status to queued
    const { data, error } = await client
      .from('content_jobs')
      .update({
        status: 'queued',
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to retry content job:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to retry job'
      });
    }

    res.json({
      success: true,
      data,
      message: 'Job queued for retry'
    });

  } catch (error) {
    logger.error('POST /content-jobs/:id/retry error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
