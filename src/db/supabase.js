/**
 * Supabase Client Module
 * Production-ready Supabase client with fallback support
 * Supports both service role (server-to-server) and user clients (JWT-based)
 */

const { createClient } = require('@supabase/supabase-js');

// Mock client for development when credentials are missing
const createMockClient = () => {
  console.warn('⚠️  Using MOCK Supabase client (credentials not provided)');
  return {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
      delete: () => Promise.resolve({ data: null, error: null }),
      eq: function() { return this; },
      single: () => Promise.resolve({ data: null, error: null }),
      order: function() { return this; },
      limit: function() { return this; },
      gte: function() { return this; },
      lt: function() { return this; },
      in: function() { return this; }
    }),
    auth: {
      getUser: () => Promise.resolve({ data: null, error: null })
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null })
      })
    }
  };
};

let supabaseAdminClient = null;
let isAdminInitialized = false;

/**
 * Initialize Admin Supabase client (service role)
 * @returns {Object} Supabase admin client instance
 */
function initializeAdminClient() {
  if (isAdminInitialized) {
    return supabaseAdminClient;
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    // Check for required environment variables
    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_KEY not set - using mock client');
      console.warn('Set environment variables for production use');
      console.warn('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY');
      supabaseAdminClient = createMockClient();
      isAdminInitialized = true;
      return supabaseAdminClient;
    }

    // Validate URL format
    if (!supabaseUrl.startsWith('http')) {
      throw new Error('Invalid SUPABASE_URL format (must start with http/https)');
    }

    // Create admin client with service role key (bypasses RLS)
    supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-application-name': 'noir-factory'
        }
      },
      realtime: {
        enabled: false
      }
    });

    console.log('✅ Supabase admin client initialized successfully');
    console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

    isAdminInitialized = true;
    return supabaseAdminClient;

  } catch (error) {
    console.error('❌ Failed to initialize Supabase admin client:', error.message);
    console.warn('⚠️  Falling back to mock client');
    supabaseAdminClient = createMockClient();
    isAdminInitialized = true;
    return supabaseAdminClient;
  }
}

/**
 * Create a user-scoped Supabase client with JWT
 * @param {string} accessToken - User's JWT access token
 * @returns {Object} Supabase user client instance (respects RLS)
 */
function createSupabaseClient(accessToken) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set');
      return createMockClient();
    }

    // Create user client with their JWT (respects RLS)
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'x-application-name': 'noir-factory'
        }
      },
      realtime: {
        enabled: false
      }
    });

    // Set the user's JWT as the Authorization header
    if (accessToken) {
      client.auth.setSession({
        access_token: accessToken,
        refresh_token: '',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: null
      });
    }

    return client;
  } catch (error) {
    console.error('❌ Failed to create Supabase user client:', error.message);
    return createMockClient();
  }
}

/**
 * Get admin Supabase client instance (singleton pattern)
 * @returns {Object} Supabase admin client
 */
function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = initializeAdminClient();
  }
  return supabaseAdminClient;
}

/**
 * Test Supabase connection
 * @returns {Promise<boolean>} True if connection successful
 */
async function testConnection() {
  try {
    const client = getSupabaseAdmin();

    // Try a simple query to test connection
    const { data, error } = await client
      .from('app_config')
      .select('id')
      .limit(1);

    if (error) {
      console.warn('⚠️  Supabase connection test failed:', error.message);
      return false;
    }

    console.log('✅ Supabase connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection test error:', error.message);
    return false;
  }
}

/**
 * Reset client (useful for testing)
 */
function resetAdminClient() {
  supabaseAdminClient = null;
  isAdminInitialized = false;
  console.log('🔄 Supabase admin client reset');
}

// Initialize on module load
const supabaseAdmin = initializeAdminClient();

// CommonJS exports
module.exports = {
  supabaseAdmin,
  getSupabaseAdmin,
  createSupabaseClient,
  initializeAdminClient,
  testConnection,
  resetAdminClient
};
