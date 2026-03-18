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
}) {
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

export function retryContentJob(jobId: string) {
  return apiCall(`/content-jobs/${jobId}/retry`, { method: 'POST' });
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

// User
export function getCurrentUser() {
  return apiCall('/auth/me');
}
