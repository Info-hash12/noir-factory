export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
}

export interface ContentItem {
  id: string;
  title: string;
  excerpt: string;
  source_url?: string;
  source_image?: string;
  feed_id: string;
  feed_name: string;
  published_at: string;
  created_at: string;
}

export interface Feed {
  id: string;
  name: string;
  url: string;
  type: 'reddit' | 'twitter' | 'rss';
  created_at: string;
}

export interface ContentJob {
  id: string;
  content_item_id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'published';
  job_type: 'video_with_avatar' | 'static_post' | 'carousel' | 'story';
  target_platforms: string[];
  first_comment?: string;
  avatar_id?: string;
  created_at: string;
  updated_at: string;
  error_message?: string;
  generation_cost_estimate?: number;
  caption_text?: string;
  hashtags_text?: string;
  hook_text?: string;
  on_screen_text?: string;
  layout_type?: string;
  is_evergreen?: boolean;
  evergreen_interval_days?: number;
  queue_priority?: number;
}

export interface EngagementTemplate {
  id: string;
  name: string;
  content: string;
  created_at: string;
}

export interface EngagementActivity {
  id: string;
  type: 'like' | 'comment' | 'follow';
  platform: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface CompanyPrompts {
  id: string;
  script_generation?: string;
  hook?: string;
  hashtags?: string;
  caption?: string;
  first_comment?: string;
}

export interface TrendingItem {
  id: string;
  platform: 'reddit' | 'twitter' | 'tiktok' | 'instagram';
  topic: string;
  hashtag?: string;
  score: number;
  volume: number;
  timestamp: string;
}

export interface TrendingItemWithTime extends TrendingItem {
  timeStarted: string;
}
