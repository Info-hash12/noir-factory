/**
 * Screenshot Service
 * Handles Reddit screenshot capture using JSON API + HTML rendering
 * Bypasses bot detection by rendering content locally
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Fetches Reddit post data via JSON API
 * @param {string} postUrl - Reddit post URL
 * @returns {Promise<Object>} Post data
 */
async function fetchRedditData(postUrl) {
  try {
    // Convert Reddit URL to JSON API format
    const jsonUrl = postUrl.replace(/\/$/, '') + '.json';
    
    logger.info(`📥 Fetching Reddit data from JSON API: ${jsonUrl}`);
    
    const response = await axios.get(jsonUrl, {
      headers: {
        'User-Agent': 'Noir Factory Content Bot v1.0'
      },
      timeout: 10000
    });
    
    const postData = response.data[0].data.children[0].data;
    
    logger.info(`✅ Reddit data fetched: ${postData.title}`);
    
    return {
      title: postData.title,
      author: postData.author,
      selftext: postData.selftext || '',
      upvotes: postData.ups,
      comments: postData.num_comments,
      subreddit: postData.subreddit,
      created: new Date(postData.created_utc * 1000),
      permalink: postData.permalink
    };
  } catch (error) {
    logger.error('Failed to fetch Reddit data:', error.message);
    throw new Error(`Reddit API fetch failed: ${error.message}`);
  }
}

/**
 * Generates HTML template for Reddit post in dark mode (9:16 vertical)
 * @param {Object} data - Reddit post data
 * @returns {string} HTML string
 */
function generateRedditHTML(data) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 1080px;
      height: 1920px;
      background: #030303;
      color: #D7DADC;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      padding: 60px 40px;
      overflow: hidden;
    }
    .post {
      background: #1A1A1B;
      border-radius: 8px;
      padding: 30px;
    }
    .subreddit {
      color: #818384;
      font-size: 28px;
      font-weight: 500;
      margin-bottom: 20px;
    }
    .subreddit-name {
      color: #D7DADC;
    }
    .title {
      color: #D7DADC;
      font-size: 48px;
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 30px;
      word-wrap: break-word;
    }
    .selftext {
      color: #D7DADC;
      font-size: 36px;
      line-height: 1.5;
      margin-bottom: 30px;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 1200px;
      overflow: hidden;
    }
    .meta {
      display: flex;
      gap: 40px;
      font-size: 28px;
      color: #818384;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 2px solid #343536;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .upvote { color: #FF4500; font-weight: 600; }
    .comment { color: #818384; }
    .author { 
      color: #818384;
      font-size: 28px;
      margin-top: 20px;
    }
    .watermark {
      position: fixed;
      bottom: 40px;
      right: 40px;
      color: #818384;
      font-size: 24px;
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <div class="post">
    <div class="subreddit">
      r/<span class="subreddit-name">${data.subreddit}</span>
    </div>
    <h1 class="title">${data.title}</h1>
    ${data.selftext ? `<div class="selftext">${data.selftext.substring(0, 800)}${data.selftext.length > 800 ? '...' : ''}</div>` : ''}
    <div class="meta">
      <div class="meta-item">
        <span class="upvote">↑ ${data.upvotes}</span>
      </div>
      <div class="meta-item">
        <span class="comment">💬 ${data.comments}</span>
      </div>
    </div>
    <div class="author">Posted by u/[redacted]</div>
  </div>
  <div class="watermark">NoirFactory</div>
</body>
</html>`;
}

/**
 * Captures a screenshot with retry logic
 * @param {string} url - The URL to screenshot
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<string>} Screenshot URL (1080x1920 for vertical video)
 */
async function captureScreenshot(url, retries = 3) {
  try {
    const apiUrl = process.env.SCREENSHOTONE_API_URL || 'https://api.screenshotone.com/take';
    const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
    const secretKey = process.env.SCREENSHOTONE_SECRET_KEY;
    
    // Validate API credentials
    if (!accessKey) {
      logger.warn('⚠️  SCREENSHOTONE_ACCESS_KEY not configured - using placeholder');
      // Return a placeholder URL for development
      return `https://via.placeholder.com/1080x1920.png?text=Screenshot+Placeholder`;
    }

    logger.info(`📸 Starting screenshot capture (${retries} retries remaining)`);

    // NEW APPROACH: For Reddit URLs, fetch JSON and render HTML
    // This bypasses bot detection entirely
    let screenshotUrl;
    let params;

    if (url.includes('reddit.com')) {
      logger.info(`🔄 Detected Reddit URL - using JSON API + HTML rendering`);
      
      // Step 1: Fetch Reddit data via JSON API
      const redditData = await fetchRedditData(url);
      
      // Step 2: Generate HTML from Reddit data
      const html = generateRedditHTML(redditData);
      
      logger.info(`✅ Generated HTML (${html.length} chars) for: ${redditData.title.substring(0, 50)}...`);
      
      // Step 3: Screenshot the HTML using ScreenshotOne
      params = new URLSearchParams({
        access_key: accessKey,
        html: html,  // Use HTML instead of URL
        format: 'png',
        viewport_width: 1080,
        viewport_height: 1920,
        delay: 1  // Less delay needed for static HTML
      });
      
    } else {
      // For non-Reddit URLs, use standard URL screenshot
      logger.info(`📸 Capturing standard URL screenshot`);
      
      params = new URLSearchParams({
        access_key: accessKey,
        url: url,
        format: 'png',
        viewport_width: 1080,
        viewport_height: 1920,
        full_page: 'false',
        delay: 3,
        block_ads: 'true',
        block_cookie_banners: 'true'
      });
    }

    screenshotUrl = `${apiUrl}?${params.toString()}`;

    logger.info('📤 ScreenshotOne API request:', {
      type: url.includes('reddit.com') ? 'HTML' : 'URL',
      viewport: '1080x1920'
    });

    logger.info(`✅ Screenshot URL constructed: ${screenshotUrl.substring(0, 100)}...`);
    
    return screenshotUrl;

  } catch (error) {
    const statusCode = error.response?.status;
    const apiError = error.response?.data;

    logger.error(`❌ Screenshot capture failed (attempt ${4 - retries}/3):`, {
      error: error.message,
      status: statusCode,
      url: url,
      apiError: apiError
    });

    // Retry logic for specific errors
    if (retries > 0 && (statusCode === 403 || statusCode === 500 || statusCode === 503)) {
      const backoffDelay = (4 - retries) * 2000; // Exponential backoff: 2s, 4s, 6s
      logger.warn(`⏳ Retrying in ${backoffDelay}ms... (${retries - 1} retries left)`);
      
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return captureScreenshot(url, retries - 1);
    }

    // No retries left or non-retryable error
    throw new Error(`Screenshot capture failed after retries: ${error.message}${apiError ? ' - ' + JSON.stringify(apiError) : ''}`);
  }
}

/**
 * Validates if a URL is accessible
 * @param {string} url - The URL to validate
 * @returns {Promise<boolean>}
 */
async function validateUrl(url) {
  try {
    const response = await axios.head(url, { timeout: 10000 });
    return response.status === 200;
  } catch (error) {
    logger.warn(`URL validation failed for ${url}:`, error.message);
    return false;
  }
}

module.exports = {
  captureScreenshot,
  validateUrl
};
