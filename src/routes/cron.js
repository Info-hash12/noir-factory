/**
 * Cron Routes
 * Secure endpoints for scheduled tasks (Cloud Scheduler, etc.)
 */

const express = require('express');
const router = express.Router();
const { generateDailyReport } = require('../../scripts/daily-report');
const logger = require('../utils/logger');

/**
 * Middleware to verify cron secret token
 */
function verifyCronToken(req, res, next) {
  const token = req.headers['x-cron-secret'] || req.query.token;
  const expectedToken = process.env.CRON_SECRET_TOKEN;
  
  if (!expectedToken) {
    logger.error('CRON_SECRET_TOKEN not configured');
    return res.status(500).json({
      success: false,
      error: 'Cron secret not configured'
    });
  }
  
  if (token !== expectedToken) {
    logger.warn('Invalid cron token attempt');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    });
  }
  
  next();
}

/**
 * GET/POST /cron/daily-report
 * Triggers the daily report generation and sending
 */
router.all('/daily-report', verifyCronToken, async (req, res) => {
  try {
    logger.info('📊 Cron: Daily report triggered');
    
    const result = await generateDailyReport();
    
    res.json({
      success: true,
      message: 'Daily report generated and sent',
      data: {
        yesterday: {
          successful: result.yesterday.successful,
          failed: result.yesterday.failed,
          totalCost: result.yesterday.totalCost
        },
        mtd: {
          successful: result.mtd.successful,
          failed: result.mtd.failed,
          totalCost: result.mtd.totalCost
        },
        notifications: result.notificationResults
      }
    });
    
  } catch (error) {
    logger.error('Failed to generate daily report:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /cron/health
 * Health check for cron endpoints
 */
router.get('/health', verifyCronToken, (req, res) => {
  res.json({
    success: true,
    message: 'Cron endpoints are operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
