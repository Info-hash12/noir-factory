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
    hookDuration = 2
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
