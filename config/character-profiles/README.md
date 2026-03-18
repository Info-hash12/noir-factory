# Character Voice Profiles

This directory contains voice profiles for each character used in the Noir Factory TTS system.

## Directory Structure

Each character has their own subdirectory containing:
- `reference_audio.wav` - Reference audio file for voice cloning (required)
- Additional reference samples (optional)

## Example Structure

```
character-profiles/
├── bianca/
│   ├── reference_audio.wav  (REQUIRED)
│   └── reference_audio_alt.wav (optional)
├── larry/
│   ├── reference_audio.wav  (REQUIRED)
│   └── reference_audio_alt.wav (optional)
└── malik/
    ├── reference_audio.wav  (REQUIRED)
    └── reference_audio_alt.wav (optional)
```

## Adding a New Character

1. Create a new directory with the character's name (lowercase)
2. Add a `reference_audio.wav` file with a clean voice sample
3. Update `config/defaults.yaml` with the character's configuration:

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

## Reference Audio Requirements

- **Format**: WAV (recommended) or MP3
- **Sample Rate**: 22050 Hz or higher
- **Duration**: 5-30 seconds
- **Quality**: Clean, no background noise
- **Content**: Natural speech, preferably multiple sentences
- **Language**: Match your target language

## Voice Settings

- **speed**: Speech rate (0.5 - 2.0, default: 1.0)
- **temperature**: Voice variation (0.0 - 1.0, default: 0.7)
  - Lower = more consistent
  - Higher = more varied/expressive
