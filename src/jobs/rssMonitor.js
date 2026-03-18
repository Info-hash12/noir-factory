/**
 * RSS Monitor Job
 * Scheduled task that monitors Reddit RSS feed and creates content jobs
 */

const cron = require('node-cron');
const { fetchRSSFeed, filterNewPosts } = require('../services/rssService');
const {
  createJob,
  getExistingSourceIds
} = require('../models/contentJob');
const logger = require('../utils/logger');

let isProcessing = false;

/**
 * Logs job creation (pipeline processing happens via orchestrator)
 * @param {Object} job - Content job object from database
 */
async function processPost(job) {
  try {
    // Job is now saved with review_status = 'pending_review'
    // The orchestrator will handle the full pipeline after approval
    logger.info(`Job saved for review: ${job.id} - ${job.source_title}`);
    
    // NOTE: Old pipeline logic removed. Jobs are now processed through:
    // 1. Review dashboard (approve/reject)
    // 2. Orchestrator service (full video generation pipeline)
    
  } catch (error) {
    logger.error(`Failed to process job ${job.id}:`, error.message);
  }
}

/**
 * Main RSS monitoring function
 */
async function monitorRSS() {
  if (isProcessing) {
    logger.warn('RSS monitor is already processing, skipping this run');
    return;
  }

  isProcessing = true;

  try {
    logger.info('Starting RSS feed check...');

    // Fetch RSS feed
    const rssPosts = await fetchRSSFeed();

    if (!rssPosts || rssPosts.length === 0) {
      logger.info('No posts found in RSS feed');
      return;
    }

    // Get existing source IDs from database
    const existingIds = await getExistingSourceIds();

    // Filter for new jobs only
    const newJobs = filterNewPosts(rssPosts, existingIds);

    if (newJobs.length === 0) {
      logger.info('No new jobs to process');
      return;
    }

    logger.info(`Found ${newJobs.length} new jobs to process`);

    // Create jobs in database for review
    for (const rssJob of newJobs) {
      try {
        // Create job in database with review_status = 'pending_review'
        const dbJob = await createJob(rssJob);

        // Log the job creation
        await processPost(dbJob);

        // Add delay between processing to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        logger.error(`Failed to create/process job "${rssJob.source_title}":`, error.message);
      }
    }

    logger.info('RSS monitoring cycle completed successfully');

  } catch (error) {
    logger.error('RSS monitoring failed:', error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the RSS monitor cron job
 */
function startRSSMonitor() {
  const cronSchedule = process.env.RSS_CHECK_INTERVAL || '*/15 * * * *';

  // Validate cron schedule
  if (!cron.validate(cronSchedule)) {
    logger.error(`Invalid cron schedule: ${cronSchedule}`);
    throw new Error('Invalid RSS_CHECK_INTERVAL configuration');
  }

  logger.info(`RSS monitor scheduled with interval: ${cronSchedule}`);

  // Schedule the cron job
  const task = cron.schedule(cronSchedule, async () => {
    await monitorRSS();
  });

  // Run immediately on startup
  logger.info('Running initial RSS check...');
  monitorRSS().catch(error => {
    logger.error('Initial RSS check failed:', error.message);
  });

  return task;
}

/**
 * Manually trigger RSS monitoring (for API endpoint)
 */
async function triggerManualCheck() {
  logger.info('Manual RSS check triggered');
  await monitorRSS();
}

module.exports = {
  startRSSMonitor,
  triggerManualCheck,
  monitorRSS
};
