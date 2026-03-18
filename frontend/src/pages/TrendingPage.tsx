import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, AlertCircle, Loader, Bookmark } from 'lucide-react';
import * as api from '../lib/api';
import type { TrendingItem } from '../types';

type Platform = 'all' | 'reddit' | 'twitter' | 'tiktok' | 'instagram';

const PLATFORM_COLORS = {
  reddit: { bg: 'bg-red-500/10', icon: 'text-red-500', border: 'border-red-500/30' },
  twitter: { bg: 'bg-sky-500/10', icon: 'text-sky-500', border: 'border-sky-500/30' },
  tiktok: { bg: 'bg-black/10', icon: 'text-white/80', border: 'border-white/30' },
  instagram: { bg: 'bg-pink-500/10', icon: 'text-pink-500', border: 'border-pink-500/30' },
};

const PLATFORM_LABELS = {
  reddit: 'Reddit',
  twitter: 'X/Twitter',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export function TrendingPage() {
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('all');
  const [capturingId, setCapturingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTrending();
  }, [selectedPlatform]);

  const fetchTrending = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getTrending(selectedPlatform === 'all' ? undefined : selectedPlatform);
      setTrendingItems(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trending topics');
      setTrendingItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCapture = async (item: TrendingItem) => {
    setCapturingId(item.id);
    try {
      // For now, just show a success message
      // Later, this will create a content item from the trending topic
      console.log('Capturing trend:', item);
      // Simulate a small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error('Failed to capture trend:', err);
    } finally {
      setCapturingId(null);
    }
  };

  const timeAgoFormatter = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const hours = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading && trendingItems.length === 0) {
    return (
      <div className="min-h-screen bg-noir-bg flex items-center justify-center px-4">
        <div className="text-center">
          <motion.div
            className="w-12 h-12 rounded-full border-4 border-noir-border border-t-accent-primary mx-auto mb-4"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-text-secondary">Loading trending topics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-noir-bg flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-noir-surface border border-noir-border flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-accent-danger" />
          </div>
          <p className="text-text-secondary">{error}</p>
          <motion.button
            onClick={fetchTrending}
            className="px-6 py-2 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-lg font-semibold transition-all duration-200 min-h-[44px]"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Try Again
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-noir-bg">
      {/* Header */}
      <div className="sticky top-20 z-20 bg-noir-bg/95 backdrop-blur-sm border-b border-noir-border px-4 py-4">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-accent-primary" />
            <h1 className="text-lg font-black text-text-primary">Trending Topics</h1>
          </div>
          <p className="text-xs text-text-muted">
            Real-time trending content from social media platforms. Click capture to add to your queue.
          </p>
        </div>

        {/* Platform Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(['all', 'reddit', 'twitter', 'tiktok', 'instagram'] as Platform[]).map((platform) => (
            <motion.button
              key={platform}
              onClick={() => setSelectedPlatform(platform)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap transition-all duration-200 min-h-[44px] ${
                selectedPlatform === platform
                  ? 'bg-accent-primary text-noir-bg shadow-lg shadow-accent-primary/30'
                  : 'bg-noir-surface border border-noir-border text-text-secondary hover:border-accent-primary/50'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {platform === 'all' ? 'All' : PLATFORM_LABELS[platform as keyof typeof PLATFORM_LABELS]}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        {trendingItems.length === 0 ? (
          <div className="text-center space-y-4 py-12">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-noir-surface border border-noir-border flex items-center justify-center">
              <Flame className="w-8 h-8 text-text-muted" />
            </div>
            <p className="text-text-secondary">No trending topics found</p>
            <p className="text-text-muted text-sm">Connect your social accounts in Settings to see trending topics</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trendingItems.map((item, index) => {
              const platformColor =
                PLATFORM_COLORS[item.platform as keyof typeof PLATFORM_COLORS] ||
                PLATFORM_COLORS.reddit;

              // Calculate trend volume percentage (0-100)
              const maxVolume = Math.max(...trendingItems.map(i => i.volume));
              const volumePercent = (item.volume / maxVolume) * 100;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`bg-noir-surface border rounded-2xl overflow-hidden transition-all duration-200 ${platformColor.border}`}
                >
                  {/* Main Content */}
                  <div className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start gap-3">
                      <div className={`${platformColor.bg} rounded-lg p-2.5 flex-shrink-0 border ${platformColor.border}`}>
                        <div className={`w-5 h-5 flex items-center justify-center text-sm font-black ${platformColor.icon}`}>
                          {item.platform === 'reddit' && 'R'}
                          {item.platform === 'twitter' && 'X'}
                          {item.platform === 'tiktok' && '♪'}
                          {item.platform === 'instagram' && '📷'}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="text-sm font-black text-text-primary">
                              {item.hashtag ? item.hashtag : item.topic}
                            </p>
                            <p className="text-xs text-text-muted mt-0.5">
                              {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS]} • {timeAgoFormatter(item.timestamp)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Capture Button */}
                      <motion.button
                        onClick={() => handleCapture(item)}
                        disabled={capturingId === item.id}
                        className="flex-shrink-0 px-3 py-2 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center gap-2 text-sm"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {capturingId === item.id ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin" />
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-4 h-4" />
                            Capture
                          </>
                        )}
                      </motion.button>
                    </div>

                    {/* Trend Metrics */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-muted uppercase tracking-wider">Trend Score</span>
                        <span className="text-sm font-bold text-accent-primary">{item.score.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-noir-bg rounded-full h-2 overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-accent-primary to-accent-primary/60 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${volumePercent}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-text-muted">Volume</span>
                        <span className="text-xs font-semibold text-text-secondary">{item.volume.toLocaleString()} posts</span>
                      </div>
                    </div>
                  </div>

                  {/* Platform Badge */}
                  <div className={`px-4 py-2 ${platformColor.bg} border-t ${platformColor.border} flex items-center justify-between`}>
                    <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">
                      {PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS]}
                    </span>
                    <span className={`text-xs font-black ${platformColor.icon}`}>
                      {((item.volume / maxVolume) * 100).toFixed(0)}% engagement
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
