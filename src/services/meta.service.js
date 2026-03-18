/**
 * Meta Business Suite Direct Posting Service
 * Handles direct posting to Facebook Pages, Instagram Business, and Threads via Meta Graph API
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { getSupabaseAdmin } = require('../db/supabase');

const META_GRAPH_BASE_URL = 'https://graph.instagram.com';
const FACEBOOK_GRAPH_BASE_URL = 'https://graph.facebook.com';

/**
 * Get page access token for a company
 * @param {string} companyId - Company ID
 * @param {string} platform - 'facebook' | 'instagram' | 'threads'
 * @returns {Promise<string>} - Access token
 */
async function getPageAccessToken(companyId, platform) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: integration, error } = await supabase
      .from('company_integrations')
      .select('*')
      .eq('company_id', companyId)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (error || !integration) {
      throw new Error(`No active ${platform} integration found for company`);
    }

    return integration.access_token;
  } catch (error) {
    logger.error('Error fetching page access token:', error);
    throw error;
  }
}

/**
 * Publish to Facebook Page
 * @param {string} pageAccessToken - Facebook Page Access Token
 * @param {object} content - { message, imageUrl, link, title, description }
 * @returns {Promise<object>} - { post_id, permalink }
 */
async function publishToFacebook(pageAccessToken, content) {
  try {
    const { message, imageUrl, link, title, description } = content;

    if (!message && !imageUrl && !link) {
      throw new Error('Must provide at least message, imageUrl, or link');
    }

    // Extract page ID from token (usually in format: page_id|token)
    // For now, assume token structure includes page_id
    // Get the page ID from the access token metadata
    const pageInfoResponse = await axios.get(
      `${FACEBOOK_GRAPH_BASE_URL}/me`,
      {
        params: { access_token: pageAccessToken, fields: 'id,name' }
      }
    );

    const pageId = pageInfoResponse.data.id;

    let postUrl;
    let postData;

    if (imageUrl) {
      // POST to /page-id/photos for image posts
      postUrl = `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/photos`;
      postData = {
        source: imageUrl,
        caption: message || '',
        ...(link && { link }),
        ...(title && { name: title }),
        ...(description && { description }),
        access_token: pageAccessToken
      };
    } else if (link) {
      // POST to /page-id/feed for link posts
      postUrl = `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/feed`;
      postData = {
        link,
        message: message || '',
        ...(title && { name: title }),
        access_token: pageAccessToken
      };
    } else {
      // Status update
      postUrl = `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/feed`;
      postData = {
        message,
        access_token: pageAccessToken
      };
    }

    const response = await axios.post(postUrl, postData);

    logger.info(`Published to Facebook: ${response.data.id}`);

    return {
      post_id: response.data.id,
      permalink: `https://facebook.com/${pageId}/posts/${response.data.id}`,
      platform: 'facebook'
    };
  } catch (error) {
    logger.error('Error publishing to Facebook:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Publish to Instagram Business Account
 * @param {string} pageAccessToken - Instagram Business Access Token
 * @param {string} igUserId - Instagram User ID
 * @param {object} content - { imageUrl, caption, alt_text }
 * @returns {Promise<object>} - { media_id, status }
 */
async function publishToInstagram(pageAccessToken, igUserId, content) {
  try {
    const { imageUrl, caption, alt_text } = content;

    if (!imageUrl) {
      throw new Error('Instagram posts require imageUrl');
    }

    if (!igUserId) {
      throw new Error('Instagram user ID is required');
    }

    // Step 1: Create media object
    const createMediaUrl = `${META_GRAPH_BASE_URL}/${igUserId}/media`;
    const mediaResponse = await axios.post(createMediaUrl, {
      image_url: imageUrl,
      caption: caption || '',
      ...(alt_text && { alt_text }),
      access_token: pageAccessToken
    });

    const mediaId = mediaResponse.data.id;
    logger.info(`Created Instagram media: ${mediaId}`);

    // Step 2: Publish the media
    const publishUrl = `${META_GRAPH_BASE_URL}/${igUserId}/media_publish`;
    const publishResponse = await axios.post(publishUrl, {
      creation_id: mediaId,
      access_token: pageAccessToken
    });

    logger.info(`Published to Instagram: ${publishResponse.data.id}`);

    return {
      media_id: publishResponse.data.id,
      status: 'PUBLISHED',
      platform: 'instagram'
    };
  } catch (error) {
    logger.error('Error publishing to Instagram:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Publish to Threads
 * @param {string} pageAccessToken - Threads Access Token
 * @param {string} threadsUserId - Threads User ID
 * @param {object} content - { text, imageUrl, alt_text }
 * @returns {Promise<object>} - { thread_id, status }
 */
async function publishToThreads(pageAccessToken, threadsUserId, content) {
  try {
    const { text, imageUrl, alt_text } = content;

    if (!text && !imageUrl) {
      throw new Error('Threads posts require text or imageUrl');
    }

    if (!threadsUserId) {
      throw new Error('Threads user ID is required');
    }

    // Step 1: Create thread
    const createThreadUrl = `${META_GRAPH_BASE_URL}/${threadsUserId}/threads`;
    const threadData = {
      ...(text && { text }),
      ...(imageUrl && { image_url: imageUrl }),
      ...(alt_text && { alt_text }),
      access_token: pageAccessToken
    };

    const threadResponse = await axios.post(createThreadUrl, threadData);
    const threadId = threadResponse.data.id;
    logger.info(`Created Threads post: ${threadId}`);

    // Step 2: Publish the thread
    const publishUrl = `${META_GRAPH_BASE_URL}/${threadsUserId}/threads_publish`;
    const publishResponse = await axios.post(publishUrl, {
      creation_id: threadId,
      access_token: pageAccessToken
    });

    logger.info(`Published to Threads: ${publishResponse.data.id}`);

    return {
      thread_id: publishResponse.data.id,
      status: 'PUBLISHED',
      platform: 'threads'
    };
  } catch (error) {
    logger.error('Error publishing to Threads:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Post first comment on a post
 * @param {string} pageAccessToken - Access token
 * @param {string} postId - Meta post ID
 * @param {string} commentText - Comment text
 * @returns {Promise<object>} - { comment_id }
 */
async function postFirstComment(pageAccessToken, postId, commentText) {
  try {
    if (!postId || !commentText) {
      throw new Error('Post ID and comment text are required');
    }

    const commentUrl = `${META_GRAPH_BASE_URL}/${postId}/comments`;
    const response = await axios.post(commentUrl, {
      message: commentText,
      access_token: pageAccessToken
    });

    logger.info(`Posted first comment on ${postId}`);

    return {
      comment_id: response.data.id
    };
  } catch (error) {
    logger.error('Error posting first comment:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get page insights
 * @param {string} pageAccessToken - Page Access Token
 * @param {string} pageId - Facebook Page ID
 * @param {string} metric - Specific metric or 'all' for common ones
 * @returns {Promise<object>} - Insights data
 */
async function getPageInsights(pageAccessToken, pageId, metric = 'all') {
  try {
    if (!pageId) {
      throw new Error('Page ID is required');
    }

    const metrics = metric === 'all'
      ? 'page_fans,page_impressions,page_engaged_users,page_post_engagements'
      : metric;

    const insightsUrl = `${FACEBOOK_GRAPH_BASE_URL}/${pageId}/insights`;
    const response = await axios.get(insightsUrl, {
      params: {
        metrics,
        access_token: pageAccessToken
      }
    });

    logger.info(`Retrieved insights for page ${pageId}`);

    // Format insights data
    const insights = {};
    (response.data.data || []).forEach(item => {
      insights[item.name] = item.values?.[0]?.value || 0;
    });

    return insights;
  } catch (error) {
    logger.error('Error getting page insights:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Exchange short-lived token for long-lived token
 * @param {string} appId - Meta App ID
 * @param {string} appSecret - Meta App Secret
 * @param {string} shortLivedToken - Short-lived access token
 * @returns {Promise<object>} - { access_token, expires_in }
 */
async function refreshPageToken(appId, appSecret, shortLivedToken) {
  try {
    if (!appId || !appSecret || !shortLivedToken) {
      throw new Error('App ID, App Secret, and short-lived token are required');
    }

    const tokenUrl = `${FACEBOOK_GRAPH_BASE_URL}/oauth/access_token`;
    const response = await axios.get(tokenUrl, {
      params: {
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'fb_exchange_token',
        fb_exchange_token: shortLivedToken
      }
    });

    logger.info('Refreshed page access token');

    return {
      access_token: response.data.access_token,
      expires_in: response.data.expires_in || 5184000 // 60 days default
    };
  } catch (error) {
    logger.error('Error refreshing token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get connected Facebook pages for a user
 * @param {string} pageAccessToken - User access token
 * @returns {Promise<array>} - Array of pages
 */
async function getConnectedPages(pageAccessToken) {
  try {
    const pagesUrl = `${FACEBOOK_GRAPH_BASE_URL}/me/accounts`;
    const response = await axios.get(pagesUrl, {
      params: {
        access_token: pageAccessToken,
        fields: 'id,name,access_token,category'
      }
    });

    logger.info(`Retrieved ${response.data.data.length} connected pages`);

    return response.data.data || [];
  } catch (error) {
    logger.error('Error fetching connected pages:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Validate an access token
 * @param {string} accessToken - Access token to validate
 * @returns {Promise<object>} - Token info { app_id, user_id, is_valid, expires_at }
 */
async function validateToken(accessToken) {
  try {
    const debugUrl = `${FACEBOOK_GRAPH_BASE_URL}/debug_token`;
    const response = await axios.get(debugUrl, {
      params: {
        input_token: accessToken,
        access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
      }
    });

    const { data, app_id, user_id, is_valid, expires_at } = response.data;

    return {
      app_id,
      user_id,
      is_valid,
      expires_at,
      scopes: data?.scopes || []
    };
  } catch (error) {
    logger.error('Error validating token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Store integration token in database
 * @param {string} companyId - Company ID
 * @param {string} platform - 'facebook' | 'instagram' | 'threads'
 * @param {object} tokenData - { access_token, expires_in, page_id, page_name }
 * @returns {Promise<object>} - Stored integration record
 */
async function storeIntegrationToken(companyId, platform, tokenData) {
  try {
    const supabase = getSupabaseAdmin();

    const { data: integration, error } = await supabase
      .from('company_integrations')
      .upsert({
        company_id: companyId,
        platform: platform.toLowerCase(),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
        page_id: tokenData.page_id,
        page_name: tokenData.page_name,
        metadata: tokenData.metadata || {},
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id,platform'
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info(`Stored ${platform} integration token for company ${companyId}`);
    return integration;
  } catch (error) {
    logger.error('Error storing integration token:', error);
    throw error;
  }
}

module.exports = {
  publishToFacebook,
  publishToInstagram,
  publishToThreads,
  postFirstComment,
  getPageInsights,
  refreshPageToken,
  getConnectedPages,
  validateToken,
  storeIntegrationToken,
  getPageAccessToken
};
