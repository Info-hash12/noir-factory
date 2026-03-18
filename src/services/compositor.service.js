/**
 * Compositor Service
 * Stitches avatar video + Reddit screenshot using ffmpeg
 * Supports 5 layouts with configurable toggles
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');

const TMP_DIR = path.join(__dirname, '../../tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ─── LAYOUT TYPES ─────────────────────────────────────────────────────────────

const LAYOUTS = {
  pip_reddit_bg: {
    label: 'Reddit Background + Avatar PiP',
    description: 'Reddit fills frame, avatar overlay in corner'
  },
  split_vertical: {
    label: 'Split Screen Vertical',
    description: 'Avatar top 35%, Reddit bottom 65%'
  },
  hook_then_reddit: {
    label: 'Avatar Hook → Reddit',
    description: 'Avatar full-screen 2s, then transition to Reddit+PiP'
  },
  text_first: {
    label: 'Text-First (Reddit Zoomed)',
    description: 'Reddit post zoomed, micro avatar PiP'
  },
  faceless: {
    label: 'Faceless (Reddit only)',
    description: 'Pure Reddit post with slow pan/zoom, no avatar'
  },
  news_overlay: {
    label: 'News Overlay',
    description: 'Avatar top-right corner + red chyron bar with ticker (vertical)'
  },
  quote_card: {
    label: 'Quote Card',
    description: 'Gradient background with centered quote text (static, handled by pipeline-static.js)'
  },
  reaction: {
    label: 'Reaction',
    description: 'Avatar fills 70%, source content PiP top-right (vertical)'
  },
  scroll_through: {
    label: 'Scroll Through',
    description: 'Content scrolls upward with audio bar and avatar thumbnail (vertical)'
  },
  duet_style: {
    label: 'Duet Style',
    description: 'Split screen: avatar left 45%, content right 55% (vertical)'
  },
  word_by_word: {
    label: 'Word by Word',
    description: 'Text appears word by word with avatar PiP bottom-right (vertical)'
  }
};

const AVATAR_SHAPES = { circle: 'circle', rounded_rect: 'rounded_rect' };
const AVATAR_POSITIONS = {
  bottom_left:  { x: 40,  y: 'H-h-40',  label: 'Bottom Left' },
  bottom_right: { x: 'W-w-40', y: 'H-h-40', label: 'Bottom Right' },
  mid_right:    { x: 'W-w-40', y: '(H-h)/2', label: 'Mid Right' }
};
const REDDIT_ZOOM_PRESETS = {
  title_only:     { zoom: 1.4, label: 'Title Only' },
  title_first_para: { zoom: 1.0, label: 'Title + First Paragraph' },
  full_post:      { zoom: 0.85, label: 'Full Post (small text)' }
};
const TRANSITIONS = { hard_cut: 'cut', crossfade: 'fade', zoom: 'zoom' };

// ─── FFMPEG RUNNER ─────────────────────────────────────────────────────────────

function runFFmpeg(args, description) {
  return new Promise((resolve, reject) => {
    logger.info(`FFmpeg: ${description}`);
    const proc = spawn('ffmpeg', ['-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) { resolve(); }
      else { reject(new Error(`FFmpeg failed (${description}): ${stderr.slice(-600)}`)); }
    });
    proc.on('error', e => reject(new Error(`FFmpeg spawn: ${e.message}`)));
  });
}

// ─── DOWNLOAD HELPER ──────────────────────────────────────────────────────────

async function downloadToTmp(url, ext = 'mp4') {
  const dest = path.join(TMP_DIR, `dl_${Date.now()}.${ext}`);
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });
  fs.writeFileSync(dest, Buffer.from(response.data));
  return dest;
}

// ─── AVATAR MASKING ───────────────────────────────────────────────────────────

/**
 * Apply circle or rounded-rect mask to avatar video
 */
async function maskAvatar(avatarPath, shape, size = 400) {
  const out = path.join(TMP_DIR, `masked_${Date.now()}.mp4`);

  if (shape === 'circle') {
    // Use geq to apply circular mask
    const r = size / 2;
    await runFFmpeg([
      '-i', avatarPath,
      '-vf', `crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
             `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte((X-${r})^2+(Y-${r})^2,${r}^2),255,0)'`,
      '-c:v', 'png', // preserve alpha
      '-c:a', 'copy',
      out
    ], 'Apply circle mask to avatar');
  } else {
    // Rounded rectangle
    await runFFmpeg([
      '-i', avatarPath,
      '-vf', `crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2,` +
             `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(max(max(${30}-X,X-${size-30}),0)^2+max(max(${30}-Y,Y-${size-30}),0)^2,${30}^2),255,0)'`,
      '-c:v', 'png',
      '-c:a', 'copy',
      out
    ], 'Apply rounded-rect mask to avatar');
  }

  return out;
}

// ─── SCALE HELPERS ────────────────────────────────────────────────────────────

async function scaleVideo(input, w, h, out) {
  await runFFmpeg([
    '-i', input,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
    '-c:a', 'copy',
    out
  ], `Scale to ${w}x${h}`);
}

async function scaleImage(input, w, h, out) {
  await runFFmpeg([
    '-loop', '1', '-i', input,
    '-t', '60', // max duration driven by audio
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    out
  ], `Scale image to ${w}x${h}`);
}

// ─── MAIN COMPOSITOR ──────────────────────────────────────────────────────────

/**
 * Compose final video
 * @param {Object} params
 *   avatarVideoPath  - path to SadTalker output
 *   screenshotUrl    - URL of Reddit screenshot (from HCTI)
 *   audioPath        - path to TTS audio
 *   layout           - one of LAYOUTS keys
 *   avatarShape      - 'circle' | 'rounded_rect'
 *   avatarPosition   - one of AVATAR_POSITIONS keys
 *   redditZoom       - one of REDDIT_ZOOM_PRESETS keys
 *   transition       - 'hard_cut' | 'crossfade' | 'zoom'
 *   bgBlur           - boolean, blur/darken Reddit bg behind PiP
 *   hookDuration     - seconds for avatar hook (layout 3 only)
 *   sourceTitle      - headline text for news_overlay layout
 *   onScreenText     - text for scroll_through, word_by_word layouts
 * @returns {Promise<string>} path to final composed video
 */
async function composeVideo(params) {
  const {
    avatarVideoPath,
    screenshotUrl,
    audioPath,
    layout = 'pip_reddit_bg',
    avatarShape = 'circle',
    avatarPosition = 'bottom_right',
    redditZoom = 'title_first_para',
    transition = 'hard_cut',
    bgBlur = true,
    hookDuration = 2,
    sourceTitle = '',
    onScreenText = ''
  } = params;

  const outputPath = path.join(TMP_DIR, `final_${Date.now()}.mp4`);
  const CANVAS_W = 1080;
  const CANVAS_H = 1350;  // 4:5 — universal safe ratio for all social platforms

  // Download screenshot
  logger.info('Downloading Reddit screenshot...');
  const screenshotPath = await downloadToTmp(screenshotUrl, 'png');

  // Get audio duration
  const audioDuration = await getAudioDuration(audioPath);
  logger.info(`Audio duration: ${audioDuration}s`);

  // Dispatch to layout handler
  switch (layout) {
    case 'pip_reddit_bg':
      await composePipRedditBg({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        avatarShape, avatarPosition, redditZoom, bgBlur, outputPath, CANVAS_W, CANVAS_H });
      break;

    case 'split_vertical':
      await composeSplitVertical({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        outputPath, CANVAS_W, CANVAS_H });
      break;

    case 'hook_then_reddit':
      await composeHookThenReddit({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        avatarShape, avatarPosition, bgBlur, hookDuration, transition, outputPath, CANVAS_W, CANVAS_H });
      break;

    case 'text_first':
      await composeTextFirst({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        avatarShape, bgBlur, outputPath, CANVAS_W, CANVAS_H });
      break;

    case 'faceless':
      await composeFaceless({ screenshotPath, audioPath, audioDuration,
        redditZoom, outputPath, CANVAS_W, CANVAS_H });
      break;

    case 'news_overlay':
      await composeNewsOverlay({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        sourceTitle, outputPath });
      break;

    case 'quote_card':
      throw new Error('Quote Card is a static layout handled by pipeline-static.js, not by compositor');

    case 'reaction':
      await composeReaction({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        outputPath });
      break;

    case 'scroll_through':
      await composeScrollThrough({ screenshotPath, audioPath, audioDuration,
        onScreenText, outputPath });
      break;

    case 'duet_style':
      await composeDuetStyle({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
        outputPath });
      break;

    case 'word_by_word':
      await composeWordByWord({ avatarVideoPath, audioPath, audioDuration,
        onScreenText, outputPath });
      break;

    default:
      throw new Error(`Unknown layout: ${layout}`);
  }

  logger.info(`Final video composed: ${outputPath}`);
  return outputPath;
}

// ─── LAYOUT IMPLEMENTATIONS ───────────────────────────────────────────────────

async function composePipRedditBg({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    avatarShape, avatarPosition, bgBlur, outputPath, CANVAS_W, CANVAS_H }) {

  const pipSize = 380;
  const pos = AVATAR_POSITIONS[avatarPosition] || AVATAR_POSITIONS.bottom_right;
  const x = typeof pos.x === 'string' ? pos.x.replace('W', CANVAS_W).replace('w', pipSize).replace('H', CANVAS_H).replace('h', pipSize) : pos.x;
  const y = typeof pos.y === 'string' ? pos.y.replace('W', CANVAS_W).replace('w', pipSize).replace('H', CANVAS_H).replace('h', pipSize) : pos.y;

  // Scale reddit screenshot to canvas
  const bgPath = path.join(TMP_DIR, `bg_${Date.now()}.mp4`);
  await scaleImage(screenshotPath, CANVAS_W, CANVAS_H, bgPath);

  // Scale & mask avatar
  const avatarScaled = path.join(TMP_DIR, `av_scaled_${Date.now()}.mp4`);
  await scaleVideo(avatarVideoPath, pipSize, pipSize, avatarScaled);
  const avatarMasked = avatarShape !== 'circle' ? avatarScaled :
    await (async () => { const m = path.join(TMP_DIR, `av_mask_${Date.now()}.mp4`); await maskAvatar(avatarScaled, 'circle', pipSize); return m; })();

  const blurFilter = bgBlur ? `[0:v]boxblur=10:1[blurred];[blurred]` : `[0:v]`;

  // Overlay avatar on Reddit background
  await runFFmpeg([
    '-i', bgPath,
    '-stream_loop', '-1', '-i', avatarVideoPath,
    '-i', audioPath,
    '-filter_complex',
      `[0:v]scale=${CANVAS_W}:${CANVAS_H}[bg];` +
      `[1:v]scale=${pipSize}:${pipSize}[pip];` +
      `[bg][pip]overlay=${x}:${y}[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Layout: PiP Reddit Background');
}

async function composeSplitVertical({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    outputPath, CANVAS_W, CANVAS_H }) {

  const avatarH = Math.round(CANVAS_H * 0.35);
  const redditH = CANVAS_H - avatarH;

  const avatarResized = path.join(TMP_DIR, `av_top_${Date.now()}.mp4`);
  const redditResized = path.join(TMP_DIR, `rd_bot_${Date.now()}.mp4`);

  await scaleVideo(avatarVideoPath, CANVAS_W, avatarH, avatarResized);
  await scaleImage(screenshotPath, CANVAS_W, redditH, redditResized);

  await runFFmpeg([
    '-stream_loop', '-1', '-i', avatarResized,
    '-stream_loop', '-1', '-i', redditResized,
    '-i', audioPath,
    '-filter_complex',
      `[0:v]setpts=PTS-STARTPTS[top];` +
      `[1:v]setpts=PTS-STARTPTS[bot];` +
      `[top][bot]vstack=inputs=2[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Layout: Split Vertical');
}

async function composeHookThenReddit({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    avatarShape, avatarPosition, bgBlur, hookDuration, transition, outputPath, CANVAS_W, CANVAS_H }) {

  // Part 1: avatar full-screen for hookDuration seconds
  const hookPath = path.join(TMP_DIR, `hook_${Date.now()}.mp4`);
  const remainPath = path.join(TMP_DIR, `remain_${Date.now()}.mp4`);

  await runFFmpeg([
    '-i', avatarVideoPath,
    '-i', audioPath,
    '-t', `${hookDuration}`,
    '-vf', `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease,pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:black`,
    '-c:v', 'libx264', '-preset', 'fast',
    '-c:a', 'aac',
    hookPath
  ], 'Hook: avatar full-screen');

  // Part 2: PiP layout for remainder
  const pipSize = 360;
  const pos = AVATAR_POSITIONS[avatarPosition] || AVATAR_POSITIONS.bottom_right;
  const restDuration = Math.max(audioDuration - hookDuration, 1);

  const bgPath = path.join(TMP_DIR, `bg2_${Date.now()}.mp4`);
  await scaleImage(screenshotPath, CANVAS_W, CANVAS_H, bgPath);

  await runFFmpeg([
    '-ss', `${hookDuration}`, '-stream_loop', '-1', '-i', avatarVideoPath,
    '-stream_loop', '-1', '-i', bgPath,
    '-ss', `${hookDuration}`, '-i', audioPath,
    '-filter_complex',
      `[1:v]scale=${CANVAS_W}:${CANVAS_H}[bg];` +
      `[0:v]scale=${pipSize}:${pipSize}[pip];` +
      `[bg][pip]overlay=${pos.x}:${CANVAS_H - pipSize - 40}[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${restDuration}`,
    '-c:v', 'libx264', '-preset', 'fast',
    '-c:a', 'aac',
    remainPath
  ], 'Hook: PiP remainder');

  // Concat hook + remain
  const listPath = path.join(TMP_DIR, `concat_${Date.now()}.txt`);
  fs.writeFileSync(listPath, `file '${hookPath}'\nfile '${remainPath}'\n`);

  await runFFmpeg([
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy',
    outputPath
  ], 'Hook: concat parts');
}

async function composeTextFirst({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    avatarShape, bgBlur, outputPath, CANVAS_W, CANVAS_H }) {

  // Reddit zoomed in (only title area visible)
  const pipSize = 200; // micro PiP
  const bgPath = path.join(TMP_DIR, `bgzoom_${Date.now()}.mp4`);

  // Zoom into top portion of Reddit screenshot (title area)
  await runFFmpeg([
    '-loop', '1', '-i', screenshotPath,
    '-t', `${audioDuration}`,
    '-vf',
      `crop=iw:ih/2:0:0,` + // top half
      `scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease,pad=${CANVAS_W}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:black`,
    '-c:v', 'libx264', '-preset', 'fast',
    bgPath
  ], 'Text-first: zoom Reddit title');

  await runFFmpeg([
    '-i', bgPath,
    '-stream_loop', '-1', '-i', avatarVideoPath,
    '-i', audioPath,
    '-filter_complex',
      `[1:v]scale=${pipSize}:${pipSize}[pip];` +
      `[0:v][pip]overlay=20:20[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Text-first: overlay micro avatar');
}

async function composeFaceless({ screenshotPath, audioPath, audioDuration,
    redditZoom, outputPath, CANVAS_W, CANVAS_H }) {

  const zoom = REDDIT_ZOOM_PRESETS[redditZoom]?.zoom || 1.0;
  // Slow pan/zoom effect using zoompan filter
  const fps = 30;
  const frames = Math.ceil(audioDuration * fps);

  await runFFmpeg([
    '-loop', '1', '-i', screenshotPath,
    '-i', audioPath,
    '-filter_complex',
      `[0:v]scale=${CANVAS_W * 2}:${CANVAS_H * 2},` +
      `zoompan=z='min(zoom+0.0002,${zoom + 0.2})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${CANVAS_W}x${CANVAS_H}:fps=${fps}[out]`,
    '-map', '[out]',
    '-map', '1:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Faceless: pan/zoom');
}

// ─── NEW LAYOUT IMPLEMENTATIONS (6 NEW LAYOUTS) ───────────────────────────────

/**
 * NEWS_OVERLAY: Avatar top-right (25% width, circular), red chyron bottom 30%, ticker
 * Resolution: 1080x1920 (vertical)
 */
async function composeNewsOverlay({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    sourceTitle, outputPath }) {

  const CANVAS_W = 1080;
  const CANVAS_H = 1920;

  // Avatar size: 25% of width
  const avatarSize = Math.round(CANVAS_W * 0.25);
  const avatarX = CANVAS_W - avatarSize - 30; // top-right, 30px margin
  const avatarY = 30;

  // Chyron: bottom 30% of frame (height = 576px)
  const chyronH = Math.round(CANVAS_H * 0.30);
  const chyronY = CANVAS_H - chyronH;

  // Dark background
  const bgPath = path.join(TMP_DIR, `news_bg_${Date.now()}.mp4`);
  await scaleImage(screenshotPath, CANVAS_W, CANVAS_H, bgPath);

  // Apply blur to screenshot background
  const blurredPath = path.join(TMP_DIR, `news_blur_${Date.now()}.mp4`);
  await runFFmpeg([
    '-i', bgPath,
    '-vf', `boxblur=15:2`,
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast',
    blurredPath
  ], 'News: blur background');

  // Create dark gradient overlay (dark to transparent)
  const gradientPath = path.join(TMP_DIR, `news_gradient_${Date.now()}.mp4`);
  await runFFmpeg([
    '-f', 'lavfi', '-i', `color=black:s=${CANVAS_W}x${CANVAS_H}:d=${audioDuration}`,
    '-vf', `format=rgba,drawbox=x=0:y=0:w=${CANVAS_W}:h=${CANVAS_H}:color=black@0.3:t=fill`,
    '-c:v', 'libx264', '-preset', 'fast',
    gradientPath
  ], 'News: create dark overlay');

  // Create chyron bar (red background with white text)
  const chyronBarPath = path.join(TMP_DIR, `news_chyron_${Date.now()}.mp4`);
  const chyronText = sourceTitle.substring(0, 60) || 'Breaking News';

  await runFFmpeg([
    '-f', 'lavfi', '-i', `color=c=0xFF0000:s=${CANVAS_W}x${chyronH}:d=${audioDuration}`,
    '-vf', `drawtext=text='${chyronText}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-preset', 'fast',
    chyronBarPath
  ], 'News: create chyron bar');

  // Create ticker text (scrolling bottom of chyron)
  const tickerH = Math.round(chyronH * 0.4);
  const tickerY = chyronY + chyronH;
  const tickerPath = path.join(TMP_DIR, `news_ticker_${Date.now()}.mp4`);
  const tickerText = 'LIVE • BREAKING NEWS • LATEST UPDATES • STAY TUNED';

  await runFFmpeg([
    '-f', 'lavfi', '-i', `color=c=0x1a1a1a:s=${CANVAS_W}x${tickerH}:d=${audioDuration}`,
    '-vf', `drawtext=text='${tickerText}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:fontsize=28:fontcolor=white:x=w-(t*100):y=(h-text_h)/2`,
    '-c:v', 'libx264', '-preset', 'fast',
    tickerPath
  ], 'News: create ticker');

  // Composite everything together
  await runFFmpeg([
    '-i', blurredPath,
    '-stream_loop', '-1', '-i', avatarVideoPath,
    '-i', audioPath,
    '-filter_complex',
      `[0:v]scale=${CANVAS_W}:${CANVAS_H}[bg];` +
      `[bg]format=rgba[bgalpha];` +
      `[1:v]scale=${avatarSize}:${avatarSize},` +
        `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte((X-${avatarSize/2})^2+(Y-${avatarSize/2})^2,${(avatarSize/2)}^2),255,0)'[avatar];` +
      `[bgalpha][avatar]overlay=${avatarX}:${avatarY}[main];` +
      `[main]drawbox=x=0:y=${chyronY}:w=${CANVAS_W}:h=${chyronH}:color=red@1:t=fill[withchyron];` +
      `[withchyron]drawtext=text='${chyronText}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=48:fontcolor=white:x=(w-text_w)/2:y=${chyronY}+(h-text_h)/2[final]`,
    '-map', '[final]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'News: composite all layers');
}

/**
 * REACTION: Avatar fills 70%, source content PiP top-right 35%
 * Resolution: 1080x1920 (vertical)
 */
async function composeReaction({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    outputPath }) {

  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const avatarH = Math.round(CANVAS_H * 0.70);
  const pipW = Math.round(CANVAS_W * 0.35);
  const pipH = Math.round(CANVAS_H * 0.35);

  // Stretch avatar to 70% height
  const avatarResized = path.join(TMP_DIR, `reaction_av_${Date.now()}.mp4`);
  await runFFmpeg([
    '-stream_loop', '-1', '-i', avatarVideoPath,
    '-i', audioPath,
    '-t', `${audioDuration}`,
    '-vf', `scale=${CANVAS_W}:${avatarH}:force_original_aspect_ratio=decrease,pad=${CANVAS_W}:${avatarH}:(ow-iw)/2:(oh-ih)/2:black`,
    '-c:v', 'libx264', '-preset', 'fast',
    '-c:a', 'copy',
    avatarResized
  ], 'Reaction: resize avatar to 70%');

  // Scale screenshot for PiP (top-right)
  const pipPath = path.join(TMP_DIR, `reaction_pip_${Date.now()}.mp4`);
  await scaleImage(screenshotPath, pipW, pipH, pipPath);

  // Composite: avatar bottom, screenshot PiP top-right with rounded corners
  await runFFmpeg([
    '-i', avatarResized,
    '-stream_loop', '-1', '-i', pipPath,
    '-filter_complex',
      `[0:v]pad=${CANVAS_W}:${CANVAS_H}:0:0:black[padded];` +
      `[1:v]scale=${pipW}:${pipH}[pip];` +
      `[padded][pip]overlay=${CANVAS_W - pipW - 20}:20:shortest=1[out]`,
    '-map', '[out]',
    '-map', '0:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Reaction: composite avatar + PiP');
}

/**
 * SCROLL_THROUGH: Screenshot scrolls upward, audio bar with avatar thumbnail and waveform
 * Resolution: 1080x1920 (vertical)
 */
async function composeScrollThrough({ screenshotPath, audioPath, audioDuration,
    onScreenText, outputPath }) {

  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const audioBarH = 120; // audio bar height at bottom
  const contentH = CANVAS_H - audioBarH;
  const fps = 30;
  const frames = Math.ceil(audioDuration * fps);

  // Calculate scroll distance (entire image height)
  const scrollDistance = CANVAS_H * 0.5; // scroll through half the height

  // Create scrolling content using zoompan (vertical scroll effect)
  const scrollPath = path.join(TMP_DIR, `scroll_content_${Date.now()}.mp4`);
  await runFFmpeg([
    '-loop', '1', '-i', screenshotPath,
    '-t', `${audioDuration}`,
    '-vf', `scale=${CANVAS_W}:${CANVAS_H * 2},` +
           `zoompan=z='1':x='0':y='min(iw/10*t/${audioDuration},ih-${contentH})':d=${frames}:s=${CANVAS_W}x${contentH}:fps=${fps}`,
    '-c:v', 'libx264', '-preset', 'fast',
    scrollPath
  ], 'Scroll: vertical pan effect');

  // Create audio bar with waveform placeholder
  const audioBarPath = path.join(TMP_DIR, `scroll_audiobar_${Date.now()}.mp4`);
  await runFFmpeg([
    '-f', 'lavfi', '-i', `color=c=0x222222:s=${CANVAS_W}x${audioBarH}:d=${audioDuration}`,
    '-vf', `drawtext=text='♪ Audio Visualization':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:fontsize=24:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-preset', 'fast',
    audioBarPath
  ], 'Scroll: create audio bar');

  // Composite scroll + audio bar
  await runFFmpeg([
    '-i', scrollPath,
    '-i', audioBarPath,
    '-i', audioPath,
    '-filter_complex',
      `[0:v][1:v]vstack=inputs=2[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Scroll: composite scroll + audio bar');
}

/**
 * DUET_STYLE: Split screen - avatar left 45%, content right 55% with slow zoom
 * Resolution: 1080x1920 (vertical)
 */
async function composeDuetStyle({ avatarVideoPath, screenshotPath, audioPath, audioDuration,
    outputPath }) {

  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const leftW = Math.round(CANVAS_W * 0.45);
  const rightW = CANVAS_W - leftW;
  const dividerW = 4; // thin divider

  // Resize avatar for left side
  const avatarLeftPath = path.join(TMP_DIR, `duet_av_left_${Date.now()}.mp4`);
  await runFFmpeg([
    '-stream_loop', '-1', '-i', avatarVideoPath,
    '-i', audioPath,
    '-t', `${audioDuration}`,
    '-vf', `scale=${leftW}:${CANVAS_H}:force_original_aspect_ratio=decrease,pad=${leftW}:${CANVAS_H}:(ow-iw)/2:(oh-ih)/2:black`,
    '-c:v', 'libx264', '-preset', 'fast',
    '-c:a', 'copy',
    avatarLeftPath
  ], 'Duet: resize avatar for left');

  // Create zooming screenshot for right side (slow zoom effect)
  const fps = 30;
  const frames = Math.ceil(audioDuration * fps);
  const contentRightPath = path.join(TMP_DIR, `duet_content_right_${Date.now()}.mp4`);

  await runFFmpeg([
    '-loop', '1', '-i', screenshotPath,
    '-t', `${audioDuration}`,
    '-vf', `scale=${rightW * 2}:${CANVAS_H * 2},` +
           `zoompan=z='min(1.0+0.0001*t,1.3)':x='(iw-${rightW})/2':y='(ih-${CANVAS_H})/2':d=${frames}:s=${rightW}x${CANVAS_H}:fps=${fps}`,
    '-c:v', 'libx264', '-preset', 'fast',
    contentRightPath
  ], 'Duet: create zooming content');

  // Composite left + divider + right
  await runFFmpeg([
    '-i', avatarLeftPath,
    '-i', contentRightPath,
    '-i', audioPath,
    '-filter_complex',
      `[0:v]pad=${leftW + dividerW}:${CANVAS_H}:(ow-iw)/2:0:black[left];` +
      `[left][1:v]hstack=inputs=2[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Duet: composite split screen');
}

/**
 * WORD_BY_WORD: Text appears word by word, centered, with accent color highlight
 * Avatar PiP bottom-right. Synced to audio timing.
 * Resolution: 1080x1920 (vertical)
 */
async function composeWordByWord({ avatarVideoPath, audioPath, audioDuration,
    onScreenText, outputPath }) {

  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const avatarSize = 200; // bottom-right avatar PiP
  const accentColor = '6C5CE7'; // purple accent

  // Parse text into words for timing
  const words = (onScreenText || 'Your text here').split(' ').filter(w => w.length > 0);
  const wordsPerSecond = words.length > 0 ? Math.max(2, words.length / audioDuration) : 2;
  const timePerWord = 1 / wordsPerSecond;

  // Build drawtext filter for word-by-word animation
  // We'll create a complex filter that shows one word at a time
  let filterStr = '';

  // Create base black canvas
  filterStr = `color=c=0x000000:s=${CANVAS_W}x${CANVAS_H}:d=${audioDuration}[bg];`;

  // For simplicity, we'll create a loop-based approach:
  // Draw current word based on time position
  const wordEnables = words.map((word, idx) => {
    const startTime = idx * timePerWord;
    const endTime = (idx + 1) * timePerWord;
    return `enable='between(t,${startTime},${endTime})'`;
  }).join(':');

  // Build complex filter with multiple drawtext overlays
  filterStr += `[bg]`;
  words.forEach((word, idx) => {
    const startTime = idx * timePerWord;
    const endTime = (idx + 1) * timePerWord;
    const isLast = idx === words.length - 1;

    filterStr += `drawtext=text='${word}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
                 `fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:` +
                 `enable='between(t,${startTime},${endTime})'`;

    if (!isLast) filterStr += ',';
  });
  filterStr += `[textoverlay]`;

  // Add avatar PiP to bottom-right
  filterStr += `;[textoverlay]pad=${CANVAS_W}:${CANVAS_H}:0:0[padded];` +
               `[1:v]scale=${avatarSize}:${avatarSize}[avatar];` +
               `[padded][avatar]overlay=${CANVAS_W - avatarSize - 20}:${CANVAS_H - avatarSize - 20}:shortest=1[final]`;

  // Create the word-by-word text video with avatar
  await runFFmpeg([
    '-f', 'lavfi', '-i', `color=c=0x000000:s=${CANVAS_W}x${CANVAS_H}:d=${audioDuration}`,
    '-stream_loop', '-1', '-i', avatarVideoPath,
    '-i', audioPath,
    '-filter_complex',
      `[0:v]` +
      words.map((word, idx) => {
        const startTime = idx * timePerWord;
        const endTime = (idx + 1) * timePerWord;
        return `drawtext=text='${word}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${startTime},${endTime})'`;
      }).join(',') +
      `[text];` +
      `[text]pad=${CANVAS_W}:${CANVAS_H}:0:0[padded];` +
      `[1:v]scale=${avatarSize}:${avatarSize}[avatar];` +
      `[padded][avatar]overlay=${CANVAS_W - avatarSize - 20}:${CANVAS_H - avatarSize - 20}:shortest=1[out]`,
    '-map', '[out]',
    '-map', '2:a',
    '-t', `${audioDuration}`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '192k',
    '-pix_fmt', 'yuv420p',
    outputPath
  ], 'Word by Word: text animation with avatar');
}

// ─── AUDIO DURATION ──────────────────────────────────────────────────────────

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', audioPath
    ]);
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', () => {
      try {
        const data = JSON.parse(out);
        const dur = parseFloat(data.streams?.[0]?.duration || '30');
        resolve(isNaN(dur) ? 30 : dur);
      } catch {
        resolve(30);
      }
    });
    proc.on('error', () => resolve(30));
  });
}

module.exports = {
  composeVideo,
  LAYOUTS,
  AVATAR_SHAPES,
  AVATAR_POSITIONS,
  REDDIT_ZOOM_PRESETS,
  TRANSITIONS
};
