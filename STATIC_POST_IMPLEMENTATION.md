# Static Post Renderer & Image Resizer Implementation

## Overview
Built a complete static post generation pipeline for Noir Factory that creates platform-optimized images without video or avatars. This includes an image resizing service and a static post pipeline supporting three formats: single posts, carousels, and stories.

## Files Created

### 1. `/src/services/image-resizer.service.js`
**Purpose:** High-performance image processing and resizing for multiple social media platforms

**Key Functions:**
- `resizeForPlatform(inputPathOrBuffer, platform, contentType)` — Resizes image to platform-specific dimensions with smart center-crop to maintain aspect ratio. Supports both file paths and Buffer inputs.
- `resizeForAllPlatforms(inputPathOrBuffer, platforms, contentType)` — Batch resize for multiple platforms, returns array of processed images.
- `generateTextOverlay(text, width, height, options)` — Creates SVG text overlays with customizable font size, color, background, and position.
- `generateQuoteCard(quoteText, authorName, brandName, width, height, gradientColors)` — Generates branded quote card images with gradient backgrounds and styled text.
- `compositeImages(baseBuffer, overlayBuffer, options)` — Composites one image on top of another with positioning and opacity control.

**Features:**
- Reads platform dimensions from `platform_specs` table with fallback defaults for Instagram, Facebook, TikTok, Threads, Twitter, LinkedIn, Pinterest
- Uses `sharp` npm package for optimized image processing (90% JPEG quality, PNG support)
- Smart center-crop algorithm maintains target aspect ratio
- Returns image metadata: `{ buffer, width, height, format, size, aspectRatio }`

### 2. `/src/services/pipeline-static.js`
**Purpose:** End-to-end pipeline for generating static social media posts

**Main Entry Points:**
- `generateStaticPost(job, company)` — Generates a single static post
  - Retrieves content from content_items table
  - Captures screenshot via HCTI service
  - Generates AI caption if not provided (via OpenRouter)
  - Routes to appropriate generator (single/carousel/story)
  - Saves images locally and updates job status

- `generateCarousel(job, company, screenshotBuffer, caption, onScreenText)` — Creates 3-5 carousel frames
  - Resizes screenshot for carousel aspect ratio
  - Adds frame-specific text overlays
  - Generates images for each target platform

- `generateStory(job, company, screenshotBuffer, caption, onScreenText)` — Creates vertical 9:16 story format
  - Resizes screenshot for story dimensions
  - Adds caption at bottom
  - Platform-optimized for Instagram Stories, TikTok, etc.

**Helper Functions:**
- `generateSinglePost()` — Creates a single static image with optional text overlay
- `uploadImageToStorage()` — Saves images to local tmp directory (extensible for S3/Supabase)
- `downloadScreenshot()` — Downloads HCTI-generated screenshots into memory as Buffer

**Processing Steps:**
1. Content preparation (fetch from content_items)
2. Screenshot generation (via HCTI service)
3. Caption generation (via OpenRouter if needed)
4. Image generation based on job_type
5. Image upload/storage
6. Job status update

### 3. Updated `/src/services/pipeline.v2.js`
**Changes:**
- Added import for static post pipeline functions
- Added job type routing logic at start of `runPipeline()` function:
  - `job_type === 'static_post'` → calls `generateStaticPost()`
  - `job_type === 'carousel'` → calls `generateCarousel()`
  - `job_type === 'story'` → calls `generateStory()`
  - Default (video_with_avatar, reel) → existing video pipeline
- Each job type has independent error handling with proper job status updates
- Maintains job tracking for graceful shutdown

### 4. Updated `package.json`
- Added `"sharp": "^0.33.2"` to dependencies for image processing

## Job Types Supported

### static_post
Single image post optimized for the target platform. Best for:
- Quote graphics
- Informational images
- Single promotional posts

### carousel
Multiple frames (3-5 images) in a carousel format. Best for:
- Step-by-step guides
- Multi-part stories
- Sequential content

### story
Vertical 9:16 format optimized for Stories (Instagram Stories, TikTok, etc.). Best for:
- Vertical content
- Full-screen experiences
- Time-limited content

## Platform Support

**Default Dimensions (if not in platform_specs table):**
- Instagram: 1080x1350 (4:5), Story: 1080x1920 (9:16)
- Facebook: 1200x628 (1.91:1)
- TikTok: 1080x1920 (9:16)
- Threads: 1080x1350 (4:5)
- Twitter: 1024x512 (2:1)
- LinkedIn: 1200x627 (1.91:1)
- Pinterest: 1000x1500 (2:3)

Dimensions are read from `platform_specs` table when available, with smart fallbacks.

## Image Processing Features

### Smart Cropping
- Center-crop algorithm that maintains target aspect ratio
- Handles both portrait and landscape source images
- Preserves maximum content visibility

### Text Overlays
- SVG-based text rendering with customizable styling
- Supports multiple positions: top, center, bottom
- Adjustable font size, color, and background opacity
- Automatic text escaping for special characters

### Quality Optimization
- JPEG: 90% quality with progressive encoding
- PNG: Full quality with lossless compression
- Automatic format selection based on content type

## Database Integration

**Required Tables:**
- `content_items` — Source content with title, description, image_url, author
- `content_jobs` — Processing jobs with job_type, target_platforms, status fields
- `platform_specs` — Platform dimensions (optional, has smart defaults)

**Table Updates During Processing:**
- `content_jobs`: Updates processing_step, image_urls, caption, publish_status
- Includes error tracking with error_message and processing_step on failure

## Error Handling

All pipeline functions include:
- Graceful error handling with detailed logging
- Partial success support (continues if one platform fails)
- Job status tracking for debugging
- Error messages stored in content_jobs table

## Future Enhancements

1. **Cloud Storage Integration:**
   - Replace local tmp storage with Supabase Storage or AWS S3
   - Return presigned URLs for direct image access

2. **Advanced Text Rendering:**
   - Multi-line text with word wrapping
   - Custom font families (currently limited to web-safe fonts)
   - Text animation or motion effects

3. **Image Composition:**
   - Composite multiple images into single frame
   - Watermark placement automation
   - Background blur and effects

4. **Performance:**
   - Parallel platform resizing
   - Image caching/memoization
   - Batch processing optimization

## Usage Example

```javascript
const { generateStaticPost } = require('./services/pipeline-static');

const job = {
  id: 'job-123',
  content_item_id: 'item-456',
  job_type: 'static_post',
  target_platforms: ['instagram', 'facebook', 'tiktok'],
  company_id: 'company-789'
};

const result = await generateStaticPost(job, { id: 'company-789' });
// Returns: { success: true, jobId, imageUrls, caption, jobType }
```

## Testing Checklist

- [ ] Image resizing maintains aspect ratio correctly
- [ ] Text overlays render properly with special characters
- [ ] Screenshot download and processing works end-to-end
- [ ] Caption generation via OpenRouter integrates correctly
- [ ] All three job types (static, carousel, story) route correctly
- [ ] Error handling gracefully skips failed platforms
- [ ] Job status updates properly throughout pipeline
- [ ] Image files saved to tmp directory with correct filenames
- [ ] Sharp dependencies install without errors
- [ ] Pipeline maintains backward compatibility with video jobs
