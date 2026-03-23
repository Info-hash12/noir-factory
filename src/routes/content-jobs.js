/**
 * Content Jobs Routes
 * Handles job management for content generation and publishing
 */

const express = require('express');
const router = express.Router();
const { getSupabaseAdmin, createSupabaseClient } = require('../db/supabase');
const { repurposeForPlatforms, getRepurposedJobs } = require('../services/repurpose.service');
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
    // Accept both camelCase (legacy) and snake_case (frontend) field names
    const {
      contentItemId, content_item_id,
      type, job_type,
      platforms, target_platforms,
      firstComment, first_comment,
      avatar_name, caption_text, hashtags_text,
      hook_text, on_screen_text, layout_type,
      is_evergreen, evergreen_interval_days
    } = req.body;
    const resolvedItemId = contentItemId || content_item_id;
    const resolvedType = type || job_type || 'video_with_avatar';
    const resolvedPlatforms = platforms || target_platforms || [];
    const resolvedFirstComment = firstComment || first_comment || '';

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    if (!resolvedItemId) {
      return res.status(400).json({
        success: false,
        error: 'content_item_id is required'
      });
    }

    const client = getSupabaseAdmin();

    const jobData = {
      company_id: companyId,
      content_item_id: resolvedItemId,
      job_type: resolvedType,
      target_platforms: resolvedPlatforms,
      first_comment_text: resolvedFirstComment,
      avatar_name: avatar_name || null,
      caption_text: caption_text || null,
      hashtags_text: hashtags_text || null,
      hook_text: hook_text || null,
      on_screen_text: on_screen_text || null,
      layout_type: layout_type || null,
      is_evergreen: is_evergreen || false,
      evergreen_interval_days: evergreen_interval_days || null,
      review_status: 'pending_review',
      publish_status: 'draft',
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
 * POST /api/content-jobs/:id/repurpose
 * Create repurposed versions of a content job for multiple platforms
 * Body: { platforms: ['instagram', 'facebook', 'tiktok'] }
 */
router.post('/:id/repurpose', async (req, res) => {
  try {
    const { id } = req.params;
    const { 'x-company-id': companyId } = req.headers;
    const { platforms } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    if (!Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'platforms array is required and must have at least one platform'
      });
    }

    const client = getSupabaseAdmin();

    // Verify parent job exists and belongs to company
    const { data: parentJob, error: parentError } = await client
      .from('content_jobs')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (parentError || !parentJob) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Create repurposed jobs for each platform
    const childJobs = await repurposeForPlatforms(parentJob, platforms, companyId);

    res.status(201).json({
      success: true,
      message: `Created ${childJobs.length} repurposed job(s)`,
      parent_job_id: id,
      child_jobs: childJobs
    });
  } catch (error) {
    logger.error('POST /content-jobs/:id/repurpose error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/content-jobs/:id/repurposed
 * Get all repurposed versions of a content job
 */
router.get('/:id/repurposed', async (req, res) => {
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

    // Verify parent job exists and belongs to company
    const { data: parentJob, error: parentError } = await client
      .from('content_jobs')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (parentError || !parentJob) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Get all child jobs
    const childJobs = await getRepurposedJobs(id);

    res.json({
      success: true,
      parent_job_id: id,
      count: childJobs.length,
      data: childJobs
    });
  } catch (error) {
    logger.error('GET /content-jobs/:id/repurposed error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-jobs/generate-text
 * Generate text using OpenRouter API with company prompts
 */
router.post('/generate-text', async (req, res) => {
  try {
    const { 'x-company-id': companyId } = req.headers;
    const { prompt_type, context } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    if (!prompt_type || !context) {
      return res.status(400).json({
        success: false,
        error: 'prompt_type and context are required'
      });
    }

    const client = getSupabaseAdmin();

    // Get saved prompt for this type
    let { data: promptData, error: promptError } = await client
      .from('company_prompts')
      .select('*')
      .eq('company_id', companyId)
      .eq('prompt_type', prompt_type)
      .single();

    if (promptError && promptError.code !== 'PGRST116') {
      logger.warn('Error fetching prompt:', promptError);
    }

    // Default prompts
    const defaultPrompts = {
      script_generation: 'Write a compelling short video script based on this content:',
      hook: 'Write an engaging hook that grabs attention immediately:',
      caption: 'Write a catchy caption for this content:',
      hashtags: 'Generate 5-10 relevant hashtags for this content:',
      first_comment: 'Write a compelling first comment to engage viewers:'
    };

    const systemPrompt = promptData?.system_prompt || defaultPrompts[prompt_type] || 'You are a social media content expert.';
    const userTemplate = promptData?.user_prompt_template || defaultPrompts[prompt_type] || 'Create content based on:';

    // Call OpenRouter API
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterApiKey) {
      return res.status(500).json({
        success: false,
        error: 'OpenRouter API key not configured'
      });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openrouterApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${userTemplate}\n\n${context}` }
        ],
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error('OpenRouter API error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate text'
      });
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content || '';

    res.json({
      success: true,
      text: generatedText
    });

  } catch (error) {
    logger.error('POST /content-jobs/generate-text error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/content-jobs/reorder
 * Reorder queued jobs by priority
 */
router.post('/reorder', async (req, res) => {
  try {
    const { 'x-company-id': companyId } = req.headers;
    const { job_ids } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: 'X-Company-ID header is required'
      });
    }

    if (!Array.isArray(job_ids) || job_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'job_ids array is required'
      });
    }

    const client = getSupabaseAdmin();

    // Update queue_priority for each job in the provided order
    const updates = job_ids.map((jobId, index) => ({
      id: jobId,
      queue_priority: index + 1,
      updated_at: new Date().toISOString()
    }));

    // Update all jobs in parallel
    const updatePromises = updates.map(update =>
      client
        .from('content_jobs')
        .update({
          queue_priority: update.queue_priority,
          updated_at: update.updated_at
        })
        .eq('id', update.id)
        .eq('company_id', companyId)
    );

    const results = await Promise.all(updatePromises);

    // Check for any errors
    const hasError = results.some(result => result.error);
    if (hasError) {
      logger.error('Failed to update some jobs:', results);
      return res.status(500).json({
        success: false,
        error: 'Failed to update all jobs'
      });
    }

    // Fetch updated jobs
    const { data, error } = await client
      .from('content_jobs')
      .select('*')
      .eq('company_id', companyId)
      .in('id', job_ids)
      .order('queue_priority', { ascending: true });

    if (error) {
      logger.error('Failed to fetch updated jobs:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch updated jobs'
      });
    }

    res.json({
      success: true,
      data: data || [],
      message: 'Jobs reordered successfully'
    });

  } catch (error) {
    logger.error('POST /content-jobs/reorder error:', error);
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


/**
 * DELETE /api/content-jobs/:id
 * Delete a content job
 */
router.delete('/:id', async (req, res) => {
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

    // Check if job is processing
    if (existing.status === 'processing') {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete a job that is currently processing'
      });
    }

    // Delete the job
    const { error: deleteError } = await client
      .from('content_jobs')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logger.error('Failed to delete content job:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete job'
      });
    }

    res.json({
      success: true,
      message: 'Content job deleted'
    });

  } catch (error) {
    logger.error('DELETE /content-jobs/:id error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
