import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Loader } from 'lucide-react';
import * as api from '../lib/api';

interface QuickPostBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onPosted: () => void;
}

const LAYOUTS = [
  { id: 'reddit-bg-pip', name: 'Reddit BG+PiP', icon: '📱' },
  { id: 'split-screen', name: 'Split Screen', icon: '▢▢' },
  { id: 'hook-reddit', name: 'Hook→Reddit', icon: '⭐' },
  { id: 'text-first', name: 'Text-First', icon: '📝' },
  { id: 'faceless', name: 'Faceless', icon: '💰' },
];

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: '📷' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵' },
  { id: 'youtube', name: 'YouTube', icon: '▶️' },
  { id: 'twitter', name: 'Twitter/X', icon: '𝕏' },
  { id: 'facebook', name: 'Facebook', icon: '👍' },
];

export function QuickPostBottomSheet({
  isOpen,
  onClose,
  onPosted,
}: QuickPostBottomSheetProps) {
  const [content, setContent] = useState('');
  const [selectedLayout, setSelectedLayout] = useState('hook-reddit');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['instagram']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setSelectedLayout('hook-reddit');
      setSelectedPlatforms(['instagram']);
      setError('');
    }
  }, [isOpen]);

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId]
    );
  };

  const handlePostNow = async () => {
    if (!content.trim()) {
      setError('Please enter some content');
      return;
    }

    if (selectedPlatforms.length === 0) {
      setError('Please select at least one platform');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      // Create a temporary content item ID
      const contentItemId = `quick-post-${Date.now()}`;

      // Create content job with immediate flag
      const jobData = {
        content_item_id: contentItemId,
        job_type: 'video_with_avatar',
        target_platforms: selectedPlatforms,
        caption_text: content,
        layout_type: selectedLayout,
      };

      await api.createContentJob(jobData);

      setContent('');
      onPosted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-noir-surface border-t border-noir-border rounded-t-3xl z-50 px-6 pt-6 pb-8 max-h-[90vh] overflow-y-auto max-w-2xl mx-auto"
          >
            {/* Handle bar */}
            <div className="flex justify-center mb-4">
              <div className="w-12 h-1 bg-noir-border rounded-full" />
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 hover:bg-noir-bg rounded-lg transition-colors min-h-[44px] min-w-[44px]"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>

            {/* Header */}
            <div className="mb-6 pr-12">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-accent-primary" />
                <h3 className="text-xl font-black text-text-primary">Quick Post</h3>
              </div>
              <p className="text-sm text-text-secondary">Create and post immediately</p>
            </div>

            <div className="space-y-6">
              {/* Content textarea */}
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Write your content here..."
                  className="w-full px-4 py-3 bg-noir-bg border border-noir-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 min-h-[120px] resize-none"
                />
              </div>

              {/* Layout selector */}
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Layout
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LAYOUTS.map((layout) => (
                    <motion.button
                      key={layout.id}
                      onClick={() => setSelectedLayout(layout.id)}
                      className={`p-3 rounded-lg border transition-all text-left min-h-[44px] ${
                        selectedLayout === layout.id
                          ? 'bg-accent-primary/10 border-accent-primary'
                          : 'bg-noir-bg border-noir-border hover:border-accent-primary/50'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{layout.icon}</span>
                        <span className="text-xs font-semibold text-text-primary">
                          {layout.name}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Platform selector */}
              <div>
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Platforms ({selectedPlatforms.length} selected)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PLATFORMS.map((platform) => (
                    <motion.button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 min-h-[60px] justify-center ${
                        selectedPlatforms.includes(platform.id)
                          ? 'bg-accent-primary/10 border-accent-primary'
                          : 'bg-noir-bg border-noir-border hover:border-accent-primary/50'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <span className="text-lg">{platform.icon}</span>
                      <span className="text-xs font-semibold text-text-primary">
                        {platform.name}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-accent-danger"
                >
                  {error}
                </motion.p>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 pt-4">
                <motion.button
                  onClick={onClose}
                  className="flex-1 px-6 py-4 bg-noir-bg hover:bg-noir-border text-text-primary rounded-xl font-semibold transition-all min-h-[44px]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={handlePostNow}
                  disabled={isLoading || !content.trim()}
                  className="flex-1 px-6 py-4 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 disabled:opacity-50 disabled:cursor-not-allowed text-noir-bg rounded-xl font-semibold transition-all flex items-center justify-center gap-2 min-h-[44px]"
                  whileHover={!isLoading ? { scale: 1.02 } : {}}
                  whileTap={!isLoading ? { scale: 0.98 } : {}}
                >
                  {isLoading && <Loader className="w-4 h-4 animate-spin" />}
                  <Zap className="w-4 h-4" />
                  Post Now
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
