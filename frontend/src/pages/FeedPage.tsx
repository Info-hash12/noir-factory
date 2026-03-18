import { useEffect, useState, useRef } from 'react';
import { useContentStore } from '../store/contentStore';
import { SwipeCard } from '../components/SwipeCard';
import { ApproveBottomSheet } from '../components/ApproveBottomSheet';
import { CaptureBottomSheet } from '../components/CaptureBottomSheet';
import { QuickPostBottomSheet } from '../components/QuickPostBottomSheet';
import { motion } from 'framer-motion';
import type { ContentItem } from '../types';

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

  const [showApproveSheet, setShowApproveSheet] = useState(false);
  const [showCaptureSheet, setShowCaptureSheet] = useState(false);
  const [showQuickPostSheet, setShowQuickPostSheet] = useState(false);
  const [scrollContainerRef] = useState(useRef<HTMLDivElement>(null));

  useEffect(() => {
    fetchFeeds();
    fetchContentItems(selectedFeedId || undefined);
  }, [selectedFeedId]);

  const handleApprove = () => {
    setShowApproveSheet(true);
  };

  const handleReject = async () => {
    await rejectCurrentItem();
  };

  const handleRefresh = () => {
    fetchContentItems(selectedFeedId || undefined);
  };

  const handleApproveComplete = async () => {
    setShowApproveSheet(false);
    await nextContentItem();
  };

  const handleCaptured = () => {
    // Refresh the feed to show the newly captured item
    fetchContentItems(selectedFeedId || undefined);
  };

  const handlePosted = () => {
    // Optionally refresh the queue to show the new job
    // For now, just close and notify
  };

  const currentItem = contentItems[currentItemIndex] || null;

  return (
    <div className="min-h-screen bg-noir-bg flex flex-col">
      {/* Filter Pills - Horizontal Scroll */}
      <div className="sticky top-20 z-20 bg-noir-bg/95 backdrop-blur-sm border-b border-noir-border px-4 pt-4 pb-3">
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto scrollbar-hide"
        >
          {/* All Feeds button */}
          <motion.button
            onClick={() => setSelectedFeedId(null)}
            className={`flex-shrink-0 px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 min-h-[44px] whitespace-nowrap border ${
              !selectedFeedId
                ? 'bg-accent-primary text-noir-bg border-accent-primary shadow-lg shadow-accent-primary/30'
                : 'border-noir-border text-text-secondary hover:text-text-primary hover:border-accent-primary/50'
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            All Feeds
          </motion.button>

          {/* Individual feed pills */}
          {feeds.map((feed) => (
            <motion.button
              key={feed.id}
              onClick={() => setSelectedFeedId(feed.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 min-h-[44px] whitespace-nowrap border ${
                selectedFeedId === feed.id
                  ? 'bg-accent-primary text-noir-bg border-accent-primary shadow-lg shadow-accent-primary/30'
                  : 'border-noir-border text-text-secondary hover:text-text-primary hover:border-accent-primary/50'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {feed.name}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Swipe Card */}
        <SwipeCard
          item={currentItem}
          onApprove={handleApprove}
          onReject={handleReject}
          onRefresh={handleRefresh}
          isLoading={loadingItems}
        />

        {/* Counter - Enhanced */}
        {contentItems.length > 0 && (
          <motion.div
            className="mt-8 text-center space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-4xl font-black text-accent-primary">{currentItemIndex + 1}</span>
              <span className="text-2xl text-text-muted">/</span>
              <span className="text-2xl font-semibold text-text-secondary">{contentItems.length}</span>
            </div>
            <p className="text-xs text-text-muted uppercase tracking-wider">Items in queue</p>
          </motion.div>
        )}
      </div>

      {/* Approve Bottom Sheet */}
      {currentItem && (
        <ApproveBottomSheet
          isOpen={showApproveSheet}
          onClose={() => setShowApproveSheet(false)}
          onComplete={handleApproveComplete}
          contentItem={currentItem}
        />
      )}

      {/* Capture Bottom Sheet */}
      <CaptureBottomSheet
        isOpen={showCaptureSheet}
        onClose={() => setShowCaptureSheet(false)}
        onCaptured={handleCaptured}
      />

      {/* Quick Post Bottom Sheet */}
      <QuickPostBottomSheet
        isOpen={showQuickPostSheet}
        onClose={() => setShowQuickPostSheet(false)}
        onPosted={handlePosted}
      />

      {/* Floating Action Buttons */}
      <motion.div
        className="fixed bottom-28 right-6 flex flex-col gap-3 z-30"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {/* Quick Post FAB */}
        <motion.button
          onClick={() => setShowQuickPostSheet(true)}
          className="w-14 h-14 rounded-full bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/50 text-noir-bg flex items-center justify-center font-semibold text-xl transition-all shadow-lg min-h-[56px] min-w-[56px]"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Quick Post"
        >
          ⚡
        </motion.button>

        {/* Capture FAB */}
        <motion.button
          onClick={() => setShowCaptureSheet(true)}
          className="w-14 h-14 rounded-full bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/50 text-noir-bg flex items-center justify-center font-semibold text-xl transition-all shadow-lg min-h-[56px] min-w-[56px]"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          title="Capture URL"
        >
          📌
        </motion.button>
      </motion.div>

      {/* Bottom spacer for safe area and nav */}
      <div className="h-8" />
    </div>
  );
}
