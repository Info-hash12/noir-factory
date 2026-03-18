/**
 * Content Job Model
 * Handles all database operations for content jobs in the content_jobs table
 */

const { getSupabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

/**
 * Creates a new content job in the database
 * @param {Object} jobData - Job data object containing source_id, source_url, source_title, source_content, source_author
 * @returns {Promise<Object>} Created job
 */
async function createJob(jobData) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('content_jobs')
      .insert([
        {
          source_id: jobData.source_id,
          source_url: jobData.source_url,
          source_title: jobData.source_title,
          source_content: jobData.source_content,
          source_author: jobData.source_author,
          review_status: 'pending_review'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    logger.info(`Content job created: ${data.id} - ${data.source_title}`);
    return data;

  } catch (error) {
    logger.error('Failed to create content job:', error.message);
    throw error;
  }
}

/**
 * Gets a single content job by ID
 * @param {string} id - Job UUID
 * @returns {Promise<Object>} Job object
 */
async function getJobById(id) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('content_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return data;

  } catch (error) {
    logger.error('Failed to get content job by ID:', error.message);
    throw error;
  }
}

/**
 * Updates a content job with new field values
 * @param {string} id - Job UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated job
 */
async function updateJob(id, updates) {
  try {
    const db = getSupabase();

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await db
      .from('content_jobs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Content job updated: ${id} - Review status: ${data.review_status}`);
    return data;

  } catch (error) {
    logger.error('Failed to update content job:', error.message);
    throw error;
  }
}

/**
 * Gets all content jobs with a specific review status
 * @param {string} status - Review status to filter by
 * @param {number} limit - Maximum number of jobs to return
 * @returns {Promise<Array>} Array of jobs
 */
async function getJobsByReviewStatus(status, limit = 100) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('content_jobs')
      .select('*')
      .eq('review_status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];

  } catch (error) {
    logger.error('Failed to get content jobs by review status:', error.message);
    throw error;
  }
}

/**
 * Gets all existing source IDs from the database
 * @returns {Promise<Array>} Array of source IDs
 */
async function getExistingSourceIds() {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('content_jobs')
      .select('source_id');

    if (error) throw error;

    return (data || []).map(job => job.source_id);

  } catch (error) {
    logger.error('Failed to get existing source IDs:', error.message);
    throw error;
  }
}

module.exports = {
  createJob,
  getJobById,
  updateJob,
  getJobsByReviewStatus,
  getExistingSourceIds
};
