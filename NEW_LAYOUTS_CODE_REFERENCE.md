# New Layouts - Code Reference

## File Location
`/sessions/focused-zealous-carson/mnt/noir-factory-2/src/services/compositor.service.js`

## Function Signatures

### 1. composeNewsOverlay()
```javascript
async function composeNewsOverlay({ 
  avatarVideoPath,     // path to avatar video
  screenshotPath,      // path to screenshot
  audioPath,           // path to audio
  audioDuration,       // duration in seconds
  sourceTitle,         // headline text for chyron
  outputPath           // output file path
})
```
- Lines: 456-541
- Key FFmpeg: boxblur, drawtext, overlay, circular mask (geq)

### 2. composeReaction()
```javascript
async function composeReaction({ 
  avatarVideoPath,     // path to avatar video
  screenshotPath,      // path to screenshot
  audioPath,           // path to audio
  audioDuration,       // duration in seconds
  outputPath           // output file path
})
```
- Lines: 545-586
- Key FFmpeg: scale, pad, overlay

### 3. composeScrollThrough()
```javascript
async function composeScrollThrough({ 
  screenshotPath,      // path to screenshot
  audioPath,           // path to audio
  audioDuration,       // duration in seconds
  onScreenText,        // text for overlay (optional)
  outputPath           // output file path
})
```
- Lines: 592-643
- Key FFmpeg: zoompan (vertical scroll), vstack

### 4. composeDuetStyle()
```javascript
async function composeDuetStyle({ 
  avatarVideoPath,     // path to avatar video
  screenshotPath,      // path to screenshot
  audioPath,           // path to audio
  audioDuration,       // duration in seconds
  outputPath           // output file path
})
```
- Lines: 646-697
- Key FFmpeg: zoompan (slow zoom), hstack, pad

### 5. composeWordByWord()
```javascript
async function composeWordByWord({ 
  avatarVideoPath,     // path to avatar video
  audioPath,           // path to audio
  audioDuration,       // duration in seconds
  onScreenText,        // text to display
  outputPath           // output file path
})
```
- Lines: 704-776
- Key FFmpeg: drawtext with time-based enable expressions, overlay

---

## Layout Object Entries

All added to the LAYOUTS object (lines 39-62):

```javascript
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
```

---

## Switch Statement Cases

Added to composeVideo() dispatch (lines 228-249):

```javascript
case 'news_overlay':
  await composeNewsOverlay({ avatarVideoPath, screenshotPath, audioPath, 
    audioDuration, sourceTitle, outputPath });
  break;

case 'quote_card':
  throw new Error('Quote Card is a static layout handled by pipeline-static.js, not by compositor');

case 'reaction':
  await composeReaction({ avatarVideoPath, screenshotPath, audioPath, 
    audioDuration, outputPath });
  break;

case 'scroll_through':
  await composeScrollThrough({ screenshotPath, audioPath, audioDuration, 
    onScreenText, outputPath });
  break;

case 'duet_style':
  await composeDuetStyle({ avatarVideoPath, screenshotPath, audioPath, 
    audioDuration, outputPath });
  break;

case 'word_by_word':
  await composeWordByWord({ avatarVideoPath, audioPath, audioDuration, 
    onScreenText, outputPath });
  break;
```

---

## Key Constants

### Canvas Dimensions (all new layouts)
```javascript
const CANVAS_W = 1080;  // Width (vertical format)
const CANVAS_H = 1920;  // Height (vertical format)
```

### Colors Used
- Red chyron: `#FF0000` (news_overlay)
- Dark audio bar: `#222222` (scroll_through)
- Black background: `0x000000` (word_by_word)
- White text: `white` or `#FFFFFF` (all text layouts)
- Purple accent: `#6C5CE7` (word_by_word, defined but not used)

### Font Settings
- Font: DejaVuSans-Bold or DejaVuSans
- Path: `/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`
- Text sizes:
  - Chyron text: 48px
  - Word by word: 96px
  - Audio bar: 24px

### Encoding Settings (All Layouts)
```javascript
'-c:v', 'libx264',       // H.264 video codec
'-preset', 'fast',       // Fast encoding
'-crf', '22',            // Quality (0-51, lower is better)
'-c:a', 'aac',           // AAC audio codec
'-b:a', '192k',          // Audio bitrate
'-pix_fmt', 'yuv420p'    // Pixel format for compatibility
```

---

## Integration with composeVideo()

The main function now accepts these new parameters:

```javascript
async function composeVideo(params) {
  const {
    // ... existing parameters
    sourceTitle = '',    // NEW: for news_overlay
    onScreenText = ''    // NEW: for scroll_through, word_by_word
  } = params;
  
  // ... existing code
  
  switch (layout) {
    // ... existing cases
    case 'news_overlay':
      await composeNewsOverlay({ avatarVideoPath, screenshotPath, audioPath, 
        audioDuration, sourceTitle, outputPath });
      break;
    // ... rest of new cases
  }
}
```

---

## Testing the Layouts

### Minimal Test Parameters

**news_overlay:**
```javascript
composeVideo({
  avatarVideoPath: '/path/to/avatar.mp4',
  screenshotUrl: 'https://example.com/screenshot.png',
  audioPath: '/path/to/audio.mp3',
  layout: 'news_overlay',
  sourceTitle: 'Breaking News Headline Here'
})
```

**reaction:**
```javascript
composeVideo({
  avatarVideoPath: '/path/to/avatar.mp4',
  screenshotUrl: 'https://example.com/screenshot.png',
  audioPath: '/path/to/audio.mp3',
  layout: 'reaction'
})
```

**scroll_through:**
```javascript
composeVideo({
  screenshotUrl: 'https://example.com/screenshot.png',
  audioPath: '/path/to/audio.mp3',
  layout: 'scroll_through',
  onScreenText: 'Key phrase one Key phrase two Key phrase three'
})
```

**duet_style:**
```javascript
composeVideo({
  avatarVideoPath: '/path/to/avatar.mp4',
  screenshotUrl: 'https://example.com/screenshot.png',
  audioPath: '/path/to/audio.mp3',
  layout: 'duet_style'
})
```

**word_by_word:**
```javascript
composeVideo({
  avatarVideoPath: '/path/to/avatar.mp4',
  audioPath: '/path/to/audio.mp3',
  layout: 'word_by_word',
  onScreenText: 'Word by word text animation demo'
})
```

---

## Total Additions
- 6 new composition functions: ~330 lines
- LAYOUTS object: +6 new entries
- Switch statement: +6 new cases
- Parameter documentation: Added sourceTitle and onScreenText to JSDoc
- File now: 807 lines (was ~420 lines for 5 layouts)

