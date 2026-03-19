import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, AlertCircle, Loader, Zap, Share2, Search, Bookmark, X } from 'lucide-react';
import * as api from '../lib/api';
import { useCompanyStore } from '../store/companyStore';
import type { TrendingItem } from '../types';

const PLATFORM_COLORS = {
  reddit: { bg: 'bg-red-500/10', icon: 'text-red-500', border: 'border-red-500/30' },
  twitter: { bg: 'bg-sky-500/10', icon: 'text-sky-500', border: 'border-sky-500/30' },
  tiktok: { bg: 'bg-black/10', icon: 'text-white/80', border: 'border-white/30' },
  instagram: { bg: 'bg-pink-500/10', icon: 'text-pink-500', border: 'border-pink-500/30' },
  news: { bg: 'bg-purple-500/10', icon: 'text-purple-500', border: 'border-purple-500/30' },
};

const PLATFORM_LABELS = {
  reddit: 'Reddit',
  twitter: 'X/Twitter',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  news: 'News',
};

// Keywords by company
const COMPANY_KEYWORDS: Record<string, string[]> = {
  'RawFunds': ['real estate', 'AITA', 'personal finance', 'side hustle', 'investing'],
  'Proxitap': ['airport wifi', 'travel security', 'data privacy', 'VPN', 'cybersecurity'],
};

export function TrendingPage() {
  const { currentCompany } = useCompanyStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [trendingItems, setTrendingItems] = useState<TrendingItem[]>([]);
  const [savedItems, setSavedItems] = useState<TrendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Get keywords for current company
  const suggestedKeywords = currentCompany
    ? COMPANY_KEYWORDS[currentCompany.name] || ['trending', 'news', 'tech']
    : ['trending', 'news', 'tech'];

  useEffect(() => {
    // Load saved items on mount
    fetchSavedItems();
  }, []);

  const fetchSavedItems = async () => {
    try {
      const response = await api.getSavedTrending();
      setSavedItems(response.data || []);
      const ids = new Set((response.data || []).map((item: any) => item.id));
      setSavedIds(ids);
    } catch (err) {
      console.error('Failed to fetch saved items:', err);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setTrendingItems([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.searchTrending(query);
      setTrendingItems(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search trending topics');
      setTrendingItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (item: TrendingItem) => {
    setSavingId(item.id);
    try {
      await api.saveTrendingItem({
        item_id: item.id,
        title: item.title || '',
        excerpt: (item as any).excerpt || '',
        url: item.url || '',
        source: item.source || '',
        platform: item.platform || 'news',
        image_url: item.image_url
      });

      setSavedIds(new Set([...savedIds, item.id]));
      await fetchSavedItems();
    } catch (err) {
      console.error('Failed to save item:', err);
    } finally {
      setSavingId(null);
    }
  };

  const handleRemoveSaved = (itemId: string) => {
    setSavedItems(savedItems.filter(item => item.id !== itemId));
    setSavedIds(new Set(Array.from(savedIds).filter(id => id !== itemId)));
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

  // Content Card Component
  const ContentCard = ({ item, isSaved = false, onRemove }: { item: TrendingItem; isSaved?: boolean; onRemove?: () => void }) => {
    const platformColor = PLATFORM_COLORS[item.platform as keyof typeof PLATFORM_COLORS] || PLATFORM_COLORS.news;
    const isBeingSaved = savingId === item.id;
    const isSavedAlready = savedIds.has(item.id);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-noir-surface border border-noir-border rounded-2xl overflow-hidden hover:border-accent-primary/50 transition-all duration-200 flex flex-col h-full"
      >
        {/* Image */}
        <div className="aspect-video bg-noir-bg relative overflow-hidden">
          {item.image_url ? (
            <motion.img
              src={item.image_url}
              alt={item.title || 'Trending'}
              className="w-full h-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
              }}
            />
          ) : null}
          <div className={`absolute inset-0 ${item.image_url ? 'hidden' : ''} ${platformColor.bg} flex items-center justify-center border-b ${platformColor.border}`}>
            <div className={`text-4xl ${platformColor.icon}`}>
              {item.platform === 'reddit' && 'R'}
              {item.platform === 'twitter' && 'X'}
              {item.platform === 'tiktok' && '♪'}
              {item.platform === 'instagram' && '📷'}
              {item.platform === 'news' && '📰'}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          {/* Source and Date */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`text-xs font-black px-2 py-1 rounded ${platformColor.bg} border ${platformColor.border}`}>
                {item.source || PLATFORM_LABELS[item.platform as keyof typeof PLATFORM_LABELS]}
              </div>
              <span className="text-xs text-text-muted">{timeAgoFormatter(item.timestamp)}</span>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-sm font-black text-text-primary mb-2 line-clamp-2">
            {item.title || item.hashtag}
          </h3>

          {/* Excerpt */}
          <p className="text-xs text-text-secondary mb-4 flex-1 line-clamp-3">
            {(item as any).excerpt || `${item.volume?.toLocaleString()} posts • ${item.score?.toLocaleString()} engagement`}
          </p>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4 border-t border-noir-border">
            {isSaved ? (
              <>
                <motion.button
                  onClick={onRemove}
                  className="flex-1 px-3 py-2.5 bg-noir-bg hover:bg-noir-border text-text-primary rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 text-xs min-h-[40px]"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X className="w-3 h-3" />
                  <span>Remove</span>
                </motion.button>
                <motion.button
                  className="flex-1 px-3 py-2.5 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 text-xs min-h-[40px]"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Zap className="w-3 h-3" />
                  <span>Generate</span>
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  onClick={() => handleSave(item)}
                  disabled={isBeingSaved || isSavedAlready}
                  className={`flex-1 px-3 py-2.5 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 text-xs min-h-[40px] ${
                    isSavedAlready
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-noir-bg hover:bg-noir-border text-text-primary'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isBeingSaved ? (
                    <>
                      <Loader className="w-3 h-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : isSavedAlready ? (
                    <>
                      <Bookmark className="w-3 h-3" />
                      <span>Saved</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3 h-3" />
                      <span>Save</span>
                    </>
                  )}
                </motion.button>
                <motion.button
                  onClick={() => console.log('Quick post:', item)}
                  className="flex-1 px-3 py-2.5 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 text-xs min-h-[40px]"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Zap className="w-3 h-3" />
                  <span>Quick Post</span>
                </motion.button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-noir-bg pb-24">
      {/* Header with Search */}
      <div className="sticky top-20 z-20 bg-noir-bg/95 backdrop-blur-sm border-b border-noir-border px-4 py-4">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-accent-primary" />
            <h1 className="text-lg font-black text-text-primary">Explore</h1>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search trending topics... (e.g., airport wifi, real estate investing)"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-noir-surface border border-noir-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 transition-colors"
            />
          </div>

          {/* Keyword Suggestions */}
          {!searchQuery && (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {suggestedKeywords.map((keyword) => (
                <motion.button
                  key={keyword}
                  onClick={() => handleSearch(keyword)}
                  className="px-3 py-1.5 bg-noir-surface border border-noir-border rounded-lg text-xs font-semibold text-text-secondary hover:border-accent-primary/50 whitespace-nowrap transition-all min-h-[36px]"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {keyword}
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4">
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-accent-danger flex-shrink-0" />
            <span className="text-sm text-accent-danger">{error}</span>
          </motion.div>
        )}

        {/* Search Results */}
        <AnimatePresence>
          {searchQuery && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : trendingItems.length === 0 ? (
                <div className="text-center space-y-4 py-12">
                  <Search className="w-12 h-12 mx-auto text-text-muted opacity-50" />
                  <p className="text-text-secondary">No results found for "{searchQuery}"</p>
                  <p className="text-text-muted text-sm">Try a different search term</p>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <p className="text-text-muted text-sm mb-4">
                      Found {trendingItems.length} result{trendingItems.length !== 1 ? 's' : ''} for "{searchQuery}"
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {trendingItems.map((item) => (
                        <ContentCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Saved Content Section */}
        {savedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8"
          >
            <div className="flex items-center gap-2 mb-4">
              <Bookmark className="w-5 h-5 text-accent-primary" />
              <h2 className="text-lg font-black text-text-primary">Saved Content</h2>
              <span className="text-xs text-text-muted ml-auto">({savedItems.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedItems.map((item) => (
                <ContentCard
                  key={item.id}
                  item={item}
                  isSaved={true}
                  onRemove={() => handleRemoveSaved(item.id)}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty State */}
        {!searchQuery && savedItems.length === 0 && (
          <div className="text-center space-y-4 py-12">
            <Flame className="w-12 h-12 mx-auto text-text-muted opacity-50" />
            <p className="text-text-secondary">Start searching to discover trending topics</p>
            <p className="text-text-muted text-sm">Use the keywords above or search for your own interests</p>
          </div>
        )}
      </div>
    </div>
  );
}
