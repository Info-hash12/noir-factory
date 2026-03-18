/**
 * Budget Control Middleware
 * Enforces daily caps and spending limits before processing batches
 */

const { supabase } = require('../db/local-adapter');
const logger = require('../utils/logger');

/**
 * Gets configuration value from app_config table
 * @param {string} key - Configuration key
 * @returns {Promise<any>} Configuration value
 */
async function getConfig(key) {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .single();
    
    if (error) throw error;
    
    return data?.value;
    
  } catch (error) {
    logger.error(`Failed to get config ${key}:`, error.message);
    throw error;
  }
}

/**
 * Updates configuration value in app_config table
 * @param {string} key - Configuration key
 * @param {any} value - Configuration value
 * @returns {Promise<void>}
 */
async function setConfig(key, value) {
  try {
    const { error } = await supabase
      .from('app_config')
      .upsert({ key, value: value }, { onConflict: 'key' });
    
    if (error) throw error;
    
    logger.info(`✅ Config updated: ${key} = ${JSON.stringify(value)}`);
    
  } catch (error) {
    logger.error(`Failed to set config ${key}:`, error.message);
    throw error;
  }
}

/**
 * Gets today's spending summary
 * @returns {Promise<Object>} Today's spend data
 */
async function getTodaysSpend() {
  try {
    const { data, error } = await supabase
      .from('daily_spend')
      .select('*')
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    
    return data || {
      total_jobs: 0,
      total_cost: 0,
      successful_jobs: 0,
      failed_jobs: 0
    };
    
  } catch (error) {
    logger.error('Failed to get today\'s spend:', error.message);
    throw error;
  }
}

/**
 * Gets this month's spending summary
 * @returns {Promise<Object>} Monthly spend data
 */
async function getMonthlySpend() {
  try {
    const { data, error } = await supabase
      .from('monthly_spend')
      .select('*')
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    
    return data || {
      total_jobs: 0,
      total_cost: 0,
      successful_jobs: 0,
      failed_jobs: 0
    };
    
  } catch (error) {
    logger.error('Failed to get monthly spend:', error.message);
    throw error;
  }
}

/**
 * Checks if budget limits allow processing
 * @param {boolean} isOneOff - Whether this is a one-off run
 * @returns {Promise<Object>} { allowed: boolean, reason: string }
 */
async function checkBudgetLimits(isOneOff = false) {
  try {
    logger.info('💰 Checking budget limits...');
    
    // Get configuration values
    const dailyCap = await getConfig('daily_cap');
    const monthlyCap = await getConfig('monthly_cap');
    const hardStopSpend = await getConfig('hard_stop_spend_usd');
    const oneOffCeiling = await getConfig('one_off_spend_ceiling_usd');
    
    // Get current spending
    const todaySpend = await getTodaysSpend();
    const monthlySpend = await getMonthlySpend();
    
    // Log current status
    logger.info(`📊 Today: ${todaySpend.total_jobs} jobs, $${todaySpend.total_cost?.toFixed(2) || 0}`);
    logger.info(`📊 Month: ${monthlySpend.total_jobs} jobs, $${monthlySpend.total_cost?.toFixed(2) || 0}`);
    logger.info(`⚙️  Limits: Daily cap=${dailyCap}, Monthly cap=${monthlyCap}, Hard stop=$${hardStopSpend}`);
    
    // Check hard stop spending limit (always enforced)
    if (todaySpend.total_cost >= hardStopSpend) {
      return {
        allowed: false,
        reason: `Daily hard stop limit reached: $${todaySpend.total_cost.toFixed(2)} / $${hardStopSpend}`
      };
    }
    
    // One-off runs bypass daily cap but respect hard stop
    if (isOneOff) {
      const remainingBudget = hardStopSpend - todaySpend.total_cost;
      
      if (remainingBudget < oneOffCeiling) {
        return {
          allowed: false,
          reason: `Insufficient budget for one-off: $${remainingBudget.toFixed(2)} remaining, need $${oneOffCeiling}`
        };
      }
      
      logger.info(`✅ One-off run approved (bypasses daily cap)`);
      return {
        allowed: true,
        reason: 'One-off run approved',
        remainingBudget
      };
    }
    
    // Check daily cap
    if (todaySpend.total_jobs >= dailyCap) {
      return {
        allowed: false,
        reason: `Daily job cap reached: ${todaySpend.total_jobs} / ${dailyCap}`
      };
    }
    
    // Check monthly cap
    if (monthlySpend.total_jobs >= monthlyCap) {
      return {
        allowed: false,
        reason: `Monthly job cap reached: ${monthlySpend.total_jobs} / ${monthlyCap}`
      };
    }
    
    // Calculate remaining capacity
    const remainingDaily = dailyCap - todaySpend.total_jobs;
    const remainingMonthly = monthlyCap - monthlySpend.total_jobs;
    const remainingBudget = hardStopSpend - todaySpend.total_cost;
    
    logger.info(`✅ Budget check passed`);
    logger.info(`📈 Remaining: ${remainingDaily} daily, ${remainingMonthly} monthly, $${remainingBudget.toFixed(2)} budget`);
    
    return {
      allowed: true,
      reason: 'Within budget limits',
      remainingDaily,
      remainingMonthly,
      remainingBudget
    };
    
  } catch (error) {
    logger.error('❌ Budget check failed:', error.message);
    // Fail safe - don't allow processing if budget check fails
    return {
      allowed: false,
      reason: `Budget check error: ${error.message}`
    };
  }
}

/**
 * Gets the batch size from configuration
 * @returns {Promise<number>} Videos per batch
 */
async function getBatchSize() {
  try {
    const batchSize = await getConfig('videos_per_batch');
    return parseInt(batchSize) || 5;
  } catch (error) {
    logger.warn('Failed to get batch size, using default: 5');
    return 5;
  }
}

/**
 * Gets all configuration values
 * @returns {Promise<Object>} All config values
 */
async function getAllConfig() {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*');
    
    if (error) throw error;
    
    // Convert to key-value object
    const config = {};
    data.forEach(row => {
      config[row.key] = row.value;
    });
    
    return config;
    
  } catch (error) {
    logger.error('Failed to get all config:', error.message);
    throw error;
  }
}

module.exports = {
  getConfig,
  setConfig,
  getTodaysSpend,
  getMonthlySpend,
  checkBudgetLimits,
  getBatchSize,
  getAllConfig
};
