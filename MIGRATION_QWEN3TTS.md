# Migration Guide: ElevenLabs → Qwen3-TTS

This document outlines the migration from ElevenLabs to Qwen3-TTS for the Noir Factory TTS system.

## What Changed

### Removed
- ❌ ElevenLabs API integration (`@elevenlabs/elevenlabs-js` package)
- ❌ ElevenLabs API keys from environment variables
- ❌ Cloud-based TTS API calls
- ❌ MP3 audio format (replaced with WAV)

### Added
- ✅ Qwen3-TTS local Docker container integration
- ✅ Configuration-based character voice profiles
- ✅ Reference audio system for voice cloning
- ✅ YAML configuration file (`config/defaults.yaml`)
- ✅ Character profile directories
- ✅ Health check for TTS service

## New File Structure

```
noir-factory/
├── config/
│   ├── defaults.yaml                    # NEW: Central configuration
│   └── character-profiles/              # NEW: Voice profiles
│       ├── README.md
│       ├── bianca/
│       │   └── reference_audio.wav     # REQUIRED
│       ├── larry/
│       │   └── reference_audio.wav     # REQUIRED
│       └── malik/
│           └── reference_audio.wav     # REQUIRED
├── src/
│   └── services/
│       ├── audio.service.js            # REFACTORED
│       └── tts/
│           └── qwen3-tts.js            # NEW: TTS module
└── .env.example                        # UPDATED
```

## Environment Variables Changes

### Remove from `.env`
```bash
# DELETE THESE:
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_BIANCA_ID=...
ELEVENLABS_VOICE_LARRY_ID=...
ELEVENLABS_VOICE_MALIK_ID=...
```

### Add to `.env`
```bash
# ADD THESE:
TTS_SERVICE_URL=http://localhost:5000
TTS_TIMEOUT=120000
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install js-yaml
npm uninstall @elevenlabs/elevenlabs-js  # Already done
```

### 2. Set Up Qwen3-TTS Docker Container

```bash
# Pull Qwen3-TTS Docker image
docker pull qwen3-tts:latest

# Run the container
docker run -d \
  --name qwen3-tts \
  -p 5000:5000 \
  -v $(pwd)/config/character-profiles:/app/profiles \
  qwen3-tts:latest
```

### 3. Add Reference Audio Files

For each character, you need to provide a reference audio file:

```bash
# Place reference audio files in character directories
config/character-profiles/bianca/reference_audio.wav
config/character-profiles/larry/reference_audio.wav
config/character-profiles/malik/reference_audio.wav
```

**Reference Audio Requirements:**
- Format: WAV (22050 Hz or higher)
- Duration: 5-30 seconds
- Quality: Clean, no background noise
- Content: Natural speech, multiple sentences

### 4. Update `.env` File

```bash
# Copy example file
cp .env.example .env

# Edit .env and set:
TTS_SERVICE_URL=http://localhost:5000
TTS_TIMEOUT=120000

# Remove old ElevenLabs variables
```

### 5. Test the Setup

```bash
# Check TTS service health
curl http://localhost:5000/health

# Run a test
node test-audio.js  # (create this test file if needed)
```

## Code Changes Summary

### `src/services/audio.service.js`
- **Before**: Used ElevenLabs SDK with API keys and voice IDs
- **After**: Uses local Qwen3-TTS service with reference audio files

**Key Differences:**
1. No more API keys or external API calls
2. Uses character voice profiles from config
3. Outputs WAV format instead of MP3
4. Local processing (faster, no API limits)

### `src/services/tts/qwen3-tts.js` (NEW)
- Handles all TTS API communication
- Loads character profiles from config
- Sends reference audio with each request
- Includes health check functionality

### `config/defaults.yaml` (NEW)
- Central configuration for all services
- Character voice profiles and settings
- TTS service configuration
- Easy to modify without code changes

## API Differences

### ElevenLabs (OLD)
```javascript
const audio = await elevenlabs.generate({
  voice: voiceId,
  text: fullText,
  model_id: 'eleven_monolingual_v1',
  voice_settings: { stability: 0.5, similarity_boost: 0.75 }
});
```

### Qwen3-TTS (NEW)
```javascript
const audioBuffer = await synthesizeSpeech(
  fullText,
  characterId  // Uses reference audio from config
);
```

## Benefits of Migration

1. **Cost Savings**: No API usage costs
2. **Privacy**: All processing is local
3. **Speed**: No network latency
4. **Customization**: Full control over voice profiles
5. **Reliability**: No external service dependencies
6. **Scalability**: No rate limits or quotas

## Configuration Management

### Adding a New Character

1. Create character directory:
```bash
mkdir config/character-profiles/newcharacter
```

2. Add reference audio:
```bash
# Add reference_audio.wav to the directory
```

3. Update `config/defaults.yaml`:
```yaml
characters:
  newcharacter:
    id: "newcharacter"
    name: "NewCharacter"
    profile_path: "config/character-profiles/newcharacter"
    reference_audio: "reference_audio.wav"
    voice_settings:
      speed: 1.0
      temperature: 0.7
```

4. Restart the application

### Adjusting Voice Settings

Edit `config/defaults.yaml`:

```yaml
characters:
  bianca:
    voice_settings:
      speed: 1.2      # Faster speech
      temperature: 0.8  # More variation
```

## Troubleshooting

### TTS Service Not Reachable
```bash
# Check if Docker container is running
docker ps | grep qwen3-tts

# Check logs
docker logs qwen3-tts

# Restart container
docker restart qwen3-tts
```

### Reference Audio Not Found
```bash
# Verify file exists
ls -la config/character-profiles/bianca/reference_audio.wav

# Check file permissions
chmod 644 config/character-profiles/*/reference_audio.wav
```

### Health Check Failing
```bash
# Test service directly
curl http://localhost:5000/health

# Check if port is in use
lsof -i:5000
```

## Rollback Instructions

If you need to rollback to ElevenLabs:

1. Restore old `audio.service.js` from git history
2. Reinstall ElevenLabs package: `npm install @elevenlabs/elevenlabs-js`
3. Restore environment variables in `.env`
4. Update orchestrator if needed

```bash
git checkout HEAD~1 src/services/audio.service.js
npm install @elevenlabs/elevenlabs-js
```

## Support

For issues or questions:
1. Check Docker container logs
2. Verify reference audio files exist
3. Review `config/defaults.yaml` syntax
4. Test TTS service health endpoint
5. Check application logs for detailed error messages
