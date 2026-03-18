/**
 * Screenshot Service (HTMLCSStoImage)
 * Renders Reddit post as a styled 9:16 dark-mode mobile screenshot
 */

const axios = require('axios');
const logger = require('../utils/logger');

const HCTI_URL = 'https://hcti.io/v1/image';
const HCTI_USER_ID = process.env.HCTI_USER_ID;
const HCTI_API_KEY = process.env.HCTI_API_KEY;

/**
 * Video length presets — map label → word count guidance for content truncation
 */
const ZOOM_PRESETS = {
  'title_only': { maxChars: 0, label: 'Title Only' },
  'title_first_para': { maxChars: 400, label: 'Title + First Paragraph' },
  'full_post': { maxChars: 1200, label: 'Full Post' }
};

/**
 * Generate Reddit-style dark mode HTML card (mobile 9:16)
 * Looks like a real phone screenshot of the Reddit app
 */
function generateRedditHTML(data, zoomPreset = 'title_first_para') {
  const { title, content, author, subreddit, upvotes, comments } = data;

  const esc = s => String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const preset = ZOOM_PRESETS[zoomPreset] || ZOOM_PRESETS['title_first_para'];
  let bodyText = content || '';
  if (preset.maxChars === 0) {
    bodyText = '';
  } else if (bodyText.length > preset.maxChars) {
    bodyText = bodyText.substring(0, preset.maxChars) + '...';
  }

  const fakeUpvotes = upvotes || ((Math.floor(Math.random() * 18) + 2) * 100 + Math.floor(Math.random() * 99));
  const fakeComments = comments || (Math.floor(Math.random() * 180) + 15);
  const fakeKarma = `${(fakeUpvotes / 1000).toFixed(1)}k`;
  const timeAgo = `${Math.floor(Math.random() * 12) + 1}h`;
  const subName = subreddit || 'r/realestate';
  const authorName = author || 'u/RE_Insights';

  // 1080×1920 — renders as genuine mobile Reddit dark mode
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-font-smoothing: antialiased; }
  body {
    width: 1080px;
    background: #1a1a1b;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
    color: #d7dadc;
    overflow: hidden;
  }

  /* Status bar */
  .status-bar {
    background: #1a1a1b;
    padding: 28px 40px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 26px;
    font-weight: 600;
    color: #d7dadc;
  }
  .status-time { font-size: 30px; font-weight: 700; }
  .status-icons { display: flex; gap: 12px; align-items: center; }
  .signal { display: flex; gap: 4px; align-items: flex-end; }
  .signal span { width: 8px; background: #d7dadc; border-radius: 2px; }
  .signal span:nth-child(1) { height: 14px; }
  .signal span:nth-child(2) { height: 20px; }
  .signal span:nth-child(3) { height: 26px; }
  .signal span:nth-child(4) { height: 32px; }
  .wifi { font-size: 26px; }
  .battery {
    width: 46px; height: 24px; border: 2px solid #d7dadc; border-radius: 4px;
    position: relative; display: flex; align-items: center; padding: 2px;
  }
  .battery::after { content: ''; width: 4px; height: 10px; background: #d7dadc; position: absolute; right: -7px; border-radius: 0 2px 2px 0; }
  .battery-fill { width: 80%; height: 100%; background: #d7dadc; border-radius: 2px; }

  /* Nav bar */
  .nav-bar {
    background: #1a1a1b;
    border-bottom: 1px solid #343536;
    padding: 16px 40px;
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .back-btn { color: #ff4500; font-size: 32px; font-weight: 500; }
  .nav-title { font-size: 28px; font-weight: 600; color: #ff4500; }
  .nav-right { margin-left: auto; display: flex; gap: 32px; }
  .nav-icon { font-size: 32px; color: #818384; }

  /* Post container */
  .post-card {
    background: #1a1a1b;
    margin: 0;
    padding: 28px 36px;
    border-bottom: 8px solid #272729;
  }

  /* Subreddit header */
  .post-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 18px;
  }
  .sub-icon {
    width: 60px; height: 60px; border-radius: 50%;
    background: linear-gradient(135deg, #ff4500, #ff6534);
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 800; color: white; flex-shrink: 0;
  }
  .sub-info { display: flex; flex-direction: column; gap: 4px; }
  .sub-name { font-size: 26px; font-weight: 700; color: #d7dadc; }
  .post-info { font-size: 23px; color: #818384; }
  .post-info span { color: #d7dadc; }
  .join-btn {
    margin-left: auto;
    background: #ff4500;
    color: white;
    border: none;
    border-radius: 24px;
    padding: 10px 28px;
    font-size: 24px;
    font-weight: 700;
  }

  /* Title */
  .post-title {
    font-size: 38px;
    font-weight: 700;
    line-height: 1.35;
    color: #d7dadc;
    margin-bottom: 18px;
    word-break: break-word;
  }

  /* Body */
  .post-body {
    font-size: 30px;
    line-height: 1.6;
    color: #9a9a9b;
    margin-bottom: 28px;
    word-break: break-word;
    white-space: pre-wrap;
  }

  /* Award tags */
  .awards {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .award {
    background: #272729;
    border-radius: 20px;
    padding: 6px 18px;
    font-size: 22px;
    color: #818384;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Action bar */
  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 20px;
    border-top: 1px solid #343536;
  }
  .vote-cluster {
    display: flex;
    align-items: center;
    background: #272729;
    border-radius: 30px;
    overflow: hidden;
  }
  .vote-btn {
    padding: 14px 22px;
    font-size: 28px;
    color: #818384;
    display: flex;
    align-items: center;
  }
  .vote-btn.up { color: #ff4500; }
  .vote-count {
    padding: 14px 8px;
    font-size: 26px;
    font-weight: 700;
    color: #ff4500;
    min-width: 80px;
    text-align: center;
  }
  .action-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #272729;
    border-radius: 30px;
    padding: 14px 22px;
    font-size: 25px;
    color: #818384;
    white-space: nowrap;
  }
  .action-more {
    margin-left: auto;
    background: #272729;
    border-radius: 30px;
    padding: 14px 22px;
    font-size: 28px;
    color: #818384;
  }

  /* Comment preview */
  .comment-hint {
    background: #272729;
    padding: 20px 28px;
    margin-top: 8px;
    font-size: 25px;
    color: #818384;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  /* Home indicator */
  .home-indicator {
    width: 180px;
    height: 8px;
    background: #d7dadc;
    border-radius: 4px;
    opacity: 0.5;
    margin: 32px auto 24px;
  }
</style>
</head>
<body>

<!-- Status bar -->
<div class="status-bar">
  <div class="status-time">9:41</div>
  <div class="status-icons">
    <div class="signal">
      <span></span><span></span><span></span><span></span>
    </div>
    <div class="wifi">📶</div>
    <div class="battery"><div class="battery-fill"></div></div>
  </div>
</div>

<!-- Nav -->
<div class="nav-bar">
  <div class="back-btn">‹</div>
  <div class="nav-title">${esc(subName)}</div>
  <div class="nav-right">
    <div class="nav-icon">🔍</div>
    <div class="nav-icon">⋮</div>
  </div>
</div>

<!-- Post -->
<div class="post-card">
  <!-- Sub header -->
  <div class="post-meta">
    <div class="sub-icon">${esc(subName.replace('r/', '').substring(0, 2).toUpperCase())}</div>
    <div class="sub-info">
      <div class="sub-name">${esc(subName)}</div>
      <div class="post-info">Posted by <span>${esc(authorName)}</span> · ${timeAgo}</div>
    </div>
    <button class="join-btn">Join</button>
  </div>

  <!-- Title -->
  <div class="post-title">${esc(title)}</div>

  <!-- Body (optional) -->
  ${bodyText ? `<div class="post-body">${esc(bodyText)}</div>` : ''}

  <!-- Awards -->
  <div class="awards">
    <div class="award">🏆 <span>${Math.floor(Math.random() * 40) + 5}</span></div>
    <div class="award">⭐ <span>${Math.floor(Math.random() * 20) + 2}</span></div>
    <div class="award">🥇 <span>${Math.floor(Math.random() * 15) + 1}</span></div>
  </div>

  <!-- Actions -->
  <div class="action-bar">
    <div class="vote-cluster">
      <div class="vote-btn up">▲</div>
      <div class="vote-count">${fakeKarma}</div>
      <div class="vote-btn">▼</div>
    </div>
    <div class="action-btn">💬 ${fakeComments}</div>
    <div class="action-btn">↗ Share</div>
    <div class="action-more">⋮</div>
  </div>
</div>

<!-- Comment hint -->
<div class="comment-hint">
  💬 Top comment · Sort by: Best ›
</div>

<div class="home-indicator"></div>
</body>
</html>`;
}

/**
 * Call HTMLCSStoImage API and return image URL
 */
async function renderHTML(html, viewport = { width: 1080, height: 1350 }) {
  if (!HCTI_USER_ID || !HCTI_API_KEY) {
    throw new Error('HCTI credentials not configured (HCTI_USER_ID, HCTI_API_KEY)');
  }

  logger.info(`Sending HTML to HTMLCSStoImage (${html.length} chars)`);

  const response = await axios.post(
    HCTI_URL,
    {
      html,
      viewport_width: viewport.width,
      viewport_height: viewport.height
    },
    {
      auth: { username: HCTI_USER_ID, password: HCTI_API_KEY },
      timeout: 60000
    }
  );

  const imageUrl = response.data?.url;
  if (!imageUrl) throw new Error('HCTI returned no image URL');
  logger.info(`Screenshot captured: ${imageUrl}`);
  return imageUrl;
}

/**
 * Main export: generate Reddit HTML + capture screenshot
 * @param {Object} postData - { title, content, author, subreddit, upvotes, comments }
 * @param {string} zoomPreset - 'title_only' | 'title_first_para' | 'full_post'
 * @returns {Promise<{imageUrl, html}>}
 */
async function captureRedditScreenshot(postData, zoomPreset = 'title_first_para') {
  const html = generateRedditHTML(postData, zoomPreset);
  const imageUrl = await renderHTML(html);
  return { imageUrl, html };
}

module.exports = {
  captureRedditScreenshot,
  generateRedditHTML,
  renderHTML,
  ZOOM_PRESETS
};
