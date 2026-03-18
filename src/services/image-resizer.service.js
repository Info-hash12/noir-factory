/**
 * Image Resizer Service
 * Handles resizing and transforming images for different social media platforms
 * Uses sharp for high-performance image processing
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const { getSupabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

/**
 * Get platform specifications for image dimensions
 * @param {string} platform - Platform name (instagram, facebook, tiktok, etc)
 * @param {string} contentType - Content type (image, carousel, story)
 * @returns {Promise<Object>} Specs with width, height, aspectRatio
 */
async function getPlatformDimensions(platform, contentType = 'image') {
  try {
    const client = getSupabaseAdmin();
    const { data, error } = await client
      .from('platform_specs')
      .select('width, height, aspect_ratio')
      .eq('platform', platform.toLowerCase())
      .eq('content_type', contentType.toLowerCase())
      .single();

    if (error || !data) {
      logger.warn(`Platform specs not found for ${platform}/${contentType}, using defaults`);
      return getDefaultDimensions(platform, contentType);
    }

    return {
      width: data.width,
      height: data.height,
      aspectRatio: data.aspect_ratio
    };
  } catch (error) {
    logger.error('Failed to get platform dimensions:', error);
    return getDefaultDimensions(platform, contentType);
  }
}

/**
 * Default dimensions for common platforms
 */
function getDefaultDimensions(platform, contentType) {
  const specs = {
    instagram: {
      image: { width: 1080, height: 1350, aspectRatio: '4:5' },
      carousel: { width: 1080, height: 1350, aspectRatio: '4:5' },
      story: { width: 1080, height: 1920, aspectRatio: '9:16' }
    },
    facebook: {
      image: { width: 1200, height: 628, aspectRatio: '1.91:1' },
      carousel: { width: 1200, height: 628, aspectRatio: '1.91:1' }
    },
    tiktok: {
      image: { width: 1080, height: 1920, aspectRatio: '9:16' },
      story: { width: 1080, height: 1920, aspectRatio: '9:16' }
    },
    threads: {
      image: { width: 1080, height: 1350, aspectRatio: '4:5' },
      carousel: { width: 1080, height: 1350, aspectRatio: '4:5' },
      story: { width: 1080, height: 1920, aspectRatio: '9:16' }
    },
    twitter: {
      image: { width: 1024, height: 512, aspectRatio: '2:1' }
    },
    linkedin: {
      image: { width: 1200, height: 627, aspectRatio: '1.91:1' }
    },
    pinterest: {
      image: { width: 1000, height: 1500, aspectRatio: '2:3' }
    }
  };

  return specs[platform.toLowerCase()]?.[contentType.toLowerCase()] || {
    width: 1080,
    height: 1080,
    aspectRatio: '1:1'
  };
}

/**
 * Resize image for a specific platform
 * Uses smart center-crop to target aspect ratio, then resizes
 * @param {string|Buffer} inputPathOrBuffer - Path to source image or Buffer
 * @param {string} platform - Target platform
 * @param {string} contentType - Content type (image, carousel, story)
 * @returns {Promise<Object>} { buffer, width, height, format, size }
 */
async function resizeForPlatform(inputPathOrBuffer, platform, contentType = 'image') {
  try {
    logger.info(`[ImageResizer] Resizing for ${platform} (${contentType})`);

    // Get target dimensions
    const dims = await getPlatformDimensions(platform, contentType);
    const { width, height, aspectRatio } = dims;

    // Read and get metadata - handle both path and buffer
    let imageBuffer = inputPathOrBuffer;
    if (typeof inputPathOrBuffer === 'string') {
      imageBuffer = await fs.readFile(inputPathOrBuffer);
    }
    const metadata = await sharp(imageBuffer).metadata();

    const sourceAspectRatio = metadata.width / metadata.height;
    const targetAspectRatio = width / height;

    // Calculate crop dimensions for center-crop
    let cropWidth, cropHeight;
    if (sourceAspectRatio > targetAspectRatio) {
      // Source is wider than target — crop width
      cropHeight = metadata.height;
      cropWidth = Math.round(cropHeight * targetAspectRatio);
    } else {
      // Source is taller than target — crop height
      cropWidth = metadata.width;
      cropHeight = Math.round(cropWidth / targetAspectRatio);
    }

    // Center crop
    const leftOffset = Math.round((metadata.width - cropWidth) / 2);
    const topOffset = Math.round((metadata.height - cropHeight) / 2);

    // Resize with smart crop and quality optimization
    const format = contentType === 'story' || contentType === 'carousel' ? 'jpeg' : 'jpeg';
    const resized = sharp(imageBuffer)
      .extract({
        left: Math.max(0, leftOffset),
        top: Math.max(0, topOffset),
        width: Math.min(cropWidth, metadata.width),
        height: Math.min(cropHeight, metadata.height)
      })
      .resize(width, height, {
        fit: 'fill',
        withoutEnlargement: false
      });

    let output;
    if (format === 'png') {
      output = await resized.png({ quality: 100 }).toBuffer();
    } else {
      output = await resized.jpeg({ quality: 90, progressive: true }).toBuffer();
    }

    logger.info(`[ImageResizer] ✓ Resized to ${width}x${height} (${Math.round(output.length / 1024)}KB)`);

    return {
      buffer: output,
      width,
      height,
      format,
      size: output.length,
      aspectRatio
    };
  } catch (error) {
    logger.error(`[ImageResizer] Error resizing for ${platform}:`, error);
    throw error;
  }
}

/**
 * Resize image for multiple platforms
 * @param {string|Buffer} inputPathOrBuffer - Path to source image or Buffer
 * @param {Array<string>} platforms - Array of platform names
 * @param {string} contentType - Content type (image, carousel, story)
 * @returns {Promise<Array>} Array of { platform, buffer, width, height, format }
 */
async function resizeForAllPlatforms(inputPathOrBuffer, platforms, contentType = 'image') {
  try {
    logger.info(`[ImageResizer] Resizing for ${platforms.length} platforms`);
    const results = [];

    for (const platform of platforms) {
      try {
        const resized = await resizeForPlatform(inputPathOrBuffer, platform, contentType);
        results.push({
          platform,
          contentType,
          ...resized
        });
      } catch (error) {
        logger.warn(`[ImageResizer] Failed to resize for ${platform}:`, error.message);
        // Continue with next platform instead of failing entirely
      }
    }

    logger.info(`[ImageResizer] ✓ Resized for ${results.length}/${platforms.length} platforms`);
    return results;
  } catch (error) {
    logger.error('[ImageResizer] Error in resizeForAllPlatforms:', error);
    throw error;
  }
}

/**
 * Generate an image with text overlay
 * Uses sharp's composite with SVG text rendering
 * @param {string} text - Text to overlay
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} options - {fontSize, fontColor, backgroundColor, position}
 * @returns {Promise<Buffer>} Image buffer
 */
async function generateTextOverlay(text, width, height, options = {}) {
  try {
    const {
      fontSize = 48,
      fontColor = '#FFFFFF',
      backgroundColor = '#000000',
      position = 'center'
    } = options;

    logger.info(`[ImageResizer] Generating text overlay: "${text.substring(0, 50)}..."`);

    // Calculate text positioning
    const textX = position === 'center' ? width / 2 : position === 'bottom' ? width / 2 : width / 2;
    const textY = position === 'center' ? height / 2 : position === 'bottom' ? height - 100 : 100;
    const textAnchor = 'middle';

    // Create SVG with text
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="${backgroundColor}"/>
        <text
          x="${textX}"
          y="${textY}"
          font-size="${fontSize}"
          fill="${fontColor}"
          text-anchor="${textAnchor}"
          font-family="Arial, sans-serif"
          font-weight="bold"
          word-spacing="10"
        >
          ${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .resize(width, height)
      .jpeg({ quality: 90 })
      .toBuffer();

    logger.info(`[ImageResizer] ✓ Text overlay created (${Math.round(buffer.length / 1024)}KB)`);
    return buffer;
  } catch (error) {
    logger.error('[ImageResizer] Error generating text overlay:', error);
    throw error;
  }
}

/**
 * Generate a quote card image
 * Creates a branded image with quote text and author
 * @param {string} quoteText - Quote content
 * @param {string} authorName - Author name
 * @param {string} brandName - Brand name
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Array<string>} gradientColors - [startColor, endColor]
 * @returns {Promise<Buffer>} Image buffer
 */
async function generateQuoteCard(
  quoteText,
  authorName,
  brandName,
  width = 1080,
  height = 1350,
  gradientColors = ['#1a1a2e', '#16213e']
) {
  try {
    logger.info(`[ImageResizer] Generating quote card: "${quoteText.substring(0, 50)}..."`);

    const startColor = gradientColors[0] || '#1a1a2e';
    const endColor = gradientColors[1] || '#16213e';

    // Create SVG with gradient background and text
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${startColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${endColor};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#grad)"/>

        <!-- Quote text -->
        <text
          x="${width / 2}"
          y="${height / 2 - 100}"
          font-size="56"
          fill="#FFFFFF"
          text-anchor="middle"
          font-family="Georgia, serif"
          font-style="italic"
          font-weight="bold"
          word-spacing="10"
        >
          "${quoteText.substring(0, 100).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"
        </text>

        <!-- Author name -->
        <text
          x="${width / 2}"
          y="${height / 2 + 100}"
          font-size="32"
          fill="#FFCD3C"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          font-weight="bold"
        >
          — ${authorName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </text>

        <!-- Brand watermark -->
        <text
          x="${width / 2}"
          y="${height - 50}"
          font-size="24"
          fill="#FFFFFF"
          text-anchor="middle"
          font-family="Arial, sans-serif"
          opacity="0.8"
        >
          ${brandName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .resize(width, height)
      .jpeg({ quality: 90 })
      .toBuffer();

    logger.info(`[ImageResizer] ✓ Quote card created (${Math.round(buffer.length / 1024)}KB)`);
    return buffer;
  } catch (error) {
    logger.error('[ImageResizer] Error generating quote card:', error);
    throw error;
  }
}

/**
 * Composite an image on top of another (e.g., overlay text on image)
 * @param {Buffer} baseBuffer - Base image buffer
 * @param {Buffer} overlayBuffer - Overlay image buffer
 * @param {Object} options - {top, left, opacity}
 * @returns {Promise<Buffer>} Composited image
 */
async function compositeImages(baseBuffer, overlayBuffer, options = {}) {
  try {
    const { top = 0, left = 0, opacity = 1 } = options;

    const composited = await sharp(baseBuffer)
      .composite([
        {
          input: overlayBuffer,
          top,
          left,
          opacity
        }
      ])
      .toBuffer();

    return composited;
  } catch (error) {
    logger.error('[ImageResizer] Error compositing images:', error);
    throw error;
  }
}

module.exports = {
  resizeForPlatform,
  resizeForAllPlatforms,
  generateTextOverlay,
  generateQuoteCard,
  compositeImages,
  getPlatformDimensions,
  getDefaultDimensions
};
