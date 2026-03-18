/**
 * Publer Publishing Service
 * Uploads video + schedules/drafts posts across platforms
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const logger = require('../utils/logger');

const PUBLER_TOKEN = process.env.PUBLER_API_KEY;
const PUBLER_WORKSPACE_ID = process.env.PUBLER_WORKSPACE_ID;
const BASE_URL = 'https://app.publer.com/api/v1';

function publerHeaders(extra = {}) {
  return {
    'Authorization': `Bearer-API ${PUBLER_TOKEN}`,
    'Publer-Workspace-Id': PUBLER_WORKSPACE_ID,
    ...extra
  };
}

const PUBLISH_MODES = {
  immediate: { label: 'Publish Immediately', scheduled_at: null },
  best_time: { label: 'Next Best Time', scheduled_at: 'auto' },
  draft:     { label: 'Unscheduled Draft', scheduled_at: undefined }
};

const ALL_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook'];

/**
 * Fetch connected social accounts from the Publer workspace
 * Returns array of { id, provider, type, name, picture }
 */
async function getConnectedAccounts() {
  if (!PUBLER_TOKEN) throw new Error('PUBLER_API_KEY not configured');
  const resp = await axios.get(`${BASE_URL}/accounts`, {
    headers: publerHeaders(),
    timeout: 10000
  });
  const accounts = resp.data || [];
  return accounts.map(a => ({
    id: a.id,
    provider: a.provider,
    type: a.type,
    name: a.name || a.username || '',
    picture: a.picture || null,
    locked: a.locked || false
  }));
}

/**
 * Upload video file to Publer media library
 * Returns media ID
 */
async function uploadVideo(videoPath) {
  if (!PUBLER_TOKEN) throw new Error('PUBLER_API_KEY not configured');

  // Verify file exists before attempting upload
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found for Publer upload: ${videoPath}`);
  }
  const fileSizeMB = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  logger.info(`Uploading video to Publer: ${videoPath} (${fileSizeMB} MB)`);

  const form = new FormData();
  form.append('file', fs.createReadStream(videoPath));

  let response;
  try {
    response = await axios.post(`${BASE_URL}/media`, form, {
      headers: publerHeaders(form.getHeaders()),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000 // 5 min upload
    });
  } catch (e) {
    // Surface Publer's response body on HTTP errors (400/500/etc)
    const body = e.response?.data;
    const status = e.response?.status;
    const detail = body ? ` — Publer said: ${JSON.stringify(body).slice(0, 300)}` : '';
    throw new Error(`Publer media upload failed (HTTP ${status || 'no-response'})${detail}: ${e.message}`);
  }

  const mediaId = response.data?.id || response.data?.media_id;
  if (!mediaId) throw new Error(`Publer upload returned no media ID: ${JSON.stringify(response.data)}`);

  logger.info(`Publer media uploaded: ${mediaId} (${fileSizeMB} MB)`);
  // Return full upload data so createPost can include thumbnails (required for draft creation)
  return {
    id: mediaId,
    path: response.data.path || null,
    thumbnails: response.data.thumbnails || [],
    type: response.data.type || 'video'
  };
}

/**
 * Poll Publer job status until done or timeout
 */
async function pollJobStatus(jobId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const resp = await axios.get(`${BASE_URL}/job_status/${jobId}`, {
        headers: publerHeaders(),
        timeout: 10000
      });
      const status = resp.data?.status || resp.data?.state;
      logger.info(`Publer job ${jobId} status: ${status} — full response: ${JSON.stringify(resp.data).slice(0, 500)}`);
      if (status && !['pending', 'processing', 'in_progress'].includes(status.toLowerCase())) {
        // Check payload for per-post failures (Publer returns status:complete even on post errors)
        const payload = resp.data?.payload;
        if (Array.isArray(payload) && payload.length > 0) {
          const failures = payload.filter(p => p.status === 'failed' || p.type === 'error');
          if (failures.length > 0) {
            const msg = failures.map(f =>
              f.failure?.message || f.message || JSON.stringify(f)
            ).join('; ');
            throw new Error(`Publer post failed: ${msg}`);
          }
        }
        return resp.data;
      }
    } catch (e) {
      // Re-throw post failures so the pipeline surfaces them
      if (e.message.startsWith('Publer post failed:')) throw e;
      logger.warn(`Job status poll failed: ${e.message}`);
    }
  }
  logger.warn(`Publer job ${jobId} still processing after ${timeoutMs / 1000}s — continuing`);
  return { jobId, status: 'unknown' };
}

/**
 * Create a post in Publer using the bulk schedule API
 *
 * Endpoint routing (per Publer API docs):
 *   - immediate: POST /posts/schedule/publish  (publish right now, no scheduled_at)
 *   - draft:     POST /posts/schedule           (state: 'draft' at bulk level)
 *   - scheduled: POST /posts/schedule           (state: 'scheduled', scheduled_at at account level)
 *
 * state must be at the bulk level, NOT inside the post entry.
 */
async function createPost({ mediaData, mediaId, caption, hashtags, firstComment, platforms, publishMode }) {
  if (!PUBLER_TOKEN) throw new Error('PUBLER_API_KEY not configured');

  // Fetch connected accounts and match to requested platforms
  const connectedAccounts = await getConnectedAccounts();
  const requestedPlatforms = (platforms && platforms.length) ? platforms : ['instagram'];

  // Match requested platforms → connected accounts
  const matchedAccounts = [];
  const matchedPlatforms = [];
  for (const platform of requestedPlatforms) {
    const account = connectedAccounts.find(a => a.provider === platform && !a.locked);
    if (account) {
      matchedAccounts.push(account);
      matchedPlatforms.push(platform);
    } else {
      logger.warn(`Publer: no connected account for "${platform}" — skipping`);
    }
  }

  if (matchedAccounts.length === 0) {
    throw new Error(`No Publer accounts connected for platforms: ${requestedPlatforms.join(', ')}. Connect accounts in Publer first.`);
  }

  const text = [caption, hashtags].filter(Boolean).join('\n\n');

  const isDraft     = publishMode === 'draft';
  const isImmediate = publishMode === 'immediate';

  // Correct endpoint per publish mode
  const endpoint = isImmediate
    ? `${BASE_URL}/posts/schedule/publish`
    : `${BASE_URL}/posts/schedule`;

  // state goes at bulk level, not inside individual post entries
  const bulkState = isDraft ? 'draft' : 'scheduled';

  // Drafts: add scheduled_at so they appear in Publer's Calendar view (not just undated drafts)
  // Scheduled: pick a time ≥2 min from now to avoid Publer's "1 minute gap" error
  let scheduledAt;
  if (isDraft) {
    // Set to 1 hour from now so drafts appear on today's calendar for easy review
    scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  } else if (!isImmediate) {
    scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  }

  // Build networks object for each matched platform
  // Publer requires thumbnails in the media array for post creation (not just the ID)
  const resolvedMediaId = mediaData?.id || mediaId;
  const thumbnails = mediaData?.thumbnails || [];
  const networks = {};
  for (const platform of matchedPlatforms) {
    const mediaEntry = { id: resolvedMediaId };
    if (thumbnails.length > 0) {
      mediaEntry.thumbnails = thumbnails;
      mediaEntry.default_thumbnail = 0;
    }
    const entry = {
      type: 'video',
      text: text || '',
      media: [mediaEntry],
      // Post as Reel on Instagram for better reach
      ...(platform === 'instagram' ? { details: { type: 'reel', feed: true } } : {})
    };
    if (firstComment) entry.firstComment = firstComment;  // camelCase per Publer API
    networks[platform] = entry;
  }

  const postEntry = {
    networks,
    accounts: matchedAccounts.map(a => ({
      id: a.id,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {})
    }))
  };

  const payload = {
    bulk: {
      state: bulkState,
      posts: [postEntry]
    }
  };

  logger.info(`Creating Publer post (mode: ${publishMode}, endpoint: .../${endpoint.split('/').slice(-2).join('/')}, accounts: ${matchedAccounts.map(a => a.id).join(',')}, platforms: ${matchedPlatforms.join(',')})`);
  logger.info(`Publer payload: ${JSON.stringify(payload)}`);

  let response;
  try {
    response = await axios.post(endpoint, payload, {
      headers: publerHeaders({ 'Content-Type': 'application/json' }),
      timeout: 30000
    });
  } catch (e) {
    const body = e.response?.data;
    const status = e.response?.status;
    const detail = body ? ` — Publer said: ${JSON.stringify(body).slice(0, 300)}` : '';
    throw new Error(`Publer post creation failed (HTTP ${status || 'no-response'})${detail}: ${e.message}`);
  }

  const jobId = response.data?.job_id;
  if (!jobId) throw new Error(`Publer returned no job_id: ${JSON.stringify(response.data)}`);
  logger.info(`Publer job queued: ${jobId}`);

  const jobResult = await pollJobStatus(jobId);
  // Extract created post details from payload (Publer bulk API returns them there)
  const firstPost = Array.isArray(jobResult?.payload) ? jobResult.payload[0]?.post : null;
  const postId = firstPost?.id || jobResult?.post_id || jobResult?.id || jobId;
  const postUrl = firstPost?.post_link || jobResult?.url || null;

  logger.info(`Publer post done: ${postId}${postUrl ? ` → ${postUrl}` : ''}`);
  return { postId, postUrl, publishMode };
}

/**
 * Full publish flow: upload + create post
 */
async function publishVideo({ videoPath, caption, hashtags, firstComment, platforms, publishMode }) {
  const mediaData = await uploadVideo(videoPath);
  const result = await createPost({ mediaData, caption, hashtags, firstComment, platforms, publishMode });
  return { ...result, mediaId: mediaData.id };
}

module.exports = {
  uploadVideo,
  createPost,
  publishVideo,
  getConnectedAccounts,
  PUBLISH_MODES,
  ALL_PLATFORMS
};
