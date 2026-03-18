/**
 * Local SQLite Adapter — Supabase-compatible API
 * Replaces Supabase client when network is unavailable
 * Mirrors the chained query builder API: .from().select().eq().limit()...
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../../noir-factory.db');

let db = null;
let SQL = null;

async function initDB() {
  if (db) return db;
  SQL = await initSqlJs();
  
  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('✅ Local SQLite DB loaded from disk');
  } else {
    db = new SQL.Database();
    console.log('✅ Local SQLite DB created fresh');
  }
  
  setupSchema();
  seedDefaults();
  return db;
}

function saveDB() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch(e) {
    console.error('Failed to save DB:', e.message);
  }
}

// Save every 5 seconds
setInterval(saveDB, 5000);
process.on('SIGTERM', saveDB);
process.on('SIGINT', saveDB);
process.on('exit', saveDB);

function setupSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS content_jobs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
      source_id TEXT,
      source_url TEXT,
      source_title TEXT,
      source_content TEXT,
      source_author TEXT,
      publish_status TEXT DEFAULT 'draft',
      processing_step TEXT,
      review_status TEXT DEFAULT 'pending_review',
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      processed_at TEXT,
      failed_at TEXT,
      reviewed_at TEXT,
      generation_cost_estimate REAL DEFAULT 0.0,
      cost_estimate REAL DEFAULT 0.0,
      gpu_seconds REAL DEFAULT 0.0,
      openrouter_prompt_tokens INTEGER DEFAULT 0,
      openrouter_completion_tokens INTEGER DEFAULT 0,
      openrouter_tokens TEXT DEFAULT '{}',
      one_off_run INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      failed_stage TEXT,
      error_message TEXT,
      pipeline_version TEXT DEFAULT 'v1',
      overlay_mode TEXT DEFAULT 'split_screen_bottom_content',
      voice_profile_used TEXT,
      prompt_hash TEXT,
      render_settings_hash TEXT,
      screenshot_url TEXT,
      script_text TEXT,
      audio_url TEXT,
      video_url TEXT,
      airtable_record_id TEXT,
      source_guid TEXT,
      hook_text TEXT,
      caption_text TEXT,
      hashtags_text TEXT,
      first_comment_text TEXT,
      on_screen_text TEXT,
      avatar_name TEXT,
      layout_type TEXT DEFAULT 'pip_reddit_bg',
      publish_mode TEXT DEFAULT 'draft',
      publer_post_id TEXT,
      updated_at TEXT
    )
  `);

  // Add new columns to existing DBs (idempotent)
  const newCols = [
    'airtable_record_id TEXT', 'source_guid TEXT', 'hook_text TEXT',
    'caption_text TEXT', 'hashtags_text TEXT', 'first_comment_text TEXT',
    'on_screen_text TEXT', 'avatar_name TEXT', 'layout_type TEXT',
    'publish_mode TEXT', 'publer_post_id TEXT', 'updated_at TEXT',
    'company_id TEXT', 'content_item_id TEXT', 'type TEXT', 'platforms TEXT', 'first_comment TEXT', 'status TEXT'
  ];
  for (const col of newCols) {
    const colName = col.split(' ')[0];
    try { db.run(`ALTER TABLE content_jobs ADD COLUMN ${col}`); } catch {}
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reddit_id TEXT UNIQUE,
      title TEXT,
      url TEXT,
      author TEXT,
      status TEXT DEFAULT 'pending',
      screenshot_url TEXT,
      ai_score INTEGER,
      ai_analysis TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      processed_at TEXT,
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);

  console.log('✅ Schema ready');
}

function seedDefaults() {
  const defaults = [
    // Budget
    ['videos_per_batch', '5'],
    ['daily_cap', '25'],
    ['monthly_cap', '500'],
    ['hard_stop_spend_usd', '50.0'],
    ['max_retries_per_stage', '3'],
    ['one_off_spend_ceiling_usd', '5.0'],
    // OpenRouter / LLM
    ['openrouter_model', 'anthropic/claude-3.5-sonnet'],
    ['openrouter_temperature', '0.75'],
    ['openrouter_max_tokens', '1200'],
    // Prompts (stored as text)
    ['script_system_prompt', 'DEFAULT'],
    // Video
    ['default_video_length', 'story_short'],
    ['default_layout', 'pip_reddit_bg'],
    ['default_avatar_shape', 'circle'],
    ['default_avatar_position', 'bottom_right'],
    ['default_transition', 'hard_cut'],
    ['default_bg_blur', 'true'],
    ['default_hook_duration', '2'],
    ['default_reddit_zoom', 'title_first_para'],
    // InfiniteTalk (replaces SadTalker)
    ['infinitetalk_resolution', '720p'],
    ['infinitetalk_fps', '25'],
    ['infinitetalk_enhance_prompt', 'true'],
    // Face Restoration (CodeFormer)
    ['enable_video_face_restore', 'false'],
    ['restore_fidelity', '0.7'],
    ['restore_concurrency', '5'],
    ['restore_frame_skip', '1'],
    // TTS
    ['tts_exaggeration', '0.5'],
    ['tts_cfg_weight', '0.5'],
    // Publer
    ['default_publish_mode', 'draft'],
    ['default_platforms', 'tiktok,instagram,youtube,facebook'],
    // Legacy
    ['model_preset', 'balanced'],
    ['default_overlay_mode', 'split-screen'],
  ];
  const stmt = db.prepare(`INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)`);
  for (const [k, v] of defaults) stmt.run([k, v]);
  stmt.free();

  // Seed some demo jobs if empty
  const count = db.exec(`SELECT COUNT(*) as c FROM content_jobs`);
  const n = count[0]?.values[0]?.[0] || 0;
  if (n === 0) {
    const demoJobs = [
      { title: 'AITA for refusing to pay back my sister?', status: 'ready', step: 'complete', review: 'approved', cost: 0.0342, gpu: 127.4 },
      { title: 'My coworker ate my lunch AGAIN and HR did nothing', status: 'processing', step: 'tts_generation', review: 'approved', cost: 0.0121, gpu: 43.2 },
      { title: 'Update: I confronted my neighbor about the noise', status: 'draft', step: 'screenshot', review: 'pending_review', cost: 0.0, gpu: 0 },
      { title: 'NTA - Husband expected me to cancel vacation for his work event', status: 'failed', step: 'video_generation', review: 'approved', cost: 0.0089, gpu: 31.1, error: 'RunPod GPU timeout after 300s', failed_stage: 'video_generation' },
      { title: 'WIBTA if I told my parents about my siblings secret?', status: 'ready', step: 'complete', review: 'approved', cost: 0.0298, gpu: 98.7 },
      { title: 'My landlord entered without notice — what are my rights?', status: 'draft', step: null, review: 'pending_review', cost: 0.0, gpu: 0 },
      { title: 'Finally got promoted after 3 years of being passed over', status: 'ready', step: 'complete', review: 'approved', cost: 0.0411, gpu: 154.3 },
      { title: 'AITA for not inviting my mom to my wedding?', status: 'processing', step: 'script_generation', review: 'approved', cost: 0.0055, gpu: 0 },
    ];

    const now = new Date();
    for (let i = 0; i < demoJobs.length; i++) {
      const j = demoJobs[i];
      const age = new Date(now.getTime() - (i * 3600000 * 4)); // stagger by 4hrs
      db.run(`
        INSERT OR IGNORE INTO content_jobs 
        (id, source_title, source_url, publish_status, processing_step, review_status, 
         created_at, generation_cost_estimate, cost_estimate, gpu_seconds, retry_count, 
         failed_stage, error_message, one_off_run)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, [
        `demo-${i.toString().padStart(4,'0')}-0000-0000-000000000000`,
        j.title,
        `https://reddit.com/r/AmItheAsshole/comments/demo${i}/`,
        j.status,
        j.step || null,
        j.review,
        age.toISOString(),
        j.cost,
        j.cost,
        j.gpu,
        j.status === 'failed' ? 2 : 0,
        j.failed_stage || null,
        j.error || null
      ]);
    }
    saveDB();
    console.log('✅ Demo data seeded');
  }
}

// ========== Query Builder ==========

function makeBuilder(tableName) {
  const state = {
    table: tableName,
    selectCols: '*',
    filters: [],
    filterVals: [],
    orderCol: null,
    orderAsc: true,
    limitVal: null,
    singleRow: false,
    countExact: false,
    headOnly: false,
    notNullCol: null,
    insertData: null,
    updateData: null,
    upsertData: null,
    upsertConflict: null,
    deleteFlag: false,
    isUpdate: false,
    isInsert: false,
    isUpsert: false,
    isDelete: false,
  };

  const b = {
    select(cols, opts = {}) {
      if (typeof cols === 'string') state.selectCols = cols;
      if (opts.count === 'exact') state.countExact = true;
      if (opts.head) state.headOnly = true;
      return b;
    },
    insert(data) {
      state.isInsert = true;
      state.insertData = Array.isArray(data) ? data : [data];
      return b;
    },
    update(data) {
      state.isUpdate = true;
      state.updateData = data;
      return b;
    },
    upsert(data, opts = {}) {
      state.isUpsert = true;
      state.upsertData = Array.isArray(data) ? data : [data];
      state.upsertConflict = opts.onConflict || null;
      return b;
    },
    delete() {
      state.isDelete = true;
      return b;
    },
    eq(col, val) {
      state.filters.push(`"${col}" = ?`);
      state.filterVals.push(val);
      return b;
    },
    neq(col, val) {
      state.filters.push(`"${col}" != ?`);
      state.filterVals.push(val);
      return b;
    },
    not(col, op, val) {
      if (op === 'is' && val === null) {
        state.filters.push(`"${col}" IS NOT NULL`);
      }
      return b;
    },
    is(col, val) {
      if (val === null) state.filters.push(`"${col}" IS NULL`);
      else { state.filters.push(`"${col}" = ?`); state.filterVals.push(val); }
      return b;
    },
    gte(col, val) {
      state.filters.push(`"${col}" >= ?`);
      state.filterVals.push(val);
      return b;
    },
    lte(col, val) {
      state.filters.push(`"${col}" <= ?`);
      state.filterVals.push(val);
      return b;
    },
    lt(col, val) {
      state.filters.push(`"${col}" < ?`);
      state.filterVals.push(val);
      return b;
    },
    gt(col, val) {
      state.filters.push(`"${col}" > ?`);
      state.filterVals.push(val);
      return b;
    },
    or(filterString) {
      // Parse Supabase-style filter strings like "col.eq.val,col2.eq.val2"
      const parts = filterString.split(',');
      const orClauses = [];
      for (const part of parts) {
        const match = part.match(/^([^.]+)\.(eq|neq|gt|gte|lt|lte|is)\.(.*)/);
        if (!match) continue;
        const [, col, op, val] = match;
        const sqlOp = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', is: 'IS' }[op];
        if (val === 'null') {
          orClauses.push(`"${col}" IS NULL`);
        } else {
          orClauses.push(`"${col}" ${sqlOp} ?`);
          state.filterVals.push(val);
        }
      }
      if (orClauses.length > 0) {
        state.filters.push(`(${orClauses.join(' OR ')})`);
      }
      return b;
    },
    in(col, vals) {
      const placeholders = vals.map(() => '?').join(',');
      state.filters.push(`"${col}" IN (${placeholders})`);
      state.filterVals.push(...vals);
      return b;
    },
    order(col, opts = {}) {
      state.orderCol = col;
      state.orderAsc = opts.ascending !== false;
      return b;
    },
    limit(n) {
      state.limitVal = n;
      return b;
    },
    single() {
      state.singleRow = true;
      state.limitVal = 1;
      return b;
    },
    maybeSingle() {
      // Same as single() but never errors on zero rows (returns null data)
      state.singleRow = true;
      state.limitVal = 1;
      return b;
    },
    async then(resolve, reject) {
      try {
        const result = await execute(state);
        resolve(result);
      } catch(e) {
        reject(e);
      }
    }
  };

  // Make it thenable
  b[Symbol.toStringTag] = 'Promise';
  
  return b;
}

function whereClause(state) {
  if (!state.filters.length) return '';
  return ' WHERE ' + state.filters.join(' AND ');
}

// Virtual views
function resolveVirtualTable(tableName, state) {
  if (tableName === 'daily_spend') {
    const rows = db.exec(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as total_jobs,
        SUM(generation_cost_estimate) as total_cost,
        SUM(CASE WHEN publish_status = 'ready' THEN 1 ELSE 0 END) as successful_jobs,
        SUM(CASE WHEN publish_status = 'failed' THEN 1 ELSE 0 END) as failed_jobs
      FROM content_jobs
      WHERE date(created_at) = date('now')
      GROUP BY date(created_at)
    `);
    return formatResult(rows, state.singleRow);
  }

  if (tableName === 'monthly_spend') {
    const rows = db.exec(`
      SELECT 
        strftime('%Y-%m-01', created_at) as month,
        COUNT(*) as total_jobs,
        SUM(generation_cost_estimate) as total_cost,
        SUM(CASE WHEN publish_status = 'ready' THEN 1 ELSE 0 END) as successful_jobs,
        SUM(CASE WHEN publish_status = 'failed' THEN 1 ELSE 0 END) as failed_jobs
      FROM content_jobs
      WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
      GROUP BY strftime('%Y-%m-01', created_at)
    `);
    return formatResult(rows, state.singleRow);
  }

  if (tableName === 'failure_heatmap') {
    const rows = db.exec(`
      SELECT 
        failed_stage,
        COUNT(*) as failure_count,
        AVG(generation_cost_estimate) as avg_cost_at_failure
      FROM content_jobs
      WHERE publish_status = 'failed'
        AND failed_stage IS NOT NULL
        AND created_at >= datetime('now', '-7 days')
      GROUP BY failed_stage
      ORDER BY failure_count DESC
    `);
    return formatResult(rows, false);
  }

  if (tableName === 'cost_metrics') {
    const rows = db.exec(`
      SELECT 
        ROUND(AVG(generation_cost_estimate), 4) as avg_cost_per_draft,
        ROUND(SUM(generation_cost_estimate), 4) as total_spend_7d,
        COUNT(*) as successful_drafts_7d,
        ROUND(SUM(gpu_seconds) / 3600.0, 2) as total_gpu_hours
      FROM content_jobs
      WHERE publish_status = 'ready'
        AND created_at >= datetime('now', '-7 days')
    `);
    return formatResult(rows, true);
  }

  return null;
}

function formatResult(sqlResult, single) {
  if (!sqlResult || !sqlResult.length || !sqlResult[0].values.length) {
    return { data: single ? null : [], error: null };
  }
  const cols = sqlResult[0].columns;
  const rows = sqlResult[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
  return { data: single ? rows[0] : rows, error: null };
}

async function execute(state) {
  if (!db) await initDB();

  const { table, isInsert, isUpdate, isUpsert, isDelete } = state;

  // Virtual tables
  if (['daily_spend','monthly_spend','failure_heatmap','cost_metrics'].includes(table)) {
    return resolveVirtualTable(table, state);
  }

  if (isInsert) {
    const rows = state.insertData;
    for (const row of rows) {
      const keys = Object.keys(row);
      // Generate UUID if not provided
      if (!row.id) row.id = generateUUID();
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(',');
      db.run(
        `INSERT OR IGNORE INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${placeholders})`,
        cols.map(c => serializeVal(row[c]))
      );
    }
    saveDB();
    // Return inserted row(s)
    if (state.singleRow) {
      const id = rows[0].id;
      const result = db.exec(`SELECT * FROM "${table}" WHERE id = ?`, [id]);
      return { ...formatResult(result, true), data: { ...rows[0], id } };
    }
    return { data: rows.length === 1 ? rows[0] : rows, error: null };
  }

  if (isUpsert) {
    const rows = state.upsertData;
    for (const row of rows) {
      const conflictCol = state.upsertConflict || 'id';
      // Only add auto-id if no conflict col is already present and it's not 'key'
      if (!row[conflictCol] && conflictCol === 'id') row.id = generateUUID();
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(',');
      const updates = cols.filter(c => c !== conflictCol).map(c => `"${c}" = excluded."${c}"`).join(', ');
      const sql = `INSERT INTO "${table}" (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${placeholders}) ON CONFLICT("${conflictCol}") DO UPDATE SET ${updates}`;
      db.run(sql, cols.map(c => serializeVal(row[c])));
    }
    saveDB();
    return { data: rows[0], error: null };
  }

  if (isUpdate) {
    const data = state.updateData;
    const setCols = Object.keys(data).map(c => `"${c}" = ?`).join(', ');
    const setVals = Object.values(data).map(serializeVal);
    const where = whereClause(state);
    db.run(
      `UPDATE "${table}" SET ${setCols}${where}`,
      [...setVals, ...state.filterVals]
    );
    saveDB();
    // Return updated row
    if (state.singleRow && state.filters.length) {
      const result = db.exec(`SELECT * FROM "${table}"${where} LIMIT 1`, state.filterVals);
      return formatResult(result, true);
    }
    return { data: null, error: null };
  }

  if (isDelete) {
    const where = whereClause(state);
    db.run(`DELETE FROM "${table}"${where}`, state.filterVals);
    saveDB();
    return { data: null, error: null };
  }

  // SELECT
  const cols = state.selectCols === '*' ? '*' : state.selectCols.split(',').map(c => `"${c.trim()}"`).join(', ');
  const where = whereClause(state);
  const order = state.orderCol ? ` ORDER BY "${state.orderCol}" ${state.orderAsc ? 'ASC' : 'DESC'}` : '';
  const limit = state.limitVal ? ` LIMIT ${state.limitVal}` : '';
  
  const sql = `SELECT ${cols} FROM "${table}"${where}${order}${limit}`;
  
  try {
    const result = db.exec(sql, state.filterVals);
    return formatResult(result, state.singleRow);
  } catch(e) {
    return { data: null, error: { message: e.message, code: 'SQLITE_ERROR' } };
  }
}

function serializeVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ========== Public API ==========

let initialized = false;

const localClient = {
  from(tableName) {
    return makeBuilder(tableName);
  },
  storage: {
    from: () => ({
      upload: async () => ({ data: null, error: null }),
      download: async () => ({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } })
    })
  }
};

// Initialize async on first use
const originalFrom = localClient.from.bind(localClient);
localClient.from = function(table) {
  if (!initialized) {
    initialized = true;
    initDB().catch(console.error);
  }
  return originalFrom(table);
};

// Initialize immediately
initDB().then(() => {
  console.log('✅ Local SQLite adapter ready');
}).catch(e => {
  console.error('❌ Local adapter init failed:', e.message);
});

module.exports = { 
  supabase: localClient, 
  getSupabase: () => localClient,
  getDatabase: () => localClient,
  initializeDatabase: () => localClient,
  initializeSupabase: () => localClient,
  testConnection: async () => true,
  resetClient: () => {}
};
