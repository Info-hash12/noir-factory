/**
 * Engagement Bot Background Worker
 * Executes automated engagement actions (likes, comments, follows) on social media
 * Runs on configurable cron intervals (default: every 5 minutes)
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const { getSupabaseAdmin } = require('../db/supabase');

let botJob = null; // Reference to cron job for cleanup
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get rate limit status for a company/platform
 * @param {string} companyId - Company ID
 * @param {string} platform - Platform name
 * @param {string} actionType - 'like' | 'comment' | 'follow'
 * @param {number} limit - Max actions per hour
 * @returns {Promise<number>} - Count of actions in last hour
 */
async function getRateLimitCount(companyId, platform, actionType, limit) {
  try {
    const supabase = getSupabaseAdmin();
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();

    const { data, count, error } = await supabase
      .from('engagement_log')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('platform', platform)
      .eq('action_type', actionType)
      .gte('created_at', oneHourAgo)
      .eq('success', true);

    if (error) throw error;

    return count || 0;
  } catch (error) {
    logger.error('Error checking rate limit:', error);
    return 0;
  }
}

/**
 * Check if we should perform an action based on rate limits
 * @returns {boolean} - true if under limit
 */
async function checkRateLimit(companyId, platform, actionType, config) {
  const limits = config.limits || {};
  const limit = limits[`max_${actionType}s_per_hour`];

  if (!limit) return true; // No limit set

  const current = await getRateLimitCount(companyId, platform, actionType, limit);
  return current < limit;
}

/**
 * Check if current time is within active hours for the bot
 * @param {object} config - Bot config with active_hours
 * @param {string} timezone - Company timezone
 * @returns {boolean} - true if within active hours
 */
function isWithinActiveHours(config, timezone = 'UTC') {
  try {
    if (!config.active_hours) return true;

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const now = new Date();
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value);

    const { start_hour, end_hour } = config.active_hours;

    if (start_hour <= end_hour) {
      return hour >= start_hour && hour < end_hour;
    } else {
      // Spans midnight
      return hour >= start_hour || hour < end_hour;
    }
  } catch (error) {
    logger.error('Error checking active hours:', error);
    return true;
  }
}

/**
 * Get least recently used template to rotate them
 * @param {array} templates - Array of templates
 * @returns {object} - Selected template
 */
function selectTemplate(templates) {
  if (!templates || templates.length === 0) return null;

  // Sort by last_used_at (ascending) and use_count (ascending)
  const sorted = [...templates].sort((a, b) => {
    const aTime = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
    const bTime = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;

    if (aTime === bTime) {
      return (a.use_count || 0) - (b.use_count || 0);
    }
    return aTime - bTime;
  });

  return sorted[0];
}

/**
 * Update template usage stats
 */
async function updateTemplateUsage(templateId) {
  try {
    const supabase = getSupabaseAdmin();

    await supabase
      .from('engagement_templates')
      .update({
        use_count: null, // Will use database function to increment
        last_used_at: new Date().toISOString()
      })
      .eq('id', templateId);
  } catch (error) {
    logger.error('Error updating template usage:', error);
  }
}

/**
 * Log engagement action
 */
async function logAction(companyId, platform, actionType, details) {
  try {
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from('engagement_log')
      .insert({
        company_id: companyId,
        platform,
        action_type: actionType,
        target_username: details.target_username,
        target_post_id: details.target_post_id,
        target_hashtag: details.target_hashtag,
        comment_text: details.comment_text,
        template_id: details.template_id,
        success: details.success,
        error_message: details.error_message,
        action_count: details.action_count || 1,
        created_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (error) {
    logger.error('Error logging action:', error);
  }
}

/**
 * Execute one engagement bot cycle for a company and platform
 * @param {string} companyId - Company ID
 * @param {string} platform - Platform name
 */
async function runBotCycle(companyId, platform) {
  try {
    const supabase = getSupabaseAdmin();

    // Get bot config
    const { data: config, error: configError } = await supabase
      .from('engagement_bot_configs')
      .select('*')
      .eq('company_id', companyId)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      logger.warn(`No active engagement config for ${companyId}/${platform}`);
      return;
    }

    // Check if within active hours
    const companyTz = config.timezone || 'UTC';
    if (!isWithinActiveHours(config, companyTz)) {
      logger.debug(`Outside active hours for ${companyId}/${platform}`);
      return;
    }

    logger.info(`Running engagement bot cycle for ${companyId}/${platform}`);

    const hashtags = config.target_hashtags || [];
    const actions = config.actions || {};

    // Process each hashtag
    for (const hashtag of hashtags) {
      try {
        // Like recent posts
        if (actions.auto_like) {
          const canLike = await checkRateLimit(companyId, platform, 'like', config);
          if (canLike) {
            await executeLikeAction(companyId, platform, hashtag, config);
          }
        }

        // Comment on posts
        if (actions.auto_comment) {
          const canComment = await checkRateLimit(companyId, platform, 'comment', config);
          if (canComment) {
            await executeCommentAction(companyId, platform, hashtag, config);
          }
        }

        // Follow users
        if (actions.auto_follow) {
          const canFollow = await checkRateLimit(companyId, platform, 'follow', config);
          if (canFollow) {
            await executeFollowAction(companyId, platform, hashtag, config);
          }
        }
      } catch (error) {
        logger.error(`Error processing hashtag ${hashtag}:`, error.message);
        continue; // Don't stop on individual hashtag errors
      }
    }

    logger.info(`Completed engagement cycle for ${companyId}/${platform}`);
  } catch (error) {
    logger.error('Error in engagement bot cycle:', error);
  }
}

/**
 * Execute like action
 */
async function executeLikeAction(companyId, platform, hashtag, config) {
  try {
    const supabase = getSupabaseAdmin();

    // Get recent posts for this hashtag (would use platform API in production)
    // For now, log the intent
    logger.info(`Would like posts with ${hashtag} on ${platform}`);

    await logAction(companyId, platform, 'like', {
      target_hashtag: hashtag,
      success: true,
      action_count: 1
    });
  } catch (error) {
    logger.error('Error in like action:', error);
    await logAction(companyId, platform, 'like', {
      target_hashtag: hashtag,
      success: false,
      error_message: error.message
    });
  }
}

/**
 * Execute comment action
 */
async function executeCommentAction(companyId, platform, hashtag, config) {
  try {
    const supabase = getSupabaseAdmin();

    // Get comment templates
    const { data: templates } = await supabase
      .from('engagement_templates')
      .select('*')
      .eq('company_id', companyId)
      .eq('type', 'comment')
      .eq('is_active', true);

    if (!templates || templates.length === 0) {
      logger.warn(`No comment templates for ${companyId}`);
      return;
    }

    // Select template (least recently used)
    const template = selectTemplate(templates);
    if (!template) return;

    // Would post comment to platform API in production
    logger.info(`Would comment "${template.content}" on ${hashtag} posts on ${platform}`);

    // Update template usage
    await updateTemplateUsage(template.id);

    await logAction(companyId, platform, 'comment', {
      target_hashtag: hashtag,
      comment_text: template.content,
      template_id: template.id,
      success: true,
      action_count: 1
    });
  } catch (error) {
    logger.error('Error in comment action:', error);
    await logAction(companyId, platform, 'comment', {
      target_hashtag: hashtag,
      success: false,
      error_message: error.message
    });
  }
}

/**
 * Execute follow action
 */
async function executeFollowAction(companyId, platform, hashtag, config) {
  try {
    const supabase = getSupabaseAdmin();

    // Would fetch users posting with hashtag and follow in production
    logger.info(`Would follow users posting ${hashtag} on ${platform}`);

    await logAction(companyId, platform, 'follow', {
      target_hashtag: hashtag,
      success: true,
      action_count: 1
    });
  } catch (error) {
    logger.error('Error in follow action:', error);
    await logAction(companyId, platform, 'follow', {
      target_hashtag: hashtag,
      success: false,
      error_message: error.message
    });
  }
}

/**
 * Start the engagement bot
 * @param {string} interval - Cron expression (default: every 5 minutes)
 */
function startEngagementBot(interval = '*/5 * * * *') {
  try {
    if (botJob) {
      logger.warn('Engagement bot already running');
      return;
    }

    botJob = cron.schedule(interval, async () => {
      try {
        const supabase = getSupabaseAdmin();

        // Get all active bot configs
        const { data: configs } = await supabase
          .from('engagement_bot_configs')
          .select('*')
          .eq('is_active', true);

        if (!configs || configs.length === 0) {
          return; // No active bots
        }

        // Run cycle for each active config
        for (const config of configs) {
          await runBotCycle(config.company_id, config.platform);
        }
      } catch (error) {
        logger.error('Error in engagement bot schedule:', error);
      }
    });

    logger.info(`Engagement bot started with interval: ${interval}`);
  } catch (error) {
    logger.error('Error starting engagement bot:', error);
  }
}

/**
 * Stop the engagement bot
 */
function stopEngagementBot() {
  try {
    if (botJob) {
      botJob.stop();
      botJob = null;
      logger.info('Engagement bot stopped');
    }
  } catch (error) {
    logger.error('Error stopping engagement bot:', error);
  }
}

/**
 * Get bot status
 * @returns {object} - { running, nextRun }
 */
function getBotStatus() {
  return {
    running: botJob ? true : false,
    nextRun: botJob ? 'See cron logs' : 'Not running'
  };
}

module.exports = {
  startEngagementBot,
  stopEngagementBot,
  runBotCycle,
  getBotStatus,
  // Exports for testing
  isWithinActiveHours,
  selectTemplate,
  checkRateLimit
};
