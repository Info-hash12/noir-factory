# Noir Factory Video Layout Compositors - Implementation Summary

## Overview
Added 6 new video layout compositors to `src/services/compositor.service.js`. All layouts are configured for vertical format (1080x1920) and use ffmpeg filter_complex for composition.

## Layouts Implemented

### 1. **news_overlay**
**Description:** Avatar top-right corner + red chyron bar with scrolling ticker  
**Resolution:** 1080x1920 (vertical)  
**Features:**
- Avatar video: 25% width (270px), circular mask, positioned top-right
- Blurred background: Scaled/blurred screenshot
- Chyron bar: Bottom 30% of frame (576px), red background (#FF0000) with white headline text
- Ticker: Dark bar below chyron with scrolling text
- Function: `composeNewsOverlay()`

**FFmpeg Approach:**
- Scale and blur screenshot for background
- Apply circular mask to avatar video
- Draw red chyron box with drawtext filter
- Composite avatar overlay on background
- Overlay creates final layered effect

---

### 2. **quote_card**
**Description:** Static layout with gradient background and centered quote text  
**Resolution:** Varies by platform  
**Features:**
- Handled by `pipeline-static.js` (not by compositor service)
- This entry exists in LAYOUTS object for frontend awareness
- Throws error if called directly (static-only layout)

---

### 3. **reaction**
**Description:** Avatar fills 70%, source content as PiP in top-right corner  
**Resolution:** 1080x1920 (vertical)  
**Features:**
- Avatar video: Scaled to 70% of frame height (1344px tall)
- Screenshot PiP: Top-right corner, 35% width (378px) x 35% height (672px)
- Black padding fills remaining space
- Function: `composeReaction()`

**FFmpeg Approach:**
- Stretch avatar to 70% height using scale filter
- Scale screenshot to 35% size for PiP
- Pad avatar section to full canvas height
- Overlay PiP at top-right with 20px margins

---

### 4. **scroll_through**
**Description:** Content scrolls upward with audio visualization bar at bottom  
**Resolution:** 1080x1920 (vertical)  
**Features:**
- Scrolling content: Screenshot pans vertically upward (Ken Burns effect)
- Audio bar: 120px tall, dark background at bottom (#222222)
- Scrolling zone: 1800px tall (1.5x frame height)
- Function: `composeScrollThrough()`

**FFmpeg Approach:**
- Use zoompan filter for vertical scroll effect
- Scale screenshot to 2x frame height for smooth panning
- Create separate audio bar layer with placeholder visualization
- Stack scroll layer and audio bar vertically

---

### 5. **duet_style**
**Description:** Split screen - avatar left 45%, content right 55% with slow zoom  
**Resolution:** 1080x1920 (vertical)  
**Features:**
- Avatar side: Left 45% of frame (486px), full-height video
- Content side: Right 55% of frame (594px), screenshot with slow zoom
- Divider: Thin dark line (4px) between halves
- Function: `composeDuetStyle()`

**FFmpeg Approach:**
- Resize avatar to left half dimensions
- Apply slow zoom effect to screenshot using zoompan (zoom factor 1.0 → 1.3)
- Add padding/divider to left section
- Horizontally stack using hstack filter

---

### 6. **word_by_word**
**Description:** Text appears word by word, centered, with avatar PiP bottom-right  
**Resolution:** 1080x1920 (vertical)  
**Features:**
- Black background
- Text animation: Words appear sequentially, large white font (96px)
- Timing: Synced to audio duration (words per second = text_word_count / audio_duration)
- Avatar PiP: Bottom-right corner, 200px, overlay
- Function: `composeWordByWord()`

**FFmpeg Approach:**
- Create color background (black)
- Build filter_complex with multiple drawtext filters
- Each word wrapped with `enable='between(t, start_time, end_time)'` expression
- Scale and overlay avatar at bottom-right
- Join all text layers with comma separation in filter chain

---

## Technical Implementation Details

### Canvas Resolution
- New layouts use **1080x1920** (vertical/portrait format)
- Maintains compatibility with mobile-first social media

### Helper Functions Used
- `runFFmpeg()` - Executes ffmpeg with error handling
- `scaleVideo()` - Resizes video to target dimensions with padding
- `scaleImage()` - Converts static image to video loop with padding
- `maskAvatar()` - Applies circular/rounded-rect masks to avatar

### FFmpeg Filter Chains
Each layout uses `filter_complex` for multi-input processing:
- **overlay** - Layer videos/images with position offsets
- **scale** - Resize with aspect ratio preservation
- **pad** - Add borders/padding with color fill
- **drawtext** - Add text with timing controls
- **zoompan** - Ken Burns zoom effect
- **vstack/hstack** - Stack videos vertically or horizontally
- **boxblur** - Blur effects for backgrounds
- **geq** - Pixel-level alpha masking for circular shapes

### Resolution & Format
- H.264 codec (`libx264`)
- 22 CRF quality setting (good balance)
- AAC audio (192k bitrate)
- yuv420p pixel format (compatibility)
- 30 FPS for animations

---

## Module Exports
Updated LAYOUTS object now includes:
```javascript
LAYOUTS = {
  pip_reddit_bg,    // Original 5
  split_vertical,
  hook_then_reddit,
  text_first,
  faceless,
  news_overlay,     // New 6
  quote_card,
  reaction,
  scroll_through,
  duet_style,
  word_by_word
}
```

Frontend can now access all 11 layout options via the compositor service exports.

---

## Integration Notes
1. **quote_card** does not use ffmpeg composition (static pipeline)
2. **word_by_word** requires `onScreenText` parameter for text content
3. **news_overlay** requires `sourceTitle` parameter for chyron text
4. **scroll_through** accepts `onScreenText` for on-screen highlighting
5. All layouts accept standard `avatarVideoPath`, `screenshotPath`, `audioPath`
6. All layouts automatically adjust to audio duration

## Testing Checklist
- [ ] news_overlay: Verify avatar circular mask and chyron text rendering
- [ ] reaction: Confirm PiP positioning and sizing
- [ ] scroll_through: Test vertical scroll smoothness
- [ ] duet_style: Verify split-screen alignment and zoom effect
- [ ] word_by_word: Test text timing synchronization
- [ ] All: Audio sync across all layouts

