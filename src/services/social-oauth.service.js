/**
 * Social Media OAuth Service
 * Handles OAuth flows for Instagram, Facebook, TikTok, Twitter/X, LinkedIn, and Threads
 */

const logger = require('../utils/logger');

const OAUTH_URLS = {
  instagram: 'https://www.facebook.com/v19.0/dialog/oauth',
  facebook: 'https://www.facebook.com/v19.0/dialog/oauth',
  threads: 'https://www.facebook.com/v19.0/dialog/oauth',
  tiktok: 'https://www.tiktok.com/v2/auth/authorize/',
  twitter: 'https://twitter.com/i/oauth2/authorize',
  linkedin: 'https://www.linkedin.com/oauth/v2/authorization',
};

const SCOPES = {
  instagram: 'pages_manage_posts,instagram_basic,instagram_content_publish,pages_read_engagement,public_profile',
  facebook: 'pages_manage_posts,pages_read_engagement,public_profile',
  threads: 'threads_basic,threads_content_publish,threads_read_replies',
  tiktok: 'user.info.basic,video.publish',
  twitter: 'tweet.read tweet.write users.read like.write follows.write',
  linkedin: 'r_liteprofile w_member_social',
};

/**
 * Get OAuth authorization URL for a platform
 * @param {string} platform - 'instagram', 'facebook', 'threads', 'tiktok', 'twitter', 'linkedin'
 * @param {string} companyId - Company ID for state parameter
 * @param {string} callbackUrl - OAuth redirect URI
 * @returns {string|null} OAuth URL or null if credentials not configured
 */
function getAuthUrl(platform, companyId, callbackUrl) {
  const envMap = {
    instagram: { clientId: 'META_APP_ID', clientSecret: 'META_APP_SECRET' },
    facebook: { clientId: 'META_APP_ID', clientSecret: 'META_APP_SECRET' },
    threads: { clientId: 'META_APP_ID', clientSecret: 'META_APP_SECRET' },
    tiktok: { clientId: 'TIKTOK_CLIENT_KEY', clientSecret: 'TIKTOK_CLIENT_SECRET' },
    twitter: { clientId: 'TWITTER_CLIENT_ID', clientSecret: 'TWITTER_CLIENT_SECRET' },
    linkedin: { clientId: 'LINKEDIN_CLIENT_ID', clientSecret: 'LINKEDIN_CLIENT_SECRET' },
  };

  const env = envMap[platform];
  if (!env) {
    logger.warn(`Unknown platform: ${platform}`);
    return null;
  }

  let clientId = process.env[env.clientId];
  // Fallback: if META_APP_ID env var has wrong value (not all digits), use the correct one
  if (env.clientId === 'META_APP_ID' && clientId && !/^\d+$/.test(clientId)) {
    logger.warn('META_APP_ID env var has invalid value, using fallback');
    clientId = '870030429398072';
  }
  if (!clientId) {
    logger.warn(`Missing credential: ${env.clientId}`);
    return null;
  }

  try {
    switch (platform) {
      case 'instagram':
      case 'facebook':
      case 'threads':
        // Meta uses same OAuth for all platforms
        return buildMetaAuthUrl(clientId, callbackUrl, companyId);

      case 'tiktok':
        return buildTikTokAuthUrl(clientId, callbackUrl, companyId);

      case 'twitter':
        return buildTwitterAuthUrl(clientId, callbackUrl, companyId);

      case 'linkedin':
        return buildLinkedInAuthUrl(clientId, callbackUrl, companyId);

      default:
        return null;
    }
  } catch (error) {
    logger.error(`Error building auth URL for ${platform}:`, error.message);
    return null;
  }
}

function buildMetaAuthUrl(clientId, redirectUri, companyId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.instagram, // Meta handles all three
    state: companyId,
    response_type: 'code',
    auth_type: 'rerequest',
  });
  return `${OAUTH_URLS.instagram}?${params.toString()}`;
}

function buildTikTokAuthUrl(clientKey, redirectUri, companyId) {
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPES.tiktok,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: companyId,
  });
  return `${OAUTH_URLS.tiktok}?${params.toString()}`;
}

function buildTwitterAuthUrl(clientId, redirectUri, companyId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.twitter,
    state: companyId,
    code_challenge: 'challenge',
    code_challenge_method: 'plain',
  });
  return `${OAUTH_URLS.twitter}?${params.toString()}`;
}

function buildLinkedInAuthUrl(clientId, redirectUri, companyId) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.linkedin,
    state: companyId,
  });
  return `${OAUTH_URLS.linkedin}?${params.toString()}`;
}

/**
 * Handle OAuth callback and exchange code for access token
 * @param {string} platform
 * @param {string} code - Authorization code from OAuth provider
 * @param {string} companyId
 * @returns {Promise<object>} Token and account info
 */
async function handleCallback(platform, code, companyId) {
  if (!code) {
    throw new Error('No authorization code provided');
  }

  try {
    let tokenData;

    switch (platform) {
      case 'instagram':
      case 'facebook':
      case 'threads':
        tokenData = await exchangeMetaCode(code);
        break;

      case 'tiktok':
        tokenData = await exchangeTikTokCode(code);
        break;

      case 'twitter':
        tokenData = await exchangeTwitterCode(code);
        break;

      case 'linkedin':
        tokenData = await exchangeLinkedInCode(code);
        break;

      default:
        throw new Error(`Unknown platform: ${platform}`);
    }

    return {
      platform,
      company_id: companyId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: tokenData.expires_at || new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days default
      account_name: tokenData.account_name || null,
      account_id: tokenData.account_id || null,
      connected_at: new Date().toISOString(),
    };
  } catch (error) {
    logger.error(`OAuth callback error for ${platform}:`, error.message);
    throw error;
  }
}

async function exchangeMetaCode(code) {
  // In production, this would call Meta's token endpoint
  // For now, return mock data
  logger.info('Meta OAuth code received (mock implementation)');
  return {
    access_token: `meta_token_${Date.now()}`,
    account_name: '@rawfunds',
    account_id: 'meta_' + Date.now(),
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function exchangeTikTokCode(code) {
  logger.info('TikTok OAuth code received (mock implementation)');
  return {
    access_token: `tiktok_token_${Date.now()}`,
    account_name: 'tiktok_user',
    account_id: 'tiktok_' + Date.now(),
  };
}

async function exchangeTwitterCode(code) {
  logger.info('Twitter OAuth code received (mock implementation)');
  return {
    access_token: `twitter_token_${Date.now()}`,
    account_name: '@rawfunds_twitter',
    account_id: 'twitter_' + Date.now(),
  };
}

async function exchangeLinkedInCode(code) {
  logger.info('LinkedIn OAuth code received (mock implementation)');
  return {
    access_token: `linkedin_token_${Date.now()}`,
    account_name: 'Rawfunds LinkedIn',
    account_id: 'linkedin_' + Date.now(),
  };
}

/**
 * Refresh an expired token
 * @param {string} platform
 * @param {string} refreshToken
 * @returns {Promise<object>} New token data
 */
async function refreshToken(platform, refreshToken) {
  if (!refreshToken) {
    throw new Error('No refresh token available for this platform');
  }

  try {
    // In production, call platform's refresh endpoint
    logger.info(`Refreshing token for ${platform}`);

    return {
      access_token: `${platform}_token_${Date.now()}`,
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  } catch (error) {
    logger.error(`Token refresh failed for ${platform}:`, error.message);
    throw error;
  }
}

/**
 * Revoke/disconnect a platform integration
 * @param {string} platform
 * @param {string} accessToken
 */
async function revokeToken(platform, accessToken) {
  try {
    logger.info(`Revoking token for ${platform}`);
    // In production, call platform's revoke endpoint
    // For now, just log it
    return { success: true };
  } catch (error) {
    logger.error(`Token revocation failed for ${platform}:`, error.message);
    throw error;
  }
}

/**
 * Check if platform is configured with credentials
 * @param {string} platform
 * @returns {boolean}
 */
function isPlatformConfigured(platform) {
  const envMap = {
    instagram: 'META_APP_ID',
    facebook: 'META_APP_ID',
    threads: 'META_APP_ID',
    tiktok: 'TIKTOK_CLIENT_KEY',
    twitter: 'TWITTER_CLIENT_ID',
    linkedin: 'LINKEDIN_CLIENT_ID',
  };

  const envVar = envMap[platform];
  if (!envVar) return false;
  // For Meta platforms, always return true if any META env var exists (even with wrong value, we have fallback)
  if (['instagram', 'facebook', 'threads'].includes(platform)) {
    return !!process.env.META_APP_ID || !!process.env.META_APP_SECRET;
  }
  return !!process.env[envVar];
}

module.exports = {
  getAuthUrl,
  handleCallback,
  refreshToken,
  revokeToken,
  isPlatformConfigured,
  SCOPES,
};
