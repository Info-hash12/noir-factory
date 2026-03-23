const AUTH_TOKEN = 'noirfactory2026';

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

function getCompanyId(): string {
  return localStorage.getItem('noir_company_id') || '';
}

export async function apiCall(
  endpoint: string,
  options: ApiOptions = {}
) {
  const companyId = getCompanyId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Auth-Token': AUTH_TOKEN,
    ...options.headers,
  };

  if (companyId) {
    headers['X-Company-ID'] = companyId;
  }

  const response = await fetch(`${window.location.origin}/api${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}

// Content Items
export function getContentItems(feedId?: string) {
  const url = feedId ? `/content-items?feed_id=${feedId}` : '/content-items';
  return apiCall(url);
}

export function rejectContentItem(itemId: string) {
  return apiCall(`/content-items/${itemId}/reject`, { method: 'POST' });
}

// Content Jobs
export function getContentJobs() {
  return apiCall('/content-jobs');
}

export function createContentJob(jobData: {
  content_item_id: string;
  job_type: string;
  target_platforms: string[];
  first_comment?: string;
  avatar_name?: string;
  caption_text?: string;
  hashtags_text?: string;
  hook_text?: string;
  on_screen_text?: string;
  layout_type?: string;
  is_evergreen?: boolean;
  evergreen_interval_days?: number;
}) {
  // Map to camelCase for live backend compatibility
  const payload = {
    contentItemId: jobData.content_item_id,
    type: jobData.job_type,
    platforms: jobData.target_platforms,
    firstComment: jobData.first_comment || '',
    avatar_name: jobData.avatar_name,
    caption_text: jobData.caption_text,
    hashtags_text: jobData.hashtags_text,
    hook_text: jobData.hook_text,
    on_screen_text: jobData.on_screen_text,
    layout_type: jobData.layout_type,
    is_evergreen: jobData.is_evergreen,
    evergreen_interval_days: jobData.evergreen_interval_days,
  };
  return apiCall('/content-jobs', { method: 'POST', body: jobData });
}

// Avatars
export function getAvatars() {
  return apiCall('/avatars');
}

export function getContentJob(jobId: string) {
  return apiCall(`/content-jobs/${jobId}`);
}

export function updateContentJob(jobId: string, updates: Record<string, unknown>) {
  return apiCall(`/content-jobs/${jobId}`, {
    method: 'PATCH',
    body: updates,
  });
}

export function deleteContentJob(jobId: string) {
  return apiCall(`/content-jobs/${jobId}`, { method: 'DELETE' });
}

export function retryContentJob(jobId: string) {
  return apiCall(`/content-jobs/${jobId}/retry`, { method: 'POST' });
}

export function reorderContentJobs(jobIds: string[]) {
  return apiCall('/content-jobs/reorder', {
    method: 'POST',
    body: { job_ids: jobIds },
  });
}

// Feeds
export function getFeeds() {
  return apiCall('/feeds');
}

export function createFeed(feedData: { name: string; url: string; type: string }) {
  return apiCall('/feeds', {
    method: 'POST',
    body: feedData,
  });
}

export function deleteFeed(feedId: string) {
  return apiCall(`/feeds/${feedId}`, { method: 'DELETE' });
}

// Companies
export function getCompanies() {
  return apiCall('/companies');
}

export function getCurrentCompany(companyId: string) {
  return apiCall(`/companies/${companyId}`);
}

// Company Prompts
export function getCompanyPrompts(companyId: string) {
  return apiCall(`/companies/${companyId}/prompts`);
}

export function updateCompanyPrompts(companyId: string, prompts: Record<string, unknown>) {
  return apiCall(`/companies/${companyId}/prompts`, {
    method: 'PUT',
    body: prompts,
  });
}

// Engagement
export function getEngagementStatus() {
  return apiCall('/engagement/status');
}

export function updateEngagementStatus(enabled: boolean) {
  return apiCall('/engagement/status', {
    method: 'PUT',
    body: { enabled },
  });
}

export function getEngagementHashtags() {
  return apiCall('/engagement/hashtags');
}

export function updateEngagementHashtags(hashtags: string[]) {
  return apiCall('/engagement/hashtags', {
    method: 'PUT',
    body: { hashtags },
  });
}

export function getEngagementTemplates() {
  return apiCall('/engagement/templates');
}

export function createEngagementTemplate(template: { name: string; content: string }) {
  return apiCall('/engagement/templates', {
    method: 'POST',
    body: template,
  });
}

export function deleteEngagementTemplate(templateId: string) {
  return apiCall(`/engagement/templates/${templateId}`, { method: 'DELETE' });
}

export function getEngagementActivities() {
  return apiCall('/engagement/activities');
}

// Engagement Stats (detailed)
export function getEngagementStatsDetailed(params?: { period?: string; company_id?: string; platform?: string }) {
  const q = new URLSearchParams();
  if (params?.period) q.set('period', params.period);
  if (params?.company_id) q.set('company_id', params.company_id);
  if (params?.platform) q.set('platform', params.platform);
  const qs = q.toString();
  return apiCall(`/engagement/stats/detailed${qs ? '?' + qs : ''}`);
}

// Content Item Capture
export function captureUrl(url: string) {
  return apiCall('/content-items/capture', {
    method: 'POST',
    body: { url }
  });
}

// User
export function getCurrentUser() {
  return apiCall('/auth/me');
}

// Trending
export function getTrending(platform?: string) {
  const url = platform ? `/trending?platform=${platform}` : '/trending';
  return apiCall(url);
}

export function searchTrending(query: string) {
  return apiCall(`/trending?q=${encodeURIComponent(query)}`);
}

export function saveTrendingItem(item: {
  item_id?: string;
  title: string;
  excerpt: string;
  url: string;
  source: string;
  platform: string;
  image_url?: string;
}) {
  return apiCall('/trending/save', { method: 'POST', body: item });
}

export function getSavedTrending() {
  return apiCall('/trending/saved');
}

export function saveSearch(query: string) {
  return apiCall('/trending/save-search', {
    method: 'POST',
    body: { query }
  });
}

export function getSavedSearches() {
  return apiCall('/trending/saved-searches');
}

export function deleteSearch(id: string) {
  return apiCall(`/trending/saved-searches/${id}`, {
    method: 'DELETE'
  });
}

// Text Generation
export function generateText(promptType: string, context: string) {
  return apiCall('/content-jobs/generate-text', {
    method: 'POST',
    body: { prompt_type: promptType, context }
  });
}

// Social Media OAuth Connections
export function getConnectionStatus() {
  return apiCall('/connect/status');
}

export function connectPlatform(platform: string) {
  return apiCall(`/connect/${platform}`);
}

export function disconnectPlatform(platform: string) {
  return apiCall(`/connect/${platform}`, { method: 'DELETE' });
}
