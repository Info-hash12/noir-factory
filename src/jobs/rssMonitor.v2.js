/**
 * RSS Monitor v2
 * Fetches RSS feed, deduplicates by URL + source ID, creates records in SQLite + Airtable
 * Jobs pause at 'pending_review' until approved in dashboard
 */

const cron = require('node-cron');
const Parser = require('rss-parser');
const { getSupabase } = require('../db/local-adapter');
const airtable = require('../services/airtable.service');
const logger = require('../utils/logger');

async function getRssFeeds(db) {
  // 1. Try multi-feed config (JSON array of {name, url, enabled})
  try {
    const { data } = await db.from('app_config').select('value').eq('key', 'rss_feeds').maybeSingle();
    if (data?.value) {
      const feeds = JSON.parse(data.value);
      const active = feeds.filter(f => f.enabled !== false && f.url);
      if (active.length > 0) return active;
    }
  } catch {}
  // 2. Legacy single-URL config key
  try {
    const { data } = await db.from('app_config').select('value').eq('key', 'reddit_rss_url').maybeSingle();
    if (data?.value) return [{ name: 'Default', url: data.value }];
  } catch {}
  // 3. Env var fallback
  if (process.env.REDDIT_RSS_URL) return [{ name: 'Default', url: process.env.REDDIT_RSS_URL }];
  return [];
}

const parser = new Parser({
  customFields: { item: [['content:encoded', 'content'], ['id', 'redditId']] }
});

let isProcessing = false;

/**
 * Main RSS check
 */
async function monitorRSS() {
  if (isProcessing) {
    logger.warn('RSS monitor already running, skipping');
    return;
  }
  isProcessing = true;

  try {
    const db = getSupabase();
    const feeds = await getRssFeeds(db);
    if (!feeds.length) throw new Error('No RSS feeds configured — add one in Dashboard → Settings or set REDDIT_RSS_URL env var');

    let created = 0, skipped = 0;

    for (const feed of feeds) {
      logger.info(`Fetching RSS feed "${feed.name}": ${feed.url}`);
      let parsedFeed;
      try {
        parsedFeed = await parser.parseURL(feed.url);
      } catch (e) {
        logger.error(`Failed to fetch feed "${feed.name}": ${e.message}`);
        continue;
      }

      if (!parsedFeed.items || parsedFeed.items.length === 0) {
        logger.info(`Feed "${feed.name}" returned no items`);
        continue;
      }

      logger.info(`Feed "${feed.name}": ${parsedFeed.items.length} items`);

      for (const item of parsedFeed.items) {
      const title = (item.title || '').trim();
      if (!title) continue;

      // Extract fields
      const url = item.link || item.guid || '';
      const guid = item.guid || item.id || url;
      const redditIdMatch = url.match(/\/comments\/([a-z0-9]+)\//);
      const sourceId = redditIdMatch ? redditIdMatch[1] : guid;
      const content = item.contentSnippet || item.content || item.description || '';
      const author = item['dc:creator'] || item.creator || item.author || 'u/unknown';
      const pubDate = item.pubDate || item.isoDate || new Date().toISOString();

      // ─── DEDUPLICATION: check SQLite first (fast) ──────────────────────
      const r1 = await db.from('content_jobs').select('id').eq('source_url', url).limit(1);
      if (r1.data && r1.data.length > 0) { skipped++; continue; }
      const r2 = await db.from('content_jobs').select('id').eq('source_id', sourceId).limit(1);
      if (r2.data && r2.data.length > 0) { skipped++; continue; }

      // ─── DEDUPLICATION: check Airtable ────────────────────────────────
      const isDup = await airtable.isDuplicate(url);
      if (isDup) {
        logger.debug(`Duplicate (Airtable): ${title.substring(0, 50)}`);
        skipped++;
        continue;
      }

      // ─── CREATE IN SQLITE ──────────────────────────────────────────────
      const { data: newJob, error } = await db
        .from('content_jobs')
        .insert([{
          source_id: sourceId,
          source_url: url,
          source_title: title,
          source_content: content,
          source_author: author,
          review_status: 'pending_review',
          publish_status: 'draft'
        }])
        .select()
        .single();

      if (error) {
        logger.error(`SQLite insert failed for "${title}": ${error.message}`);
        continue;
      }

      // ─── CREATE IN AIRTABLE ────────────────────────────────────────────
      let airtableRecordId = null;
      try {
        const atRecord = await airtable.createContentRecord({
          Title: title,
          URL: url,
          Content: content,
          'Content Snippet': content.substring(0, 500),
          Creator: author,
          PubDate: pubDate,
          Status: 'New'
        });
        airtableRecordId = atRecord.id;

        // Store Airtable record ID back in SQLite for later updates
        await db
          .from('content_jobs')
          .update({ airtable_record_id: airtableRecordId })
          .eq('id', newJob.id);

      } catch (atErr) {
        logger.warn(`Airtable create failed (continuing): ${atErr.message}`);
      }

      logger.info(`✅ New job: "${title.substring(0, 60)}" (Airtable: ${airtableRecordId || 'N/A'})`);
      created++;

      // Respect rate limits
      await sleep(500);
      } // end for item
    } // end for feed

    logger.info(`RSS cycle done: ${created} new, ${skipped} skipped`);
    return { created, skipped };

  } catch (err) {
    logger.error('RSS monitoring failed:', err.message);
  } finally {
    isProcessing = false;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function startRSSMonitor() {
  const schedule = process.env.RSS_CHECK_INTERVAL || '*/15 * * * *';

  if (!cron.validate(schedule)) {
    throw new Error(`Invalid RSS_CHECK_INTERVAL: ${schedule}`);
  }

  logger.info(`RSS monitor scheduled: ${schedule}`);
  const task = cron.schedule(schedule, monitorRSS);

  logger.info('Running initial RSS check...');
  monitorRSS().catch(e => logger.error('Initial RSS check failed:', e.message));

  return task;
}

async function triggerManualCheck() {
  logger.info('Manual RSS check triggered');
  return monitorRSS();
}

module.exports = { startRSSMonitor, triggerManualCheck, monitorRSS };
