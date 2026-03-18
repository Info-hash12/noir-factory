import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Check, RefreshCw } from 'lucide-react';
import type { ContentItem } from '../types';

interface SwipeCardProps {
  item: ContentItem | null;
  onApprove: () => void;
  onReject: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export function SwipeCard({ item, onApprove, onReject, onRefresh, isLoading }: SwipeCardProps) {
  const [swipeX, setSwipeX] = useState(0);
  const constraintsRef = useRef<HTMLDivElement>(null);

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-96 px-4">
        <div className="text-center">
          <p className="text-gray-400 mb-4">No new content. Add RSS feeds in Settings.</p>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 min-h-[44px]"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
    );
  }

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const swipeThreshold = 100;
    if (info.offset.x > swipeThreshold) {
      onApprove();
    } else if (info.offset.x < -swipeThreshold) {
      onReject();
    }
    setSwipeX(0);
  };

  return (
    <div ref={constraintsRef} className="relative w-full h-96 perspective">
      <motion.div
        drag="x"
        dragConstraints={constraintsRef}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        onDrag={(_: unknown, info: { offset: { x: number } }) => {
          setSwipeX(info.offset.x);
        }}
        className="absolute inset-0 cursor-grab active:cursor-grabbing bg-gray-900 rounded-2xl p-6 border border-gray-800 overflow-hidden"
        style={{
          x: swipeX,
          rotate: swipeX * 0.1,
        }}
      >
        {/* Reject overlay */}
        {swipeX < -20 && (
          <motion.div
            className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="flex flex-col items-center gap-2">
              <X className="w-16 h-16 text-red-500" />
              <p className="text-red-500 font-bold">REJECT</p>
            </div>
          </motion.div>
        )}

        {/* Approve overlay */}
        {swipeX > 20 && (
          <motion.div
            className="absolute inset-0 bg-green-500 bg-opacity-20 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="flex flex-col items-center gap-2">
              <Check className="w-16 h-16 text-green-500" />
              <p className="text-green-500 font-bold">APPROVE</p>
            </div>
          </motion.div>
        )}

        {/* Content */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <div className="mb-4">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-semibold text-blue-400 bg-blue-500 bg-opacity-20 px-2 py-1 rounded">
                {item.feed_name}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(item.published_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Image */}
          {item.source_image && (
            <img
              src={item.source_image}
              alt={item.title}
              className="w-full h-40 object-cover rounded-lg mb-4"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}

          {/* Title */}
          <h2 className="text-xl font-bold mb-3 line-clamp-2">{item.title}</h2>

          {/* Excerpt */}
          <p className="text-sm text-gray-400 line-clamp-4 flex-1 mb-4">{item.excerpt}</p>

          {/* Source */}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 truncate hover:underline"
            >
              {item.source_url}
            </a>
          )}
        </div>
      </motion.div>

      {/* Quick action buttons */}
      <div className="absolute bottom-0 left-0 right-0 flex gap-4 px-4 -mb-20">
        <button
          onClick={onReject}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-500 bg-opacity-10 text-red-400 rounded-lg hover:bg-opacity-20 transition-colors min-h-[44px]"
        >
          <X className="w-5 h-5" />
          Reject
        </button>
        <button
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-500 bg-opacity-10 text-green-400 rounded-lg hover:bg-opacity-20 transition-colors min-h-[44px]"
        >
          <Check className="w-5 h-5" />
          Approve
        </button>
      </div>
    </div>
  );
}
