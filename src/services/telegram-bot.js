/**
 * Telegram Bot Service
 * Budget controls, queue monitoring, and job management via Telegram
 */

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const logger = require('../utils/logger');

// Initialize bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';

if (!token) {
  logger.warn('TELEGRAM_BOT_TOKEN not set - Telegram bot disabled');
  module.exports = { startBot: () => {} };
  return;
}

const bot = new TelegramBot(token, { polling: true });

/**
 * Helper function to call dashboard API
 */
async function callAPI(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${apiUrl}${endpoint}`,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
    
  } catch (error) {
    logger.error('API call failed:', error.message);
    throw error;
  }
}

/**
 * /start command
 */
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  const welcomeMessage = `
🎬 **Noir Factory Bot**

Welcome! I can help you monitor and control your video pipeline.

**Available Commands:**

💰 **Budget & Costs**
/cost - View today's spend and MTD total
/settings - Show current budget caps and model preset

📊 **Queue Management**
/queue - Show all jobs (default: last 10)
/queue processing - Show jobs being processed
/queue failed - Show failed jobs
/queue ready - Show completed jobs

⚡ **Actions**
/run_oneoff <url> - Create high-priority job (bypasses daily cap)

📈 **Analytics**
/analytics - View key metrics (cost, GPU, success rate)

Type any command to get started!
  `;
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

/**
 * /cost command
 */
bot.onText(/\/cost/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    bot.sendMessage(chatId, '💰 Fetching cost data...');
    
    const data = await callAPI('/api/dashboard/settings');
    
    const today = data.currentSpend?.today || 0;
    const month = data.currentSpend?.month || 0;
    const dailyCap = data.config?.daily_cap || 0;
    const monthlyCap = data.config?.monthly_cap || 0;
    const hardStop = data.config?.hard_stop_spend_usd || 0;
    
    const todayPercent = dailyCap > 0 ? ((today / dailyCap) * 100).toFixed(1) : 0;
    const monthPercent = monthlyCap > 0 ? ((month / monthlyCap) * 100).toFixed(1) : 0;
    
    const message = `
💰 **Cost Summary**

**Today:**
└ Total: $${today.toFixed(2)} / $${dailyCap}
└ Usage: ${todayPercent}%

**This Month:**
└ Total: $${month.toFixed(2)} / $${monthlyCap}
└ Usage: ${monthPercent}%

**Hard Stop Limit:** $${hardStop}

${month >= hardStop ? '🚨 Hard stop limit reached!' : ''}
${today >= dailyCap ? '⚠️ Daily cap reached!' : ''}
    `;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

/**
 * /queue command
 */
bot.onText(/\/queue(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const status = match[1] || null;
  
  try {
    bot.sendMessage(chatId, '📊 Fetching queue...');
    
    const endpoint = status ? `/api/dashboard/queue?status=${status}&limit=10` : '/api/dashboard/queue?limit=10';
    const data = await callAPI(endpoint);
    
    if (!data.jobs || data.jobs.length === 0) {
      return bot.sendMessage(chatId, `📭 No jobs found${status ? ` with status: ${status}` : ''}`);
    }
    
    let message = `📊 **Queue** ${status ? `(${status})` : ''}\n\n`;
    
    data.jobs.slice(0, 10).forEach((job, i) => {
      const statusEmoji = {
        'ready': '✅',
        'processing': '⏳',
        'failed': '❌',
        'draft': '📝'
      }[job.publish_status] || '📌';
      
      message += `${i + 1}. ${statusEmoji} ${job.source_title || 'Untitled'}\n`;
      message += `   └ Status: ${job.publish_status} | ${job.processing_step || 'N/A'}\n`;
      message += `   └ Cost: $${job.cost_usd.toFixed(4)} | GPU: ${job.gpu_hours}h\n`;
      if (job.error_message) {
        message += `   └ Error: ${job.error_message.substring(0, 50)}...\n`;
      }
      message += `\n`;
    });
    
    message += `\nTotal: ${data.count} jobs`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

/**
 * /settings command
 */
bot.onText(/\/settings/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    bot.sendMessage(chatId, '⚙️ Fetching settings...');
    
    const data = await callAPI('/api/dashboard/settings');
    const config = data.config || {};
    
    const message = `
⚙️ **Current Settings**

**Budget Caps:**
└ Daily Cap: $${config.daily_cap || 0}
└ Monthly Cap: $${config.monthly_cap || 0}
└ Hard Stop: $${config.hard_stop_spend_usd || 0}
└ One-off Ceiling: $${config.one_off_spend_ceiling_usd || 0}

**Model Preset:** ${config.model_preset || 'Balanced'}

**Overlay Mode:** ${config.default_overlay_mode || 'split_screen_bottom_content'}

**Batch Settings:**
└ Videos per Batch: ${config.videos_per_batch || 5}
└ Max Retries: ${config.max_retries_per_stage || 3}

Use the dashboard to update settings.
    `;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

/**
 * /run_oneoff command
 */
bot.onText(/\/run_oneoff\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1].trim();
  
  try {
    bot.sendMessage(chatId, `⚡ Creating one-off job for:\n${url}`);
    
    const data = await callAPI('/api/jobs/run-one-off', 'POST', { source_url: url });
    
    const message = `
✅ **One-off Job ${data.action === 'created' ? 'Created' : 'Updated'}!**

Job ID: \`${data.job_id}\`
URL: ${url}

This job bypasses the daily cap and will be processed with high priority.

Use /queue to monitor progress.
    `;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

/**
 * /analytics command
 */
bot.onText(/\/analytics/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    bot.sendMessage(chatId, '📈 Fetching analytics...');
    
    const data = await callAPI('/api/dashboard/metrics');
    const metrics = data.metrics || {};
    
    const cost = metrics.cost || {};
    const failureCount = metrics.failure_heatmap?.reduce((sum, item) => sum + item.failure_count, 0) || 0;
    const topError = metrics.top_errors?.[0] || null;
    
    const latestSuccess = metrics.success_rate_by_day?.[metrics.success_rate_by_day.length - 1];
    
    const message = `
📈 **Analytics Summary** (7 days)

**Cost Metrics:**
└ Avg per Draft: $${cost.avg_cost_per_draft || 0}
└ Total Spend: $${cost.total_spend_7d || 0}
└ Successful Drafts: ${cost.successful_drafts_7d || 0}
└ Total GPU Hours: ${cost.total_gpu_hours || 0}

**Success Rate:**
└ Latest: ${latestSuccess?.success_rate || 0}% (${latestSuccess?.date || 'N/A'})
└ Successful: ${latestSuccess?.successful || 0}
└ Failed: ${latestSuccess?.failed || 0}

**Failures:**
└ Total: ${failureCount}
${topError ? `└ Top Error: ${topError.message.substring(0, 50)}... (${topError.count}x)` : ''}

Use the dashboard for detailed charts.
    `;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error: ${error.message}`);
  }
});

/**
 * /help command
 */
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
🎬 **Noir Factory Bot - Help**

**💰 Budget & Costs**
/cost - Today's spend and MTD
/settings - Current configuration

**📊 Queue Management**
/queue - All jobs (last 10)
/queue <status> - Filter by status
  • processing
  • ready
  • failed
  • draft

**⚡ Actions**
/run_oneoff <url> - High-priority job

**📈 Analytics**
/analytics - 7-day metrics

**ℹ️ Info**
/help - This message
/start - Welcome message

**Examples:**
\`/queue processing\`
\`/run_oneoff https://reddit.com/r/...\`
  `;
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

/**
 * Start the bot
 */
function startBot() {
  logger.info('🤖 Telegram bot started');
  logger.info(`Bot username: @${bot.options.username || 'unknown'}`);
  
  bot.on('polling_error', (error) => {
    logger.error('Telegram polling error:', error.message);
  });
}

module.exports = {
  bot,
  startBot
};
