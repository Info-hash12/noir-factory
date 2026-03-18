/**
 * Avatar Routes
 * CRUD for avatars — backed by Airtable Avatar Library
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const airtable = require('../services/airtable.service');
const logger = require('../utils/logger');

// Multer: store uploads in tmp dir
const TMP_DIR = path.join(__dirname, '../../tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(png|jpg|jpeg|gif|mp3|wav|ogg|m4a)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only image/audio files allowed'), ok);
  }
});

// GET /api/avatars
// List all avatars
router.get('/', async (req, res) => {
  try {
    const avatars = await airtable.getAvatars();
    res.json({ success: true, avatars: avatars.map(airtable.normalizeAvatar) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/avatars/upload
// Upload image (and optionally voice) for an avatar
// Form fields: name (string), record_id (optional — if updating existing), image (file), voice (file)
router.post('/upload', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]), async (req, res) => {
  const { name, record_id } = req.body;

  if (!name) return res.status(400).json({ success: false, error: 'Avatar name required' });

  try {
    const imageFile = req.files?.image?.[0];
    const voiceFile = req.files?.voice?.[0];

    // Upload files to a hosting service so Airtable can reference them
    // We use ImgBB for images (free), base64 encode for voice
    let imageUrl = null;
    let voiceUrl = null;

    if (imageFile) {
      imageUrl = await uploadToImgBB(imageFile.path);
      logger.info(`Image uploaded to ImgBB: ${imageUrl}`);
    }

    if (voiceFile) {
      voiceUrl = await uploadAudioFile(voiceFile.path, voiceFile.originalname);
      logger.info(`Voice uploaded: ${voiceUrl}`);
    }

    let result;
    if (record_id) {
      // Update existing
      const updates = {};
      if (imageUrl) updates['Avatar Image'] = [{ url: imageUrl }];
      if (voiceUrl) updates['Voice Sample'] = [{ url: voiceUrl }];
      if (name) updates['Name'] = name;
      result = await airtable.updateAvatar(record_id, updates);
    } else {
      // Create new
      result = await airtable.createAvatar(name, imageUrl, voiceUrl);
    }

    // Cleanup tmp
    if (imageFile) fs.unlink(imageFile.path, () => {});
    if (voiceFile) fs.unlink(voiceFile.path, () => {});

    res.json({ success: true, avatar: result });

  } catch (e) {
    logger.error('Avatar upload failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/avatars/voice-group
// Upload one voice file and apply it to ALL avatars whose name contains a character prefix.
// Body (multipart): character_name (string), voice (file)
router.post('/voice-group', upload.fields([{ name: 'voice', maxCount: 1 }]), async (req, res) => {
  const { character_name } = req.body;
  if (!character_name) return res.status(400).json({ success: false, error: 'character_name required' });

  const voiceFile = req.files?.voice?.[0];
  if (!voiceFile) return res.status(400).json({ success: false, error: 'voice file required' });

  try {
    // Upload audio to a public host (Airtable will fetch and cache it permanently)
    const voiceUrl = await uploadAudioFile(voiceFile.path, voiceFile.originalname);
    logger.info(`Group voice uploaded: ${voiceUrl}`);

    // Get all avatars and filter by character name (case-insensitive contains match)
    const avatars = await airtable.getAvatars();
    const matches = avatars.filter(r => {
      const name = (r.fields?.Name || '').toLowerCase();
      return name.includes(character_name.toLowerCase());
    });

    if (!matches.length) {
      fs.unlink(voiceFile.path, () => {});
      return res.status(404).json({ success: false, error: `No avatars found matching "${character_name}"` });
    }

    // Update each matching avatar in Airtable with the voice URL
    await Promise.all(
      matches.map(r => airtable.updateAvatar(r.id, { 'Voice Sample': [{ url: voiceUrl }] }))
    );

    fs.unlink(voiceFile.path, () => {});
    logger.info(`Voice applied to ${matches.length} avatars matching "${character_name}"`);
    res.json({ success: true, updated: matches.length, voice_url: voiceUrl, character: character_name });

  } catch (e) {
    if (voiceFile) fs.unlink(voiceFile.path, () => {});
    logger.error('Voice group upload failed:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/avatars/clear-voice/:id
// Remove the Voice Sample from a single avatar record
router.post('/clear-voice/:id', async (req, res) => {
  try {
    await airtable.updateAvatar(req.params.id, { 'Voice Sample': [] });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/avatars/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await axios.delete(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_AVATAR_TABLE}/${id}`,
      { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } }
    );
    res.json({ success: true, message: 'Avatar deleted' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Upload file to a hosting service.
 * Tries ImgBB first (if IMGBB_API_KEY is set), then freeimage.host, then base64 data URI.
 */
async function uploadToImgBB(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const IMGBB_KEY = process.env.IMGBB_API_KEY;

  // 1. Try ImgBB if key is configured
  if (IMGBB_KEY) {
    try {
      const form = new FormData();
      form.append('key', IMGBB_KEY);
      form.append('image', base64);
      const response = await axios.post('https://api.imgbb.com/1/upload', form, {
        headers: form.getHeaders(),
        timeout: 30000
      });
      if (response.data?.data?.url) {
        logger.info('Image uploaded via ImgBB');
        return response.data.data.url;
      }
    } catch (imgbbErr) {
      logger.warn(`ImgBB upload failed: ${imgbbErr.message} — trying freeimage.host`);
    }
  }

  // 2. Fallback: freeimage.host (no personal key needed)
  try {
    const form = new FormData();
    form.append('key', '6d207e02198a847aa98d0a2a901485a5');
    form.append('action', 'upload');
    form.append('source', base64);
    form.append('format', 'json');
    const response = await axios.post('https://freeimage.host/api/1/upload', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });
    if (response.data?.image?.url) {
      logger.info('Image uploaded via freeimage.host');
      return response.data.image.url;
    }
  } catch (freeErr) {
    logger.warn(`freeimage.host upload failed: ${freeErr.message} — falling back to base64 data URI`);
  }

  // 3. Last resort: return base64 data URI
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
  logger.warn('All image hosts failed — using base64 data URI');
  return `data:${mime};base64,${base64}`;
}

/**
 * Upload an audio file to a public host for temporary access (Chatterbox voice cloning / Airtable fetch).
 * Airtable caches the file immediately on record update, so the temporary URL only needs to live
 * long enough for Airtable's servers to fetch it.
 *
 * Chain: tmpfiles.org → transfer.sh → 0x0.st
 */
async function uploadAudioFile(filePath, originalName) {
  const filename = originalName || path.basename(filePath);

  // 1. Try tmpfiles.org (reliable, HTTPS, ~60min lifetime — enough for Airtable to cache)
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename });
    const response = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
      headers: form.getHeaders(),
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const raw = response.data?.data?.url;
    if (raw) {
      // API returns http://tmpfiles.org/{id}/{file} — convert to direct download HTTPS URL
      const url = raw.replace('http://tmpfiles.org/', 'https://tmpfiles.org/dl/');
      logger.info(`Audio uploaded via tmpfiles.org: ${url}`);
      return url;
    }
  } catch (e) {
    logger.warn(`tmpfiles.org upload failed: ${e.message} — trying transfer.sh`);
  }

  // 2. Fallback: transfer.sh
  try {
    const response = await axios.put(
      `https://transfer.sh/${encodeURIComponent(filename)}`,
      fs.createReadStream(filePath),
      {
        headers: { 'Max-Days': '365', 'Max-Downloads': '0' },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    const url = response.data.trim();
    if (url.startsWith('https://')) {
      logger.info(`Audio uploaded via transfer.sh: ${url}`);
      return url;
    }
  } catch (e) {
    logger.warn(`transfer.sh upload failed: ${e.message} — trying 0x0.st`);
  }

  // 3. Last fallback: 0x0.st
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename });
    const response = await axios.post('https://0x0.st', form, {
      headers: form.getHeaders(),
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    const url = response.data.trim();
    if (url.startsWith('https://')) {
      logger.info(`Audio uploaded via 0x0.st: ${url}`);
      return url;
    }
  } catch (e) {
    logger.warn(`0x0.st upload failed: ${e.message}`);
  }

  throw new Error('All audio upload hosts failed. Please try again or use a different file.');
}

module.exports = router;
