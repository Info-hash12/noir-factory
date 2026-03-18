/**
 * RSS Service
 * Handles fetching and parsing Reddit RSS feeds
 */

const Parser = require('rss-parser');
const logger = require('../utils/logger');

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'content'],
      ['id', 'redditId']
    ]
  }
});

/**
 * Fetches and parses Reddit RSS feed
 * @returns {Promise<Array>} Array of parsed job objects for content_jobs table
 */
async function fetchRSSFeed() {
  try {
    const rssUrl = process.env.REDDIT_RSS_URL;

    if (!rssUrl) {
      throw new Error('REDDIT_RSS_URL is not configured');
    }

    logger.info(`Fetching RSS feed from: ${rssUrl}`);

    const feed = await parser.parseURL(rssUrl);

    const jobs = feed.items.map(item => {
      // Extract Reddit post ID from the link
      const redditIdMatch = item.link.match(/\/comments\/([a-z0-9]+)\//);
      const redditId = redditIdMatch ? redditIdMatch[1] : null;

      return {
        source_id: redditId || item.id || item.guid,
        source_title: item.title,
        source_url: item.link,
        source_author: item.creator || item.author || 'unknown',
        source_content: item.contentSnippet || item.content || '',
        published: item.pubDate ? new Date(item.pubDate) : new Date(),
        categories: item.categories || []
      };
    });

    logger.info(`Successfully fetched ${jobs.length} items from RSS feed`);

    return jobs;

  } catch (error) {
    logger.error('RSS feed fetch failed:', {
      error: error.message,
      url: process.env.REDDIT_RSS_URL
    });

    throw new Error(`RSS feed fetch failed: ${error.message}`);
  }
}

/**
 * Filters jobs to only include new ones not in the database
 * @param {Array} jobs - Array of jobs from RSS
 * @param {Array} existingIds - Array of existing source IDs in database
 * @returns {Array} Filtered array of new jobs
 */
function filterNewPosts(jobs, existingIds) {
  const existingIdsSet = new Set(existingIds);
  const newJobs = jobs.filter(job => !existingIdsSet.has(job.source_id));

  logger.info(`Found ${newJobs.length} new items out of ${jobs.length} total`);

  return newJobs;
}

/**
 * Validates RSS feed URL format
 * @param {string} url - RSS feed URL to validate
 * @returns {boolean}
 */
function validateRSSUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('reddit.com') && url.includes('.rss');
  } catch (error) {
    return false;
  }
}

module.exports = {
  fetchRSSFeed,
  filterNewPosts,
  validateRSSUrl
};
