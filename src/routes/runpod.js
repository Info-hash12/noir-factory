/**
 * RunPod API Routes
 * Direct access to RunPod GPU worker endpoints
 */

const express = require('express');
const router = express.Router();
const { submitJob, pollJobStatus, submitAndWait, checkWorkerHealth } = require('../services/video/runpod-client');
const logger = require('../utils/logger');

/**
 * POST /api/runpod/jobs
 * Submit a new job to RunPod worker
 * 
 * Body:
 * {
 *   "task_type": "generate_base" | "dub_video",
 *   "image_url": "https://...",  // For generate_base
 *   "prompt": "person speaking",  // For generate_base
 *   "num_frames": 120,            // For generate_base
 *   "video_url": "https://...",   // For dub_video
 *   "audio_url": "https://...",   // For dub_video
 *   "lip_sync_strength": 1.0,     // For dub_video
 *   "wait": false                 // If true, waits for completion
 * }
 */
router.post('/jobs', async (req, res) => {
  try {
    const { task_type, wait = false, ...params } = req.body;
    
    // Validate task_type
    if (!task_type) {
      return res.status(400).json({
        success: false,
        error: 'task_type is required (generate_base or dub_video)'
      });
    }
    
    if (!['generate_base', 'dub_video'].includes(task_type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task_type. Must be "generate_base" or "dub_video"'
      });
    }
    
    // Validate generate_base parameters
    if (task_type === 'generate_base') {
      if (!params.image_url) {
        return res.status(400).json({
          success: false,
          error: 'image_url is required for generate_base task'
        });
      }
    }
    
    // Validate dub_video parameters
    if (task_type === 'dub_video') {
      if (!params.video_url || !params.audio_url) {
        return res.status(400).json({
          success: false,
          error: 'video_url and audio_url are required for dub_video task'
        });
      }
    }
    
    // Build payload
    const payload = {
      input: {
        task_type,
        ...params
      }
    };
    
    logger.info(`📤 RunPod job request: ${task_type}`);
    
    if (wait) {
      // Submit and wait for completion
      const maxPollTime = task_type === 'generate_base' ? 300000 : 600000; // 5min or 10min
      const result = await submitAndWait('runsync', payload, maxPollTime);
      
      return res.json({
        success: true,
        status: 'COMPLETED',
        result
      });
      
    } else {
      // Just submit and return job ID
      const jobId = await submitJob('run', payload);
      
      return res.json({
        success: true,
        job_id: jobId,
        message: 'Job submitted. Use GET /api/runpod/jobs/:id to check status'
      });
    }
    
  } catch (error) {
    logger.error('RunPod job submission failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/runpod/jobs/:id
 * Poll job status
 * 
 * Query params:
 * - wait: If true, polls until completion (default: false)
 * - timeout: Max poll time in ms (default: 600000 = 10min)
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { wait = 'false', timeout = '600000' } = req.query;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required'
      });
    }
    
    const shouldWait = wait === 'true' || wait === '1';
    const maxPollTime = parseInt(timeout);
    
    if (shouldWait) {
      // Poll until completion
      logger.info(`⏳ Polling job ${id} until completion (max ${maxPollTime}ms)`);
      
      const result = await pollJobStatus(id, maxPollTime);
      
      return res.json({
        success: true,
        job_id: id,
        status: 'COMPLETED',
        result
      });
      
    } else {
      // Single status check
      const workerUrl = process.env.RUNPOD_WORKER_URL;
      const axios = require('axios');
      
      const response = await axios.get(`${workerUrl}/status/${id}`, {
        headers: {
          'Authorization': `Bearer ${process.env.RUNPOD_API_KEY || ''}`
        },
        timeout: 10000
      });
      
      return res.json({
        success: true,
        job_id: id,
        status: response.data.status,
        progress: response.data.progress || 0,
        output: response.data.output || null,
        error: response.data.error || null
      });
    }
    
  } catch (error) {
    logger.error(`RunPod job status check failed for ${req.params.id}:`, error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/runpod/health
 * Check RunPod worker health
 */
router.get('/health', async (req, res) => {
  try {
    const isHealthy = await checkWorkerHealth();
    
    if (isHealthy) {
      return res.json({
        success: true,
        status: 'healthy',
        worker_url: process.env.RUNPOD_WORKER_URL || 'not configured',
        message: 'RunPod worker is responding'
      });
    } else {
      return res.status(503).json({
        success: false,
        status: 'unhealthy',
        worker_url: process.env.RUNPOD_WORKER_URL || 'not configured',
        message: 'RunPod worker is not responding'
      });
    }
    
  } catch (error) {
    logger.error('RunPod health check failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/runpod/test
 * Test endpoint for quick validation
 */
router.post('/test', async (req, res) => {
  try {
    // Test payload
    const testPayload = {
      input: {
        task_type: 'generate_base',
        image_url: 'https://via.placeholder.com/1080x1920',
        prompt: 'test video generation',
        num_frames: 30
      }
    };
    
    logger.info('🧪 Running RunPod test job...');
    
    const jobId = await submitJob('run', testPayload);
    
    res.json({
      success: true,
      job_id: jobId,
      message: 'Test job submitted successfully. Worker is operational.',
      next_step: `Check status at GET /api/runpod/jobs/${jobId}`
    });
    
  } catch (error) {
    logger.error('RunPod test failed:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Test job failed. Check RunPod worker configuration.'
    });
  }
});

module.exports = router;
