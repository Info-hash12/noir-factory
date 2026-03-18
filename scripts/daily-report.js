/**
 * Daily Report Script
 * Generates and sends daily analytics report
 */

require('dotenv').config();
const { getYesterdayMetrics, getMonthToDateMetrics } = require('../src/services/analytics');
const { sendMultiChannelNotification } = require('../src/utils/notifications');
const logger = require('../src/utils/logger');

/**
 * Formats metrics as plain text
 * @param {Object} yesterday - Yesterday's metrics
 * @param {Object} mtd - Month-to-date metrics
 * @returns {string} Formatted text report
 */
function formatTextReport(yesterday, mtd) {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const yesterdayDate = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `
🎬 **NOIR FACTORY DAILY REPORT**
${yesterdayDate}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 YESTERDAY'S PERFORMANCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Videos Produced: ${yesterday.successful}
❌ Failures: ${yesterday.failed}
⏳ In Progress: ${yesterday.processing}
📈 Success Rate: ${yesterday.successRate}%

💰 COSTS:
  • Total Cost: $${yesterday.totalCost}
  • Cost per Video: $${yesterday.costPerVideo}
  • GPU Hours: ${yesterday.totalGpuHours}h

⚡ PERFORMANCE:
  • Avg Runtime: ${yesterday.avgRuntimeMinutes} min
  • Total Tokens: ${yesterday.totalTokens.toLocaleString()}
    - Prompt: ${yesterday.promptTokens.toLocaleString()}
    - Completion: ${yesterday.completionTokens.toLocaleString()}

${yesterday.failed > 0 ? `
🔥 FAILURE BREAKDOWN:
${Object.entries(yesterday.failuresByStage).map(([stage, count]) => 
  `  • ${stage}: ${count}`
).join('\n')}

⚠️  TOP ERRORS:
${yesterday.topErrors.map((error, i) => 
  `  ${i + 1}. [${error.count}x] ${error.message.substring(0, 60)}...`
).join('\n')}
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 MONTH-TO-DATE (MTD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Videos Produced: ${mtd.successful}
❌ Failures: ${mtd.failed}
📈 Success Rate: ${mtd.successRate}%

💰 COSTS:
  • Total Cost: $${mtd.totalCost}
  • Avg Cost/Video: $${mtd.costPerVideo}
  • GPU Hours: ${mtd.totalGpuHours}h

⚡ PERFORMANCE:
  • Avg Runtime: ${mtd.avgRuntimeMinutes} min
  • Total Tokens: ${mtd.totalTokens.toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generated at: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST
`.trim();
}

/**
 * Formats metrics as HTML
 * @param {Object} yesterday - Yesterday's metrics
 * @param {Object} mtd - Month-to-date metrics
 * @returns {string} Formatted HTML report
 */
function formatHTMLReport(yesterday, mtd) {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  const yesterdayDate = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
    .container { background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; border-bottom: 2px solid #ddd; padding-bottom: 8px; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
    .metric { background: #f9f9f9; padding: 15px; border-radius: 5px; border-left: 4px solid #4CAF50; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .metric-value { font-size: 24px; font-weight: bold; color: #1a1a1a; margin-top: 5px; }
    .success { color: #4CAF50; }
    .failure { color: #f44336; }
    .warning { color: #ff9800; }
    .error-list { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 Noir Factory Daily Report</h1>
    <p style="color: #666; font-size: 16px;">${yesterdayDate}</p>
    
    <h2>📊 Yesterday's Performance</h2>
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Videos Produced</div>
        <div class="metric-value success">${yesterday.successful}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Failures</div>
        <div class="metric-value failure">${yesterday.failed}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Success Rate</div>
        <div class="metric-value">${yesterday.successRate}%</div>
      </div>
      <div class="metric">
        <div class="metric-label">Avg Runtime</div>
        <div class="metric-value">${yesterday.avgRuntimeMinutes} min</div>
      </div>
    </div>
    
    <h3>💰 Costs</h3>
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Total Cost</div>
        <div class="metric-value">$${yesterday.totalCost}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Cost per Video</div>
        <div class="metric-value">$${yesterday.costPerVideo}</div>
      </div>
      <div class="metric">
        <div class="metric-label">GPU Hours</div>
        <div class="metric-value">${yesterday.totalGpuHours}h</div>
      </div>
    </div>
    
    ${yesterday.failed > 0 ? `
    <div class="error-list">
      <h4 style="margin-top: 0;">⚠️ Failure Breakdown</h4>
      <ul>
        ${Object.entries(yesterday.failuresByStage).map(([stage, count]) => 
          `<li><strong>${stage}:</strong> ${count} failures</li>`
        ).join('')}
      </ul>
      ${yesterday.topErrors.length > 0 ? `
      <h4>Top Errors:</h4>
      <ol>
        ${yesterday.topErrors.map(error => 
          `<li>[${error.count}x] ${error.message.substring(0, 100)}...</li>`
        ).join('')}
      </ol>
      ` : ''}
    </div>
    ` : ''}
    
    <h2>📅 Month-to-Date Summary</h2>
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Videos Produced</div>
        <div class="metric-value success">${mtd.successful}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Failures</div>
        <div class="metric-value failure">${mtd.failed}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Success Rate</div>
        <div class="metric-value">${mtd.successRate}%</div>
      </div>
      <div class="metric">
        <div class="metric-label">Total Cost</div>
        <div class="metric-value">$${mtd.totalCost}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Avg Cost/Video</div>
        <div class="metric-value">$${mtd.costPerVideo}</div>
      </div>
      <div class="metric">
        <div class="metric-label">GPU Hours</div>
        <div class="metric-value">${mtd.totalGpuHours}h</div>
      </div>
    </div>
    
    <div class="footer">
      Generated at ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST
    </div>
  </div>
</body>
</html>
`.trim();
}

/**
 * Generates and sends daily report
 * @returns {Promise<Object>} Report results
 */
async function generateDailyReport() {
  try {
    logger.info('📊 Generating daily report...');
    
    // Fetch metrics
    const yesterday = await getYesterdayMetrics();
    const mtd = await getMonthToDateMetrics();
    
    logger.info(`Yesterday: ${yesterday.successful} successful, ${yesterday.failed} failed`);
    logger.info(`MTD: ${mtd.successful} successful, ${mtd.failed} failed`);
    
    // Format reports
    const textReport = formatTextReport(yesterday, mtd);
    const htmlReport = formatHTMLReport(yesterday, mtd);
    
    // Send notifications
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const subject = `Noir Factory Daily Report - ${date.toLocaleDateString('en-US')}`;
    
    const results = await sendMultiChannelNotification({
      subject,
      message: textReport,
      htmlMessage: htmlReport
    });
    
    logger.info('✅ Daily report sent successfully');
    
    return {
      success: true,
      yesterday,
      mtd,
      notificationResults: results
    };
    
  } catch (error) {
    logger.error('❌ Failed to generate daily report:', error.message);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  generateDailyReport()
    .then(result => {
      console.log('Daily report generated successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to generate daily report:', error);
      process.exit(1);
    });
}

module.exports = { generateDailyReport };
