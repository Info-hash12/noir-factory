const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const videoPipelineService = require('../services/pipeline.service');
const shotstackService = require('../services/shotstack.service');
const metricoolService = require('../services/metricool.service');
const { getSupabase } = require('../db/local-adapter');

router.post('/jobs/process/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }

    logger.info(`Starting pipeline processing for job: ${id}`);

    setImmediate(async () => {
      try {
        await videoPipelineService.processJob(id);
      } catch (error) {
        logger.error(`Background pipeline processing failed for ${id}:`, error.message);
      }
    });

    res.json({
      success: true,
      jobId: id,
      message: 'Pipeline processing started in background',
      status: 'processing'
    });

  } catch (error) {
    logger.error('Pipeline processing endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/jobs/batch-process', async (req, res) => {
  try {
    const { jobIds, maxConcurrent = 3 } = req.body;

    if (!jobIds || !Array.isArray(jobIds)) {
      return res.status(400).json({
        success: false,
        error: 'jobIds array is required'
      });
    }

    logger.info(`Starting batch processing for ${jobIds.length} jobs`);

    const results = {
      total: jobIds.length,
      started: 0,
      failed: 0
    };

    for (let i = 0; i < jobIds.length; i += maxConcurrent) {
      const batch = jobIds.slice(i, i + maxConcurrent);

      await Promise.allSettled(
        batch.map(jobId => 
          videoPipelineService.processJob(jobId)
            .then(() => {
              results.started++;
            })
            .catch(error => {
              results.failed++;
              logger.error(`Batch job ${jobId} failed:`, error.message);
            })
        )
      );
    }

    res.json({
      success: true,
      message: 'Batch processing completed',
      results: results
    });

  } catch (error) {
    logger.error('Batch processing endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/jobs/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    const { data: job, error } = await supabase
      .from('content_jobs')
      .select('id, status, pipeline_status, shotstack_render_id, metricool_draft_id, updated_at')
      .eq('id', id)
      .single();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: job
    });

  } catch (error) {
    logger.error('Job status endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/jobs/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    const { data: job, error } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Only failed jobs can be retried'
      });
    }

    await supabase
      .from('content_jobs')
      .update({ status: 'pending', pipeline_status: 'Retry requested' })
      .eq('id', id);

    setImmediate(async () => {
      try {
        await videoPipelineService.processJob(id);
      } catch (error) {
        logger.error(`Retry processing failed for ${id}:`, error.message);
      }
    });

    res.json({
      success: true,
      jobId: id,
      message: 'Job retry started'
    });

  } catch (error) {
    logger.error('Job retry endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/metricool/drafts', async (req, res) => {
  try {
    const { videoUrl, title, description, platform, schedule } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'videoUrl is required'
      });
    }

    logger.info('Creating Metricool draft manually:', title);

    const videoData = {
      url: videoUrl,
      title: title || 'Noir Factory Video',
      description: description || '',
      tags: req.body.tags || []
    };

    const result = await metricoolService.createDraft(videoData, platform, schedule);

    res.json(result);

  } catch (error) {
    logger.error('Metricool draft creation endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/shotstack/status/:id', async (req, res) => {
  try {
    const { id } = req.params;

    logger.info(`Checking Shotstack render status: ${id}`);

    const status = await shotstackService.getRenderStatus(id);

    res.json(status);

  } catch (error) {
    logger.error('Shotstack status endpoint failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/shotstack/callback', async (req, res) => {
  try {
    const { id, status, url, error: renderError } = req.body;

    logger.info(`Shotstack callback received for ${id}: ${status}`);

    const supabase = getSupabase();

    if (status === 'done' && url) {
      await supabase
        .from('content_jobs')
        .update({
          shotstack_video_url: url,
          pipeline_status: 'Shotstack render completed'
        })
        .eq('shotstack_render_id', id);

      logger.info(`Shotstack render ${id} completed successfully`);
    } else if (status === 'failed') {
      await supabase
        .from('content_jobs')
        .update({
          status: 'failed',
          pipeline_status: `Shotstack render failed: ${renderError}`
        })
        .eq('shotstack_render_id', id);

      logger.error(`Shotstack render ${id} failed:`, renderError);
    }

    res.json({
      success: true,
      message: 'Callback processed'
    });

  } catch (error) {
    logger.error('Shotstack callback processing failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
