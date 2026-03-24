/**
 * Pipeline Routes
 * Approve jobs, trigger processing, one-off runs
 */

const express = require('express');
const router = express.Router();
const { getSupabase } = require('../db/local-adapter');
const { runPipeline, processApprovedJobs } = require('../services/pipeline.v2');
const airtable = require('../services/airtable.service');
const logger = require('../utils/logger');

// POST /api/pipeline/approve/:id
// Approve a pending job and optionally supply pipeline overrides
router.post('/approve/:id', async (req, res) => {
  const { id } = req.params;
  const overrides = req.body || {};

  try {
    const db = getSupabase();

    // Persist avatar + layout choices to the job record so they survive restarts
    const updateFields = {
      review_status: 'approved',
      reviewed_at: new Date().toISOString(),
    };
    if (overrides.avatar_name) updateFields.avatar_name = overrides.avatar_name;
    if (overrides.layout)      updateFields.layout_type = overrides.layout;

    const { data: job, error } = await db
      .from('content_jobs')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    // Update Airtable
    if (job.airtable_record_id) {
      await airtable.updateContentRecord(job.airtable_record_id, { Status: 'Processing' }).catch(() => {});
    }

    // If overrides have 'run_now: true', kick off pipeline immediately
    if (overrides.run_now) {
      runPipeline(job, overrides).catch(e => logger.error(`Pipeline failed for ${id}: ${e.message}`));
    }

    res.json({ success: true, job, message: 'Job approved' + (overrides.run_now ? ' and pipeline started' : '') });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pipeline/reject/:id
router.post('/reject/:id', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  try {
    const db = getSupabase();
    const { data: job } = await db
      .from('content_jobs')
      .update({ review_status: 'rejected', error_message: reason || 'Rejected' })
      .eq('id', id)
      .select()
      .single();

    if (job?.airtable_record_id) {
      await airtable.updateContentRecord(job.airtable_record_id, { Status: 'Trash' }).catch(() => {});
    }

    res.json({ success: true, message: 'Job rejected' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pipeline/run/:id
// Run pipeline for a specific already-approved job (with overrides)
router.post('/run/:id', async (req, res) => {
  const { id } = req.params;
  const overrides = req.body || {};

  try {
    const db = getSupabase();

    // Persist avatar choice if provided in overrides
    if (overrides.avatar_name) {
      await db.from('content_jobs').update({ avatar_name: overrides.avatar_name }).eq('id', id);
    }

    const { data: job } = await db.from('content_jobs').select('*').eq('id', id).single();
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    // Kick off async — respond immediately
    res.json({ success: true, message: 'Pipeline started', jobId: id });
    runPipeline(job, overrides).catch(e => logger.error(`Pipeline error ${id}: ${e.message}`));

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pipeline/process-all
// Process all approved jobs (batch)
router.post('/process-all', async (req, res) => {
  try {
    res.json({ success: true, message: 'Batch processing started' });
    processApprovedJobs().catch(e => logger.error(`Batch process error: ${e.message}`));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pipeline/rerun/:id
// Reset a job to draft and re-run the full pipeline from scratch
router.post('/rerun/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = getSupabase();
    const { data: job, error } = await db
      .from('content_jobs')
      .update({
        publish_status: 'draft',
        processing_step: null,
        review_status: 'approved',
        failed_at: null,
        failed_stage: null,
        error_message: null,
        publer_post_id: null,
        retry_count: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    res.json({ success: true, message: 'Pipeline restarted', jobId: id });
    runPipeline(job, req.body || {}).catch(e => logger.error(`Rerun pipeline error ${id}: ${e.message}`));
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/pipeline/one-off
// Create + immediately run a one-off job from a URL
router.post('/one-off', async (req, res) => {
  const { source_url, overrides = {} } = req.body;
  if (!source_url) return res.status(400).json({ success: false, error: 'source_url required' });

  try {
    const db = getSupabase();
    const { data: job, error } = await db
      .from('content_jobs')
      .insert([{
        source_url,
        source_title: overrides.title || 'One-off job',
        source_content: overrides.content || '',
        source_author: overrides.author || 'u/unknown',
        review_status: 'approved',
        publish_status: 'draft',
        one_off_run: 1,
        avatar_name: overrides.avatar_name || null
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, message: 'One-off job created and queued', jobId: job.id });
    runPipeline(job, overrides).catch(e => logger.error(`One-off pipeline error: ${e.message}`));

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// POST /api/pipeline/process-now
// Approve all pending_review/queued jobs then run the pipeline
router.post('/process-now', async (req, res) => {
  try {
    const { 'x-company-id': companyId } = req.headers;
    const { getSupabaseAdmin } = require('../db/supabase');
    const db = getSupabaseAdmin();

    // First: approve all jobs that are pending_review or queued
    const { data: pending } = await db
      .from('content_jobs')
      .update({ review_status: 'approved' })
      .eq('company_id', companyId)
      .in('review_status', ['pending_review', 'queued'])
      .eq('publish_status', 'draft')
      .select('id');

    const approved = pending ? pending.length : 0;
    logger.info(`process-now: approved ${approved} jobs for company ${companyId}`);

    // Then: trigger the pipeline
    res.json({ success: true, message: `Processing started — ${approved} job(s) queued`, approved });
    processApprovedJobs().catch(e => logger.error(`process-now error: ${e.message}`));
  } catch (e) {
    logger.error('POST /pipeline/process-now error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
