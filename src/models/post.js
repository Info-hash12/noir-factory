/**
 * Post Model
 * Handles all database operations for Reddit posts
 */

const { getSupabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

/**
 * Creates a new post in the database
 * @param {Object} postData - Post data object
 * @returns {Promise<Object>} Created post
 */
async function createPost(postData) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('posts')
      .insert([
        {
          reddit_id: postData.reddit_id,
          title: postData.title,
          url: postData.url,
          author: postData.author,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    logger.info(`Post created: ${data.id} - ${data.title}`);
    return data;

  } catch (error) {
    logger.error('Failed to create post:', error.message);
    throw error;
  }
}

/**
 * Updates post status and related fields
 * @param {string} id - Post UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated post
 */
async function updatePost(id, updates) {
  try {
    const db = getSupabase();

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await db
      .from('posts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Post updated: ${id} - Status: ${data.status}`);
    return data;

  } catch (error) {
    logger.error('Failed to update post:', error.message);
    throw error;
  }
}

/**
 * Gets posts by status
 * @param {string} status - Status to filter by
 * @param {number} limit - Maximum number of posts to return
 * @returns {Promise<Array>} Array of posts
 */
async function getPostsByStatus(status, limit = 100) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('posts')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data || [];

  } catch (error) {
    logger.error('Failed to get posts by status:', error.message);
    throw error;
  }
}

/**
 * Gets a single post by ID
 * @param {string} id - Post UUID
 * @returns {Promise<Object>} Post object
 */
async function getPostById(id) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('posts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return data;

  } catch (error) {
    logger.error('Failed to get post by ID:', error.message);
    throw error;
  }
}

/**
 * Gets a post by Reddit ID
 * @param {string} redditId - Reddit post ID
 * @returns {Promise<Object|null>} Post object or null if not found
 */
async function getPostByRedditId(redditId) {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('posts')
      .select('*')
      .eq('reddit_id', redditId)
      .maybeSingle();

    if (error) throw error;

    return data;

  } catch (error) {
    logger.error('Failed to get post by Reddit ID:', error.message);
    throw error;
  }
}

/**
 * Gets all existing Reddit IDs from the database
 * @returns {Promise<Array>} Array of Reddit IDs
 */
async function getExistingRedditIds() {
  try {
    const db = getSupabase();

    const { data, error } = await db
      .from('posts')
      .select('reddit_id');

    if (error) throw error;

    return (data || []).map(post => post.reddit_id);

  } catch (error) {
    logger.error('Failed to get existing Reddit IDs:', error.message);
    throw error;
  }
}

/**
 * Marks a post as failed with error message
 * @param {string} id - Post UUID
 * @param {string} errorMessage - Error message
 * @returns {Promise<Object>} Updated post
 */
async function markPostFailed(id, errorMessage) {
  return updatePost(id, {
    status: 'failed',
    error_message: errorMessage,
    processed_at: new Date().toISOString()
  });
}

/**
 * Marks a post as completed with results
 * @param {string} id - Post UUID
 * @param {Object} results - Processing results
 * @returns {Promise<Object>} Updated post
 */
async function markPostCompleted(id, results) {
  return updatePost(id, {
    status: 'completed',
    screenshot_url: results.screenshot_url,
    ai_score: results.ai_score,
    ai_analysis: results.ai_analysis,
    processed_at: new Date().toISOString()
  });
}

/**
 * Gets all posts with optional filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} Array of posts
 */
async function getAllPosts(filters = {}) {
  try {
    const db = getSupabase();
    let query = db.from('posts').select('*');

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    return data || [];

  } catch (error) {
    logger.error('Failed to get all posts:', error.message);
    throw error;
  }
}

module.exports = {
  createPost,
  updatePost,
  getPostsByStatus,
  getPostById,
  getPostByRedditId,
  getExistingRedditIds,
  markPostFailed,
  markPostCompleted,
  getAllPosts
};
