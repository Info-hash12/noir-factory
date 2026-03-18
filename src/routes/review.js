/**
 * Review Routes
 * Express routes for content review dashboard
 */

const express = require('express');
const router = express.Router();
const { getJobsByReviewStatus, updateJob } = require('../models/contentJob');
const { processApprovedJobs } = require('../services/orchestrator');
const logger = require('../utils/logger');

/**
 * GET /review/pending
 * Get all jobs with review_status = 'pending_review'
 */
router.get('/pending', async (req, res) => {
  try {
    logger.info('Fetching pending review jobs');

    const pendingJobs = await getJobsByReviewStatus('pending_review');

    res.json({
      success: true,
      count: pendingJobs.length,
      jobs: pendingJobs
    });

  } catch (error) {
    logger.error('Failed to fetch pending review jobs:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /review/:id/approve
 * Change a job's status to 'approved' and automatically trigger orchestrator
 */
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    logger.info(`Approving job: ${id}`);

    const updatedJob = await updateJob(id, {
      review_status: 'approved',
      reviewed_at: new Date().toISOString()
    });

    // Automatically trigger orchestrator to process approved jobs
    // Run asynchronously without blocking the response
    logger.info(`Auto-triggering orchestrator for approved job: ${id}`);
    processApprovedJobs().catch(error => {
      logger.error('Auto-triggered orchestrator failed:', error.message);
    });

    res.json({
      success: true,
      message: 'Job approved successfully and processing initiated',
      job: updatedJob
    });

  } catch (error) {
    logger.error(`Failed to approve job ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /review/:id/reject
 * Change a job's status to 'rejected' with a reason
 * Body: { reason: string }
 */
router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    logger.info(`Rejecting job: ${id} - Reason: ${reason}`);

    const updatedJob = await updateJob(id, {
      review_status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Job rejected successfully',
      job: updatedJob
    });

  } catch (error) {
    logger.error(`Failed to reject job ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /review/:id/save
 * Change a job's status to 'saved_for_later'
 */
router.post('/:id/save', async (req, res) => {
  try {
    const { id } = req.params;

    logger.info(`Saving job for later: ${id}`);

    const updatedJob = await updateJob(id, {
      review_status: 'saved_for_later',
      reviewed_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Job saved for later review',
      job: updatedJob
    });

  } catch (error) {
    logger.error(`Failed to save job ${req.params.id}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /review/orchestrator/process
 * Trigger the orchestrator to process all approved jobs
 */
router.post('/orchestrator/process', async (req, res) => {
  try {
    logger.info('Orchestrator processing triggered via API');

    // Trigger orchestrator asynchronously
    processApprovedJobs().catch(error => {
      logger.error('Orchestrator processing failed:', error.message);
    });

    res.json({
      success: true,
      message: 'Orchestrator processing initiated',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to trigger orchestrator:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
