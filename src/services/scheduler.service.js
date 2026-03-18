/**
 * Smart Scheduling Service
 * Determines optimal times to post content on each platform
 */

const logger = require('../utils/logger');
const { getSupabaseAdmin } = require('../db/supabase');

// Optimal posting windows by platform and day of week
// Times are in 24-hour format (e.g., 11 = 11am, 14 = 2pm)
const OPTIMAL_TIMES = {
  instagram: {
    best_days: [2, 3, 4], // Tue, Wed, Thu (0=Sun, 1=Mon, etc)
    best_hours: [11, 12, 13], // 11am-1pm
    good_hours: [9, 10, 11, 12, 13, 14, 15] // 9am-3pm Mon-Fri
  },
  facebook: {
    best_days: [2, 3, 4],
    best_hours: [9, 10, 11, 12],
    good_hours: [8, 9, 10, 11, 12, 13, 14]
  },
  tiktok: {
    best_days: [2, 4, 5], // Tue, Thu, Fri
    best_hours_tue_thu: [14, 15, 16, 17, 12, 13], // 2-6pm Tue/Thu, 12-3pm Thu
    best_hours_fri: [17], // 5pm Fri
    good_hours: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] // 10am-7pm
  },
  twitter: {
    best_days: [1, 2, 3, 4, 5], // Mon-Fri
    best_hours: [8, 9, 10],
    good_hours: [7, 8, 9, 10, 11, 12]
  },
  x: {
    // X is same as Twitter
    best_days: [1, 2, 3, 4, 5],
    best_hours: [8, 9, 10],
    good_hours: [7, 8, 9, 10, 11, 12]
  },
  linkedin: {
    best_days: [2, 3, 4],
    best_hours: [10, 11, 12],
    good_hours: [8, 9, 10, 11, 12, 13, 14]
  },
  youtube: {
    best_days: [5, 6], // Fri-Sat
    best_hours: [15, 16, 17, 18],
    good_hours: [14, 15, 16, 17, 18, 19]
  },
  threads: {
    // Mirrors Instagram
    best_days: [2, 3, 4],
    best_hours: [11, 12, 13],
    good_hours: [9, 10, 11, 12, 13, 14, 15]
  }
};

/**
 * Get the next optimal posting time for a platform
 * @param {string} platform - Social media platform (instagram, facebook, etc)
 * @param {string} timezone - Company timezone (e.g., 'America/New_York')
 * @returns {object} - { time: ISO string, window: 'best' | 'good', platform }
 */
function getOptimalPostTime(platform, timezone = 'UTC') {
  const platformLower = platform.toLowerCase();
  const config = OPTIMAL_TIMES[platformLower];

  if (!config) {
    logger.warn(`Unknown platform: ${platform}`);
    return null;
  }

  try {
    // Get current date/time in company timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const now = new Date();
    const parts = formatter.formatToParts(now);
    const localDate = new Date(
      parseInt(parts.find(p => p.type === 'year').value),
      parseInt(parts.find(p => p.type === 'month').value) - 1,
      parseInt(parts.find(p => p.type === 'day').value),
      parseInt(parts.find(p => p.type === 'hour').value),
      parseInt(parts.find(p => p.type === 'minute').value),
      0
    );

    // Find next best posting time
    let searchDate = new Date(localDate);
    let attempts = 0;
    const maxAttempts = 14; // Search up to 2 weeks

    while (attempts < maxAttempts) {
      const dayOfWeek = searchDate.getDay();
      const hour = searchDate.getHours();

      // Check if this is a best day
      if (config.best_days.includes(dayOfWeek)) {
        // Special handling for TikTok
        if (platformLower === 'tiktok') {
          let bestHours = config.good_hours;
          if (dayOfWeek === 2 || dayOfWeek === 4) {
            bestHours = config.best_hours_tue_thu || config.good_hours;
          } else if (dayOfWeek === 5) {
            bestHours = config.best_hours_fri || config.good_hours;
          }

          if (bestHours.includes(hour)) {
            return {
              time: toISOString(searchDate, timezone),
              window: 'best',
              platform: platformLower,
              description: `${hour}:00 (best time for ${platform})`
            };
          }
        } else {
          // Check if in best hours
          if (config.best_hours.includes(hour)) {
            return {
              time: toISOString(searchDate, timezone),
              window: 'best',
              platform: platformLower,
              description: `${hour}:00 (best time for ${platform})`
            };
          }

          // Check if in good hours
          if (config.good_hours.includes(hour)) {
            return {
              time: toISOString(searchDate, timezone),
              window: 'good',
              platform: platformLower,
              description: `${hour}:00 (good time for ${platform})`
            };
          }
        }
      } else {
        // Not a best day, but check good hours anyway
        if (config.good_hours.includes(hour)) {
          return {
            time: toISOString(searchDate, timezone),
            window: 'good',
            platform: platformLower,
            description: `${hour}:00 (good time for ${platform})`
          };
        }
      }

      // Advance to next hour
      searchDate.setHours(searchDate.getHours() + 1);
      if (searchDate.getHours() === 0) {
        // Wrapped to next day
      }
      attempts++;
    }

    // Fallback: return next available good hour
    return {
      time: toISOString(new Date(now.getTime() + 24 * 60 * 60 * 1000), timezone),
      window: 'fallback',
      platform: platformLower,
      description: 'Next available time'
    };
  } catch (error) {
    logger.error('Error calculating optimal post time:', error);
    return null;
  }
}

/**
 * Convert local date to ISO string respecting timezone
 */
function toISOString(date, timezone) {
  if (timezone === 'UTC') {
    return date.toISOString();
  }

  // Get UTC time by offsetting
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return date.toISOString();
}

/**
 * Get schedule suggestions for multiple platforms
 * @param {string[]} platforms - Array of platform names
 * @param {string} timezone - Company timezone
 * @returns {object} - { [platform]: { time, window, description } }
 */
function getScheduleSuggestions(platforms = [], timezone = 'UTC') {
  if (!Array.isArray(platforms)) {
    platforms = [platforms];
  }

  const suggestions = {};
  for (const platform of platforms) {
    const timing = getOptimalPostTime(platform, timezone);
    if (timing) {
      suggestions[platform] = timing;
    }
  }

  return suggestions;
}

/**
 * Schedule a post to be published at a specific time
 * @param {string} jobId - Content job ID
 * @param {string} platform - Platform name
 * @param {string} scheduledTime - ISO datetime string
 * @returns {Promise<object>} - Updated job
 */
async function schedulePost(jobId, platform, scheduledTime) {
  try {
    const supabase = getSupabaseAdmin();

    // Validate scheduled time is in future
    const scheduled = new Date(scheduledTime);
    if (scheduled < new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Update content_jobs table
    const { data: job, error } = await supabase
      .from('content_jobs')
      .update({
        scheduled_at: scheduledTime,
        scheduled_platform: platform,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.info(`Scheduled post ${jobId} for ${platform} at ${scheduledTime}`);
    return job;
  } catch (error) {
    logger.error('Error scheduling post:', error);
    throw error;
  }
}

/**
 * Get pending scheduled posts (for the next 24 hours)
 * @param {string} companyId - Company ID
 * @returns {Promise<array>} - Array of scheduled jobs
 */
async function getPendingScheduledPosts(companyId) {
  try {
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: jobs, error } = await supabase
      .from('content_jobs')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', tomorrow.toISOString())
      .order('scheduled_at', { ascending: true });

    if (error) {
      throw error;
    }

    return jobs || [];
  } catch (error) {
    logger.error('Error fetching pending scheduled posts:', error);
    return [];
  }
}

/**
 * Get all scheduled posts for a company
 * @param {string} companyId - Company ID
 * @param {object} options - { limit, offset }
 * @returns {Promise<object>} - { jobs, total }
 */
async function getScheduledPosts(companyId, options = {}) {
  try {
    const supabase = getSupabaseAdmin();
    const limit = Math.min(options.limit || 50, 500);
    const offset = options.offset || 0;

    const { data: jobs, count, error } = await supabase
      .from('content_jobs')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return {
      jobs: jobs || [],
      total: count || 0
    };
  } catch (error) {
    logger.error('Error fetching scheduled posts:', error);
    throw error;
  }
}

module.exports = {
  getOptimalPostTime,
  getScheduleSuggestions,
  schedulePost,
  getPendingScheduledPosts,
  getScheduledPosts,
  OPTIMAL_TIMES
};
