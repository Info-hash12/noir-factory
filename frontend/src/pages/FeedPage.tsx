import { useEffect, useState } from 'react';
import { useContentStore } from '../store/contentStore';
import { SwipeCard } from '../components/SwipeCard';
import { ChevronDown, RefreshCw } from 'lucide-react';

export function FeedPage() {
  const {
    contentItems,
    currentItemIndex,
    loadingItems,
    fetchContentItems,
    nextContentItem,
    rejectCurrentItem,
    feeds,
    selectedFeedId,
    setSelectedFeedId,
    fetchFeeds,
  } = useContentStore();

  const [isApproving, setIsApproving] = useState(false);
  const [showFeedFilter, setShowFeedFilter] = useState(false);

  useEffect(() => {
    fetchFeeds();
    fetchContentItems(selectedFeedId || undefined);
  }, [selectedFeedId]);

  const handleApprove = () => {
    setIsApproving(true);
    // Navigate to bottom sheet for job creation
    setTimeout(() => {
      nextContentItem();
      setIsApproving(false);
    }, 300);
  };

  const handleReject = async () => {
    await rejectCurrentItem();
  };

  const handleRefresh = () => {
    fetchContentItems(selectedFeedId || undefined);
  };

  const currentItem = contentItems[currentItemIndex] || null;

  return (
    <div className="p-4 space-y-4">
      {/* Feed Filter */}
      <div className="relative">
        <button
          onClick={() => setShowFeedFilter(!showFeedFilter)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-900 border border-gray-800 rounded-lg hover:bg-gray-800 transition-colors min-h-[44px]"
        >
          <span className="text-sm font-medium">
            {selectedFeedId
              ? feeds.find((f) => f.id === selectedFeedId)?.name || 'Filter'
              : 'All Feeds'}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              showFeedFilter ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showFeedFilter && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50">
            <button
              onClick={() => {
                setSelectedFeedId(null);
                setShowFeedFilter(false);
              }}
              className={`w-full text-left px-4 py-3 text-sm border-b border-gray-800 transition-colors min-h-[44px] ${
                !selectedFeedId ? 'bg-blue-500 bg-opacity-20 text-blue-400' : 'hover:bg-gray-800'
              }`}
            >
              All Feeds
            </button>
            {feeds.map((feed) => (
              <button
                key={feed.id}
                onClick={() => {
                  setSelectedFeedId(feed.id);
                  setShowFeedFilter(false);
                }}
                className={`w-full text-left px-4 py-3 text-sm border-b border-gray-800 last:border-b-0 transition-colors min-h-[44px] ${
                  selectedFeedId === feed.id
                    ? 'bg-blue-500 bg-opacity-20 text-blue-400'
                    : 'hover:bg-gray-800'
                }`}
              >
                {feed.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pull to refresh */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-500 py-2">
        <RefreshCw className="w-4 h-4" />
        Pull down to refresh
      </div>

      {/* Swipe Card */}
      <SwipeCard
        item={currentItem}
        onApprove={handleApprove}
        onReject={handleReject}
        onRefresh={handleRefresh}
        isLoading={loadingItems || isApproving}
      />

      {/* Counter */}
      {contentItems.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          {currentItemIndex + 1} / {contentItems.length}
        </div>
      )}

      {/* Bottom spacer for safe area */}
      <div className="h-4" />
    </div>
  );
}
