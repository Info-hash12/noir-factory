/**
 * RunPod Client
 * Handles HTTP requests to RunPod worker endpoints
 */

const axios = require('axios');
const logger = require('../../utils/logger');

const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds
const DEFAULT_MAX_POLL_TIME = 600000; // 10 minutes

/**
 * Submits a job to RunPod worker
 * @param {string} endpoint - Worker endpoint (e.g., 'generate-video' or 'dub-video')
 * @param {Object} payload - Job payload
 * @returns {Promise<string>} Job ID
 */
async function submitJob(endpoint, payload) {
  try {
    const workerUrl = process.env.RUNPOD_WORKER_URL;
    
    if (!workerUrl) {
      throw new Error('RUNPOD_WORKER_URL not configured in environment');
    }
    
    const url = `${workerUrl}/${endpoint}`;
    
    logger.info(`📤 Submitting job to RunPod: ${endpoint}`);
    logger.debug('Payload:', payload);
    
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RUNPOD_API_KEY || ''}`
      },
      timeout: 30000 // 30 second timeout for job submission
    });
    
    const jobId = response.data.id || response.data.job_id;
    
    if (!jobId) {
      throw new Error('No job ID returned from RunPod worker');
    }
    
    logger.info(`✅ Job submitted: ${jobId}`);
    
    return jobId;
    
  } catch (error) {
    logger.error('❌ Failed to submit RunPod job:', error.message);
    throw new Error(`RunPod job submission failed: ${error.message}`);
  }
}

/**
 * Polls for job completion
 * @param {string} jobId - Job ID to poll
 * @param {number} maxPollTime - Maximum time to poll in milliseconds
 * @param {number} pollInterval - Interval between polls in milliseconds
 * @returns {Promise<Object>} Job result
 */
async function pollJobStatus(jobId, maxPollTime = DEFAULT_MAX_POLL_TIME, pollInterval = DEFAULT_POLL_INTERVAL) {
  try {
    const workerUrl = process.env.RUNPOD_WORKER_URL;
    const statusUrl = `${workerUrl}/status/${jobId}`;
    
    const startTime = Date.now();
    let attempts = 0;
    
    logger.info(`⏳ Polling job status: ${jobId}`);
    
    while (Date.now() - startTime < maxPollTime) {
      attempts++;
      
      try {
        const response = await axios.get(statusUrl, {
          headers: {
            'Authorization': `Bearer ${process.env.RUNPOD_API_KEY || ''}`
          },
          timeout: 10000
        });
        
        const status = response.data.status;
        const progress = response.data.progress || 0;
        
        logger.info(`📊 Job ${jobId}: ${status} (${progress}%) - attempt ${attempts}`);
        
        if (status === 'COMPLETED') {
          logger.info(`✅ Job completed: ${jobId}`);
          return response.data.output || response.data.result;
        }
        
        if (status === 'FAILED') {
          const error = response.data.error || 'Unknown error';
          throw new Error(`Job failed: ${error}`);
        }
        
        // Job is still running, wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (pollError) {
        if (pollError.response?.status === 404) {
          throw new Error(`Job not found: ${jobId}`);
        }
        
        // For other errors, continue polling
        logger.warn(`⚠️  Poll error (attempt ${attempts}):`, pollError.message);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    // Max poll time exceeded
    throw new Error(`Job polling timeout exceeded (${maxPollTime}ms) for job ${jobId}`);
    
  } catch (error) {
    logger.error(`❌ Job polling failed for ${jobId}:`, error.message);
    throw error;
  }
}

/**
 * Submits a job and waits for completion
 * @param {string} endpoint - Worker endpoint
 * @param {Object} payload - Job payload
 * @param {number} maxPollTime - Maximum polling time
 * @returns {Promise<Object>} Job result
 */
async function submitAndWait(endpoint, payload, maxPollTime) {
  const jobId = await submitJob(endpoint, payload);
  const result = await pollJobStatus(jobId, maxPollTime);
  return result;
}

/**
 * Checks if RunPod worker is healthy
 * @returns {Promise<boolean>} True if healthy
 */
async function checkWorkerHealth() {
  try {
    const workerUrl = process.env.RUNPOD_WORKER_URL;
    
    if (!workerUrl) {
      logger.warn('RUNPOD_WORKER_URL not configured');
      return false;
    }
    
    const response = await axios.get(`${workerUrl}/health`, {
      timeout: 5000
    });
    
    return response.status === 200;
    
  } catch (error) {
    logger.warn('RunPod worker health check failed:', error.message);
    return false;
  }
}

module.exports = {
  submitJob,
  pollJobStatus,
  submitAndWait,
  checkWorkerHealth
};
