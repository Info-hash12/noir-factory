/**
 * Segmind Service
 * Chatterbox TTS + InfiniteTalk lip-sync + CodeFormer face restoration
 *
 * InfiniteTalk replaces SadTalker — configured for Higgsfield Cinema Studio
 * quality standards: 720p, 25fps cinematic, enhanced prompt for natural motion.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const FormData = require('form-data');
const logger = require('../utils/logger');

const SEGMIND_KEY = process.env.SEGMIND_API_KEY;
const TMP_DIR = path.join(__dirname, '../../tmp');

// Ensure tmp dir exists
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ─── DEFAULT INFINITETALK SETTINGS (Higgsfield Cinema Studio Quality) ───────

const DEFAULT_INFINITETALK_SETTINGS = {
  resolution: '720p',          // Cinema-quality resolution
  fps: 25,                     // Cinematic frame rate
  enhance_prompt: true,        // Smoother, less robotic motion
  seed: 42424242,              // Reproducible results
};

// ─── UPLOAD ASSET ─────────────────────────────────────────────────────────────

/**
 * Upload a buffer to Segmind's asset API via multipart form and return a hosted URL.
 */
async function uploadAssetToSegmind(buffer, mimeType, filename) {
  const ext = mimeType.split('/')[1] || 'bin';
  const form = new FormData();
  form.append('file', buffer, { filename: filename || `asset.${ext}`, contentType: mimeType });
  const resp = await axios.post(
    'https://workflows-api.segmind.com/upload-asset',
    form,
    {
      headers: { 'x-api-key': SEGMIND_KEY, ...form.getHeaders() },
      timeout: 60000
    }
  );
  const url = resp.data?.file_urls?.[0];
  if (!url) throw new Error(`Unexpected upload-asset response: ${JSON.stringify(resp.data)}`);
  logger.info(`Asset uploaded to Segmind: ${url}`);
  return url;
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

/**
 * Generate audio from text using Chatterbox TTS
 * @param {string} text
 * @param {Object} options - { exaggeration, cfg_weight, voice_url }
 * @returns {Promise<{audioPath, audioBuffer}>}
 */
async function generateTTS(text, options = {}) {
  if (!SEGMIND_KEY) throw new Error('SEGMIND_API_KEY not configured');

  const payload = {
    text: text.substring(0, 3000), // Chatterbox limit
    exaggeration: parseFloat(options.exaggeration || 0.5),
    cfg_weight: parseFloat(options.cfg_weight || 0.3),       // Lower = closer match to reference voice
    temperature: parseFloat(options.temperature || 0.8),
    repetition_penalty: parseFloat(options.repetition_penalty || 1.2),
    seed: 0  // 0 = random for natural variation
  };

  // Add voice reference if provided — download and re-upload to Segmind to avoid
  // expiring signed URLs (e.g. Airtable airtableusercontent.com tokens)
  // IMPORTANT: Segmind Chatterbox API parameter is "reference_audio" (NOT "audio_prompt_path")
  if (options.voice_url) {
    try {
      logger.info(`Downloading voice reference: ${options.voice_url.substring(0, 80)}…`);
      const voiceResp = await axios.get(options.voice_url, { responseType: 'arraybuffer', timeout: 30000 });
      const voiceBuffer = Buffer.from(voiceResp.data);
      const voiceSizeKB = (voiceBuffer.length / 1024).toFixed(0);
      const contentType = voiceResp.headers['content-type'] || 'audio/mpeg';
      logger.info(`Voice sample downloaded: ${voiceSizeKB} KB, content-type: ${contentType}`);
      const segmindVoiceUrl = await uploadAssetToSegmind(voiceBuffer, contentType, 'voice_ref.mp3');
      payload.reference_audio = segmindVoiceUrl;   // ← correct Segmind API parameter name
      logger.info(`Voice reference uploaded to Segmind: ${segmindVoiceUrl}`);
    } catch (e) {
      logger.warn(`Voice reference unavailable (${e.message}) — using generic TTS voice`);
    }
  }

  logger.info(`Generating TTS (${text.length} chars, exag: ${payload.exaggeration}, cfg: ${payload.cfg_weight}, voice_clone: ${!!payload.reference_audio})`);

  const response = await axios.post(
    'https://api.segmind.com/v1/chatterbox-tts',
    payload,
    {
      headers: {
        'x-api-key': SEGMIND_KEY,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer',
      timeout: 120000
    }
  );

  const audioBuffer = Buffer.from(response.data);
  const audioPath = path.join(TMP_DIR, `tts_${Date.now()}.wav`);
  fs.writeFileSync(audioPath, audioBuffer);

  logger.info(`TTS audio saved: ${audioPath} (${audioBuffer.length} bytes)`);
  return { audioPath, audioBuffer };
}

// ─── INFINITETALK LIP-SYNC (replaces SadTalker) ────────────────────────────

/**
 * Generate lip-sync video using InfiniteTalk on Segmind.
 * Configured for Higgsfield Cinema Studio quality:
 *   - 720p resolution
 *   - 25fps cinematic frame rate
 *   - enhance_prompt for natural, non-robotic motion
 *   - Audio from Chatterbox TTS integration
 *   - Native streaming for durations up to 90s (chunked frame processing)
 *
 * @param {string} avatarImageUrl - URL to avatar image (Airtable or otherwise)
 * @param {string|Buffer} audioInput - local file path, URL, or Buffer from Chatterbox
 * @param {Object} settings - InfiniteTalk settings (overrides defaults)
 * @returns {Promise<{videoPath, videoBuffer}>}
 */
async function generateLipSync(avatarImageUrl, audioInput, settings = {}) {
  if (!SEGMIND_KEY) throw new Error('SEGMIND_API_KEY not configured');

  const mergedSettings = { ...DEFAULT_INFINITETALK_SETTINGS, ...settings };

  // ── 1. Upload avatar image to Segmind asset store ─────────────────────────
  logger.info('Uploading avatar image to Segmind for InfiniteTalk...');
  const imgResp = await axios.get(avatarImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const imgBuffer = Buffer.from(imgResp.data);
  const imgMime = imgResp.headers['content-type'] || 'image/jpeg';
  const inputImageUrl = await uploadAssetToSegmind(imgBuffer, imgMime, 'avatar.jpg');

  // ── 2. Resolve audio input and upload to Segmind ──────────────────────────
  logger.info('Uploading Chatterbox audio to Segmind...');
  let audioBuffer;
  if (typeof audioInput === 'string') {
    if (audioInput.startsWith('http')) {
      const audioResp = await axios.get(audioInput, { responseType: 'arraybuffer', timeout: 60000 });
      audioBuffer = Buffer.from(audioResp.data);
    } else {
      audioBuffer = fs.readFileSync(audioInput);
    }
  } else {
    audioBuffer = audioInput;
  }
  const inputAudioUrl = await uploadAssetToSegmind(audioBuffer, 'audio/mpeg', 'chatterbox_audio.mp3');

  // ── 3. Call InfiniteTalk with cinema-quality settings ─────────────────────
  const payload = {
    image: inputImageUrl,
    audio: inputAudioUrl,
    prompt: mergedSettings.prompt ||
      'A person speaking naturally with expressive facial movements, cinematic lighting, professional quality',
    resolution: mergedSettings.resolution,
    fps: mergedSettings.fps,
    enhance_prompt: mergedSettings.enhance_prompt,
    seed: mergedSettings.seed,
    base64: false,
  };

  logger.info(
    `Generating InfiniteTalk video (${payload.resolution}, ${payload.fps}fps, ` +
    `enhance_prompt: ${payload.enhance_prompt})`
  );

  // InfiniteTalk's native streaming handles long durations via chunked frame
  // processing (81 frames/chunk with 25 overlap frames for smooth transitions).
  // Use a generous timeout — only fall back to splitting on actual timeout errors.
  const timeout = mergedSettings.timeout || 900000; // 15 min for up to 90s video

  let response;
  try {
    response = await axios.post(
      'https://api.segmind.com/v1/infinite-talk',
      payload,
      {
        headers: { 'x-api-key': SEGMIND_KEY, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout,
      }
    );
  } catch (err) {
    // On timeout, attempt chunked fallback (split audio into segments)
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      logger.warn(`InfiniteTalk timed out after ${timeout / 1000}s — attempting chunked fallback...`);
      return await generateLipSyncChunked(inputImageUrl, inputAudioUrl, payload, mergedSettings);
    }
    // Surface Segmind's error body for debugging
    if (err.response?.data) {
      const errBody = Buffer.from(err.response.data).toString('utf-8').slice(0, 500);
      throw new Error(`InfiniteTalk API error (HTTP ${err.response.status}): ${errBody}`);
    }
    throw err;
  }

  // ── 4. Validate response is actually a video ──────────────────────────────
  const videoBuffer = Buffer.from(response.data);
  const contentType = response.headers['content-type'] || '';

  if (contentType.includes('application/json') || videoBuffer.length < 1000) {
    const bodyText = videoBuffer.toString('utf-8').slice(0, 500);
    throw new Error(
      `InfiniteTalk returned invalid response (${videoBuffer.length} bytes, ` +
      `content-type: ${contentType}): ${bodyText}`
    );
  }

  const videoPath = path.join(TMP_DIR, `infinitetalk_${Date.now()}.mp4`);
  fs.writeFileSync(videoPath, videoBuffer);

  const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
  logger.info(`InfiniteTalk video saved: ${videoPath} (${sizeMB} MB)`);
  return { videoPath, videoBuffer };
}

/**
 * Chunked fallback for InfiniteTalk — only triggered when the API returns a
 * timeout error. Splits audio into segments, generates video for each chunk,
 * and concatenates with ffmpeg.
 */
async function generateLipSyncChunked(imageUrl, audioUrl, basePayload, settings) {
  // InfiniteTalk's native streaming handles most durations (up to ~90s).
  // This fallback splits audio into 45s segments when the API times out.

  logger.info('Chunked fallback: splitting audio and generating segments...');

  // Download the audio to a local temp file for splitting
  const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer', timeout: 60000 });
  const fullAudioPath = path.join(TMP_DIR, `full_audio_${Date.now()}.mp3`);
  fs.writeFileSync(fullAudioPath, Buffer.from(audioResp.data));

  // Get audio duration via ffprobe
  let totalDuration;
  try {
    const probe = execSync(
      `ffprobe -v quiet -print_format json -show_streams "${fullAudioPath}"`,
      { timeout: 10000 }
    );
    const streams = JSON.parse(probe.toString());
    totalDuration = parseFloat(streams.streams?.[0]?.duration || '0');
  } catch {
    throw new Error('Could not determine audio duration for chunked generation');
  }

  if (totalDuration <= 0) {
    throw new Error('Audio file has zero duration');
  }

  const CHUNK_SECONDS = 45;
  const numChunks = Math.ceil(totalDuration / CHUNK_SECONDS);
  logger.info(`Splitting ${totalDuration.toFixed(1)}s audio into ${numChunks} chunks of ${CHUNK_SECONDS}s`);

  const chunkVideoPaths = [];
  const timeout = settings.timeout || 600000; // 10 min per chunk

  for (let i = 0; i < numChunks; i++) {
    const startSec = i * CHUNK_SECONDS;

    // Extract audio chunk
    const chunkAudioPath = path.join(TMP_DIR, `chunk_audio_${Date.now()}_${i}.mp3`);
    execSync(
      `ffmpeg -y -i "${fullAudioPath}" -ss ${startSec} -t ${CHUNK_SECONDS} -c copy "${chunkAudioPath}"`,
      { stdio: 'pipe', timeout: 30000 }
    );

    // Upload chunk audio to Segmind
    const chunkBuffer = fs.readFileSync(chunkAudioPath);
    const chunkAudioUrl = await uploadAssetToSegmind(chunkBuffer, 'audio/mpeg', `chunk_${i}.mp3`);

    // Generate video for this chunk
    logger.info(`Generating chunk ${i + 1}/${numChunks} (${startSec}s - ${startSec + CHUNK_SECONDS}s)...`);

    const chunkPayload = { ...basePayload, audio: chunkAudioUrl };

    const chunkResp = await axios.post(
      'https://api.segmind.com/v1/infinite-talk',
      chunkPayload,
      {
        headers: { 'x-api-key': SEGMIND_KEY, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
        timeout,
      }
    );

    const chunkVideoBuffer = Buffer.from(chunkResp.data);
    if (chunkVideoBuffer.length < 1000) {
      const bodyText = chunkVideoBuffer.toString('utf-8').slice(0, 300);
      throw new Error(`InfiniteTalk chunk ${i} returned invalid response: ${bodyText}`);
    }

    const chunkVideoPath = path.join(TMP_DIR, `chunk_video_${Date.now()}_${i}.mp4`);
    fs.writeFileSync(chunkVideoPath, chunkVideoBuffer);
    chunkVideoPaths.push(chunkVideoPath);

    // Cleanup chunk audio
    try { fs.unlinkSync(chunkAudioPath); } catch {}
  }

  // Concatenate all chunk videos with ffmpeg
  const concatListPath = path.join(TMP_DIR, `concat_${Date.now()}.txt`);
  const concatContent = chunkVideoPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatListPath, concatContent);

  const finalVideoPath = path.join(TMP_DIR, `infinitetalk_concat_${Date.now()}.mp4`);
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalVideoPath}"`,
    { stdio: 'pipe', timeout: 120000 }
  );

  const videoBuffer = fs.readFileSync(finalVideoPath);
  logger.info(`Chunked InfiniteTalk video assembled: ${finalVideoPath} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

  // Cleanup chunk files
  try { fs.unlinkSync(fullAudioPath); } catch {}
  try { fs.unlinkSync(concatListPath); } catch {}
  for (const p of chunkVideoPaths) { try { fs.unlinkSync(p); } catch {} }

  return { videoPath: finalVideoPath, videoBuffer };
}

// ─── CODEFORMER FACE RESTORATION ────────────────────────────────────────────

/**
 * Restore/enhance a face image using CodeFormer on Segmind.
 * Sharpens eyes, teeth, and skin texture — the "Higgsfield secret sauce".
 *
 * @param {string} imageUrl - Segmind-hosted URL of the image
 * @param {Object} options - { scale, fidelity, bg }
 * @returns {Promise<Buffer>} Restored image buffer
 */
async function restoreFace(imageUrl, options = {}) {
  if (!SEGMIND_KEY) throw new Error('SEGMIND_API_KEY not configured');

  const payload = {
    image: imageUrl,
    scale: String(options.scale || 1),
    fidelity: options.fidelity ?? 0.7, // 0.7 = good quality vs identity preservation balance
    bg: options.bg !== false,
    face: true,
  };

  logger.info(`Restoring face with CodeFormer (fidelity: ${payload.fidelity})`);

  const response = await axios.post(
    'https://api.segmind.com/v1/codeformer',
    payload,
    {
      headers: { 'x-api-key': SEGMIND_KEY, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 60000,
    }
  );

  const restoredBuffer = Buffer.from(response.data);
  const ct = response.headers['content-type'] || '';

  if (ct.includes('application/json') || restoredBuffer.length < 500) {
    const bodyText = restoredBuffer.toString('utf-8').slice(0, 300);
    throw new Error(`CodeFormer returned invalid response: ${bodyText}`);
  }

  logger.info(`Face restored: ${(restoredBuffer.length / 1024).toFixed(0)} KB`);
  return restoredBuffer;
}

/**
 * Restore an avatar image and re-upload to Segmind.
 * Pre-processing step: sharpens the source face before InfiniteTalk rendering.
 *
 * @param {string} avatarImageUrl - Original avatar image URL
 * @returns {Promise<string>} Hosted URL of the restored avatar image
 */
async function restoreAndUploadAvatar(avatarImageUrl) {
  logger.info('Pre-processing avatar with CodeFormer...');

  // Download original image
  const imgResp = await axios.get(avatarImageUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const imgBuffer = Buffer.from(imgResp.data);
  const imgMime = imgResp.headers['content-type'] || 'image/jpeg';

  // Upload original to get a Segmind-hosted URL for CodeFormer input
  const segmindUrl = await uploadAssetToSegmind(imgBuffer, imgMime, 'avatar_original.jpg');

  // Restore face
  const restoredBuffer = await restoreFace(segmindUrl);

  // Upload restored image
  const restoredUrl = await uploadAssetToSegmind(restoredBuffer, 'image/jpeg', 'avatar_restored.jpg');

  logger.info(`Avatar face restored and uploaded: ${restoredUrl}`);
  return restoredUrl;
}

/**
 * Post-process video with frame-by-frame CodeFormer face restoration.
 * Extracts frames, restores each face via Segmind API, and reassembles.
 *
 * This is the "secret sauce" that Higgsfield uses to make basic models
 * look high-end — sharpens eyes and teeth across every frame.
 *
 * @param {string} videoPath - Path to input video
 * @param {Object} options - { concurrency, frameSkip, fidelity, fps }
 * @returns {Promise<{videoPath: string}>} Path to restored video
 */
async function restoreVideoFaces(videoPath, options = {}) {
  const concurrency = options.concurrency || 5;
  const frameSkip = options.frameSkip || 1;  // 1 = every frame, 3 = every 3rd
  const fidelity = options.fidelity || 0.7;
  const fps = options.fps || 25;

  const stamp = Date.now();
  const framesDir = path.join(TMP_DIR, `frames_${stamp}`);
  const restoredDir = path.join(TMP_DIR, `restored_${stamp}`);
  fs.mkdirSync(framesDir, { recursive: true });
  fs.mkdirSync(restoredDir, { recursive: true });

  try {
    // ── Extract frames ──────────────────────────────────────────────────────
    logger.info('Extracting video frames for face restoration...');
    execSync(
      `ffmpeg -i "${videoPath}" -qscale:v 2 "${framesDir}/frame_%06d.jpg"`,
      { stdio: 'pipe', timeout: 120000 }
    );

    const allFrames = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
    const framesToProcess = allFrames.filter((_, i) => i % frameSkip === 0);
    logger.info(
      `Extracted ${allFrames.length} frames — restoring ${framesToProcess.length} ` +
      `(every ${frameSkip === 1 ? '' : frameSkip + 'th '}frame)`
    );

    // ── Process frames in concurrent batches ────────────────────────────────
    let processed = 0;

    async function processFrame(frameName) {
      const framePath = path.join(framesDir, frameName);
      const restoredPath = path.join(restoredDir, frameName);

      const frameBuffer = fs.readFileSync(framePath);
      const frameUrl = await uploadAssetToSegmind(frameBuffer, 'image/jpeg', frameName);
      const restoredBuffer = await restoreFace(frameUrl, { fidelity });
      fs.writeFileSync(restoredPath, restoredBuffer);

      processed++;
      if (processed % 50 === 0 || processed === framesToProcess.length) {
        logger.info(`Face restoration: ${processed}/${framesToProcess.length} frames`);
      }
    }

    for (let i = 0; i < framesToProcess.length; i += concurrency) {
      const batch = framesToProcess.slice(i, i + concurrency);
      await Promise.all(batch.map(processFrame));
    }

    // Copy unprocessed frames from original (when frameSkip > 1)
    for (const frame of allFrames) {
      const restoredPath = path.join(restoredDir, frame);
      if (!fs.existsSync(restoredPath)) {
        fs.copyFileSync(path.join(framesDir, frame), restoredPath);
      }
    }

    // ── Reassemble video with original audio ────────────────────────────────
    const restoredVideoPath = path.join(TMP_DIR, `restored_${stamp}.mp4`);

    // Check if original video has an audio track
    let hasAudio = false;
    try {
      const probe = execSync(
        `ffprobe -i "${videoPath}" -show_streams -select_streams a -loglevel error`,
        { stdio: 'pipe', timeout: 10000 }
      );
      hasAudio = probe.toString().includes('codec_type=audio');
    } catch { /* no audio track */ }

    // Reassemble: take video from restored frames, audio from original
    const audioArgs = hasAudio
      ? `-i "${videoPath}" -map 0:v -map 1:a -c:a aac -shortest`
      : '';

    execSync(
      `ffmpeg -y -framerate ${fps} -i "${restoredDir}/frame_%06d.jpg" ` +
      `${audioArgs} -c:v libx264 -pix_fmt yuv420p -crf 18 "${restoredVideoPath}"`,
      { stdio: 'pipe', timeout: 300000 }
    );

    logger.info(`Face-restored video saved: ${restoredVideoPath} (${allFrames.length} frames)`);
    return { videoPath: restoredVideoPath };

  } finally {
    // Always clean up frame directories
    try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(restoredDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Validate that a file is a real video (not a JSON error or empty file).
 * @param {string} videoPath
 * @returns {boolean}
 */
function validateVideoFile(videoPath) {
  if (!fs.existsSync(videoPath)) return false;
  const stats = fs.statSync(videoPath);
  if (stats.size < 5000) return false; // too small to be a real video

  // Check for MP4/MOV magic bytes (ftyp box)
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(videoPath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);

  // MP4 files have 'ftyp' at bytes 4-7
  const ftyp = buf.toString('ascii', 4, 8);
  return ftyp === 'ftyp';
}

module.exports = {
  generateTTS,
  generateLipSync,
  restoreFace,
  restoreAndUploadAvatar,
  restoreVideoFaces,
  validateVideoFile,
  uploadAssetToSegmind,
  DEFAULT_INFINITETALK_SETTINGS,
};
