/**
 * Analytics Service
 * Handles metric logging and data aggregation from Supabase
 */

const { supabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

/**
 * Logs a job metric to the database
 * @param {Object} metrics - Job metrics
 * @returns {Promise<void>}
 */
async function logJobMetric(metrics) {
  try {
    const { error } = await supabase
      .from('content_jobs')
      .update({
        generation_cost_estimate: metrics.cost || 0,
        gpu_seconds: metrics.gpuSeconds || 0,
        openrouter_prompt_tokens: metrics.promptTokens || 0,
        openrouter_completion_tokens: metrics.completionTokens || 0,
        voice_profile_used: metrics.voiceProfile || null,
        prompt_hash: metrics.promptHash || null,
        render_settings_hash: metrics.renderSettingsHash || null
      })
      .eq('id', metrics.jobId);
    
    if (error) throw error;
    
    logger.debug(`Metrics logged for job ${metrics.jobId}`);
    
  } catch (error) {
    logger.error('Failed to log job metric:', error.message);
    throw error;
  }
}

/**
 * Gets yesterday's metrics (00:00 to 23:59)
 * @returns {Promise<Object>} Yesterday's aggregated metrics
 */
async function getYesterdayMetrics() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);
    
    const { data, error } = await supabase
      .from('content_jobs')
      .select('*')
      .gte('created_at', yesterday.toISOString())
      .lte('created_at', endOfYesterday.toISOString());
    
    if (error) throw error;
    
    return aggregateMetrics(data, 'yesterday');
    
  } catch (error) {
    logger.error('Failed to get yesterday metrics:', error.message);
    throw error;
  }
}

/**
 * Gets month-to-date metrics
 * @returns {Promise<Object>} MTD aggregated metrics
 */
async function getMonthToDateMetrics() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('content_jobs')
      .select('*')
      .gte('created_at', startOfMonth.toISOString())
      .lte('created_at', now.toISOString());
    
    if (error) throw error;
    
    return aggregateMetrics(data, 'mtd');
    
  } catch (error) {
    logger.error('Failed to get MTD metrics:', error.message);
    throw error;
  }
}

/**
 * Aggregates metrics from job data
 * @param {Array} jobs - Array of job objects
 * @param {string} period - Period label
 * @returns {Object} Aggregated metrics
 */
function aggregateMetrics(jobs, period = 'custom') {
  const total = jobs.length;
  const successful = jobs.filter(j => j.publish_status === 'ready').length;
  const failed = jobs.filter(j => j.publish_status === 'failed').length;
  const processing = jobs.filter(j => j.publish_status === 'processing').length;
  
  const totalCost = jobs.reduce((sum, j) => sum + (j.generation_cost_estimate || 0), 0);
  const totalGpuSeconds = jobs.reduce((sum, j) => sum + (j.gpu_seconds || 0), 0);
  const totalPromptTokens = jobs.reduce((sum, j) => sum + (j.openrouter_prompt_tokens || 0), 0);
  const totalCompletionTokens = jobs.reduce((sum, j) => sum + (j.openrouter_completion_tokens || 0), 0);
  
  // Calculate average runtime for completed jobs
  const completedJobs = jobs.filter(j => j.processed_at && j.created_at);
  const avgRuntime = completedJobs.length > 0
    ? completedJobs.reduce((sum, j) => {
        const runtime = new Date(j.processed_at) - new Date(j.created_at);
        return sum + runtime;
      }, 0) / completedJobs.length / 1000 / 60 // Convert to minutes
    : 0;
  
  // Failure breakdown by stage
  const failuresByStage = {};
  jobs.filter(j => j.failed_stage).forEach(j => {
    failuresByStage[j.failed_stage] = (failuresByStage[j.failed_stage] || 0) + 1;
  });
  
  // Most common errors
  const errorCounts = {};
  jobs.filter(j => j.error_message).forEach(j => {
    const key = j.error_message.substring(0, 100); // First 100 chars
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  });
  
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));
  
  return {
    period,
    total,
    successful,
    failed,
    processing,
    successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : 0,
    totalCost: totalCost.toFixed(2),
    costPerVideo: successful > 0 ? (totalCost / successful).toFixed(2) : 0,
    totalGpuHours: (totalGpuSeconds / 3600).toFixed(2),
    totalTokens: totalPromptTokens + totalCompletionTokens,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
    avgRuntimeMinutes: avgRuntime.toFixed(1),
    failuresByStage,
    topErrors
  };
}

/**
 * Gets metrics for a specific date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Object>} Aggregated metrics
 */
async function getMetricsForRange(startDate, endDate) {
  try {
    const { data, error } = await supabase
      .from('content_jobs')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());
    
    if (error) throw error;
    
    return aggregateMetrics(data, 'custom');
    
  } catch (error) {
    logger.error('Failed to get metrics for range:', error.message);
    throw error;
  }
}

/**
 * Gets daily metrics breakdown for the last N days
 * @param {number} days - Number of days to retrieve
 * @returns {Promise<Array>} Array of daily metrics
 */
async function getDailyBreakdown(days = 7) {
  try {
    const metrics = [];
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      const dayMetrics = await getMetricsForRange(date, endDate);
      dayMetrics.date = date.toISOString().split('T')[0];
      
      metrics.push(dayMetrics);
    }
    
    return metrics.reverse(); // Oldest first
    
  } catch (error) {
    logger.error('Failed to get daily breakdown:', error.message);
    throw error;
  }
}

module.exports = {
  logJobMetric,
  getYesterdayMetrics,
  getMonthToDateMetrics,
  getMetricsForRange,
  getDailyBreakdown,
  aggregateMetrics
};
