/**
 * Load server config from Supabase server_config table into process.env
 * Called once at startup — keys are stored in DB, not in git or env vars
 */

const { createClient } = require('@supabase/supabase-js');

async function loadServerConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.warn('[Config] No Supabase credentials — skipping config load');
    return;
  }

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false }
    });
    
    const { data, error } = await client
      .from('server_config')
      .select('key, value');
    
    if (error) {
      console.warn('[Config] Could not load server_config:', error.message);
      return;
    }
    
    let loaded = 0;
    for (const row of data || []) {
      if (!process.env[row.key]) {
        process.env[row.key] = row.value;
        loaded++;
      }
    }
    
    console.log(`[Config] Loaded ${loaded} keys from Supabase server_config`);
  } catch (e) {
    console.warn('[Config] Failed to load config:', e.message);
  }
}

module.exports = { loadServerConfig };
