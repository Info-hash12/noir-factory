/**
 * Database Configuration
 * Supabase client initialization
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

let supabase = null;

/**
 * Initializes Supabase client
 * @returns {Object} Supabase client instance
 */
function initializeDatabase() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be configured');
    }

    if (!supabase) {
      supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false
        }
      });

      logger.info('Supabase client initialized successfully');
    }

    return supabase;

  } catch (error) {
    logger.error('Failed to initialize Supabase client:', error.message);
    throw error;
  }
}

/**
 * Gets the Supabase client instance
 * @returns {Object} Supabase client
 */
function getDatabase() {
  if (!supabase) {
    return initializeDatabase();
  }
  return supabase;
}

/**
 * Tests database connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const db = getDatabase();
    const { error } = await db.from('posts').select('count', { count: 'exact', head: true });

    if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found", which is okay for initial setup
      throw error;
    }

    logger.info('Database connection test successful');
    return true;

  } catch (error) {
    logger.error('Database connection test failed:', error.message);
    return false;
  }
}

module.exports = {
  initializeDatabase,
  getDatabase,
  testConnection
};
