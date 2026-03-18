/**
 * Notification Utilities
 * Multi-channel notification system (Slack, Telegram, Email)
 */

const axios = require('axios');
const logger = require('./logger');

/**
 * Sends notification via Slack
 * @param {string} message - Message text
 * @param {string} htmlMessage - HTML formatted message (optional)
 * @returns {Promise<boolean>} Success status
 */
async function sendSlackNotification(message, htmlMessage = null) {
  try {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      logger.warn('SLACK_WEBHOOK_URL not configured, skipping Slack notification');
      return false;
    }
    
    const payload = {
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        }
      ]
    };
    
    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    logger.info('✅ Slack notification sent');
    return true;
    
  } catch (error) {
    logger.error('Failed to send Slack notification:', error.message);
    return false;
  }
}

/**
 * Sends notification via Telegram
 * @param {string} message - Message text
 * @param {string} htmlMessage - HTML formatted message (optional)
 * @returns {Promise<boolean>} Success status
 */
async function sendTelegramNotification(message, htmlMessage = null) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
      logger.warn('Telegram credentials not configured, skipping Telegram notification');
      return false;
    }
    
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    }, {
      timeout: 10000
    });
    
    logger.info('✅ Telegram notification sent');
    return true;
    
  } catch (error) {
    logger.error('Failed to send Telegram notification:', error.message);
    return false;
  }
}

/**
 * Sends notification via Email (using SendGrid)
 * @param {string} subject - Email subject
 * @param {string} textContent - Plain text content
 * @param {string} htmlContent - HTML content
 * @returns {Promise<boolean>} Success status
 */
async function sendEmailNotification(subject, textContent, htmlContent) {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const toEmail = process.env.SENDGRID_TO_EMAIL;
    
    if (!apiKey || !fromEmail || !toEmail) {
      logger.warn('SendGrid credentials not configured, skipping email notification');
      return false;
    }
    
    await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [
          {
            to: [{ email: toEmail }],
            subject: subject
          }
        ],
        from: { email: fromEmail },
        content: [
          {
            type: 'text/plain',
            value: textContent
          },
          {
            type: 'text/html',
            value: htmlContent
          }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    logger.info('✅ Email notification sent');
    return true;
    
  } catch (error) {
    logger.error('Failed to send email notification:', error.message);
    return false;
  }
}

/**
 * Sends notification via all configured channels
 * @param {Object} options - Notification options
 * @returns {Promise<Object>} Results from each channel
 */
async function sendMultiChannelNotification(options) {
  const {
    subject = 'Noir Factory Report',
    message,
    htmlMessage = null
  } = options;
  
  const results = {
    slack: false,
    telegram: false,
    email: false
  };
  
  // Send to all configured channels in parallel
  const promises = [];
  
  if (process.env.SLACK_WEBHOOK_URL) {
    promises.push(
      sendSlackNotification(message, htmlMessage)
        .then(result => { results.slack = result; })
    );
  }
  
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    promises.push(
      sendTelegramNotification(message, htmlMessage)
        .then(result => { results.telegram = result; })
    );
  }
  
  if (process.env.SENDGRID_API_KEY) {
    promises.push(
      sendEmailNotification(subject, message, htmlMessage || message)
        .then(result => { results.email = result; })
    );
  }
  
  await Promise.allSettled(promises);
  
  const successCount = Object.values(results).filter(Boolean).length;
  logger.info(`📤 Notifications sent: ${successCount}/${promises.length} channels`);
  
  return results;
}

module.exports = {
  sendSlackNotification,
  sendTelegramNotification,
  sendEmailNotification,
  sendMultiChannelNotification
};
