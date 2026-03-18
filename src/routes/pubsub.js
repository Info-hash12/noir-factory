/**
 * Pub/Sub Routes
 * Handles Cloud Pub/Sub triggered events (Cloud Scheduler, etc.)
 */

const express = require('express');
const router = express.Router();
const { processApprovedJobs } = require('../services/orchestrator');
const { generateDailyReport } = require('../../scripts/daily-report');
const logger = require('../utils/logger');

/**
 * Decodes Pub/Sub message
 * @param {Object} body - Request body
 * @returns {Object} Decoded message
 */
function decodePubSubMessage(body) {
  try {
    if (!body.message || !body.message.data) {
      throw new Error('Invalid Pub/Sub message format');
    }
    
    const data = Buffer.from(body.message.data, 'base64').toString('utf-8');
    return JSON.parse(data);
    
  } catch (error) {
    logger.error('Failed to decode Pub/Sub message:', error.message);
    return {};
  }
}

/**
 * POST /pubsub/process-jobs
 * Triggered by Cloud Scheduler to process approved jobs
 */
router.post('/process-jobs', async (req, res) => {
  try {
    logger.info('📨 Pub/Sub: Process jobs triggered');
    
    const message = decodePubSubMessage(req.body);
    logger.debug('Message data:', message);
    
    // Process approved jobs
    const result = await processApprovedJobs();
    
    logger.info(`✅ Processed ${result.processed} jobs: ${result.succeeded} succeeded, ${result.failed} failed`);
    
    // Acknowledge the message
    res.status(204).send();
    
  } catch (error) {
    logger.error('Failed to process jobs:', error.message);
    // Still acknowledge to prevent retry
    res.status(204).send();
  }
});

/**
 * POST /pubsub/daily-report
 * Triggered by Cloud Scheduler to generate daily report
 */
router.post('/daily-report', async (req, res) => {
  try {
    logger.info('📨 Pub/Sub: Daily report triggered');
    
    const message = decodePubSubMessage(req.body);
    logger.debug('Message data:', message);
    
    // Generate and send daily report
    await generateDailyReport();
    
    logger.info('✅ Daily report sent');
    
    // Acknowledge the message
    res.status(204).send();
    
  } catch (error) {
    logger.error('Failed to generate daily report:', error.message);
    // Still acknowledge to prevent retry
    res.status(204).send();
  }
});

/**
 * POST /pubsub/test
 * Test endpoint for Pub/Sub integration
 */
router.post('/test', async (req, res) => {
  try {
    logger.info('📨 Pub/Sub: Test message received');
    
    const message = decodePubSubMessage(req.body);
    logger.info('Test message data:', message);
    
    res.status(204).send();
    
  } catch (error) {
    logger.error('Test endpoint error:', error.message);
    res.status(204).send();
  }
});

module.exports = router;
