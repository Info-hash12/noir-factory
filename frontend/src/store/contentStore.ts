import { create } from 'zustand';
import type { ContentItem, ContentJob, Feed } from '../types';
import * as api from '../lib/api';

interface ContentState {
  // Content Items
  contentItems: ContentItem[];
  currentItemIndex: number;
  loadingItems: boolean;
  itemsError: string | null;
  fetchContentItems: (feedId?: string) => Promise<void>;
  nextContentItem: () => void;
  previousContentItem: () => void;
  rejectCurrentItem: () => Promise<void>;

  // Content Jobs
  jobs: ContentJob[];
  loadingJobs: boolean;
  jobsError: string | null;
  fetchContentJobs: () => Promise<void>;
  createContentJob: (jobData: unknown) => Promise<ContentJob>;

  // Feeds
  feeds: Feed[];
  loadingFeeds: boolean;
  feedsError: string | null;
  fetchFeeds: () => Promise<void>;
  addFeed: (feedData: unknown) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;

  // Filter
  selectedFeedId: string | null;
  setSelectedFeedId: (feedId: string | null) => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
  contentItems: [],
  currentItemIndex: 0,
  loadingItems: false,
  itemsError: null,

  fetchContentItems: async (feedId?: string) => {
    set({ loadingItems: true });
    try {
      const items = await api.getContentItems(feedId);
      set({ contentItems: items, currentItemIndex: 0, loadingItems: false });
    } catch (error) {
      set({
        itemsError: error instanceof Error ? error.message : 'Failed to fetch content',
        loadingItems: false,
      });
    }
  },

  nextContentItem: () => {
    const state = get();
    if (state.currentItemIndex < state.contentItems.length - 1) {
      set({ currentItemIndex: state.currentItemIndex + 1 });
    }
  },

  previousContentItem: () => {
    const state = get();
    if (state.currentItemIndex > 0) {
      set({ currentItemIndex: state.currentItemIndex - 1 });
    }
  },

  rejectCurrentItem: async () => {
    const state = get();
    const item = state.contentItems[state.currentItemIndex];
    if (!item) return;

    try {
      await api.rejectContentItem(item.id);
      // Remove from list and move to next
      const newItems = state.contentItems.filter((_, i) => i !== state.currentItemIndex);
      set({
        contentItems: newItems,
        currentItemIndex: Math.min(state.currentItemIndex, newItems.length - 1),
      });
    } catch (error) {
      console.error('Failed to reject item:', error);
    }
  },

  jobs: [],
  loadingJobs: false,
  jobsError: null,

  fetchContentJobs: async () => {
    set({ loadingJobs: true });
    try {
      const jobs = await api.getContentJobs();
      set({ jobs, loadingJobs: false });
    } catch (error) {
      set({
        jobsError: error instanceof Error ? error.message : 'Failed to fetch jobs',
        loadingJobs: false,
      });
    }
  },

  createContentJob: async (jobData) => {
    try {
      const job = await api.createContentJob(jobData as any);
      set((state) => ({ jobs: [...state.jobs, job] }));
      return job;
    } catch (error) {
      throw error;
    }
  },

  feeds: [],
  loadingFeeds: false,
  feedsError: null,

  fetchFeeds: async () => {
    set({ loadingFeeds: true });
    try {
      const feeds = await api.getFeeds();
      set({ feeds, loadingFeeds: false });
    } catch (error) {
      set({
        feedsError: error instanceof Error ? error.message : 'Failed to fetch feeds',
        loadingFeeds: false,
      });
    }
  },

  addFeed: async (feedData) => {
    try {
      const feed = await api.createFeed(feedData as any);
      set((state) => ({ feeds: [...state.feeds, feed] }));
    } catch (error) {
      throw error;
    }
  },

  removeFeed: async (feedId) => {
    try {
      await api.deleteFeed(feedId);
      set((state) => ({ feeds: state.feeds.filter((f) => f.id !== feedId) }));
    } catch (error) {
      throw error;
    }
  },

  selectedFeedId: null,
  setSelectedFeedId: (feedId) => {
    set({ selectedFeedId: feedId });
  },
}));
