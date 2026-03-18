import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pin, Loader } from 'lucide-react';
import * as api from '../lib/api';

interface CaptureBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptured: () => void;
}

export function CaptureBottomSheet({
  isOpen,
  onClose,
  onCaptured,
}: CaptureBottomSheetProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCapture = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const result = await api.captureUrl(url);
      if (result.success || result.item) {
        setUrl('');
        onCaptured();
        onClose();
      } else {
        setError(result.error || 'Failed to capture URL');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to capture URL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && url.trim()) {
      handleCapture();
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
            className="fixed bottom-0 left-0 right-0 bg-noir-surface border-t border-noir-border rounded-t-3xl z-50 px-6 pt-6 pb-8 max-w-2xl mx-auto"
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
                <Pin className="w-5 h-5 text-accent-primary" />
                <h3 className="text-xl font-black text-text-primary">Capture Content</h3>
              </div>
              <p className="text-sm text-text-secondary">
                Paste any URL (Reddit, TikTok, X, Instagram, YouTube, LinkedIn, news)
              </p>
            </div>

            {/* Input */}
            <div className="space-y-4">
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (error) setError('');
                }}
                onKeyPress={handleKeyPress}
                placeholder="https://reddit.com/r/..."
                className={`w-full px-4 py-4 bg-noir-bg border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-all ${
                  error
                    ? 'border-accent-danger focus:ring-accent-danger/20'
                    : 'border-noir-border focus:border-accent-primary focus:ring-accent-primary/20'
                } min-h-[44px]`}
              />

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
                  onClick={handleCapture}
                  disabled={isLoading || !url.trim()}
                  className="flex-1 px-6 py-4 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 disabled:opacity-50 disabled:cursor-not-allowed text-noir-bg rounded-xl font-semibold transition-all flex items-center justify-center gap-2 min-h-[44px]"
                  whileHover={!isLoading ? { scale: 1.02 } : {}}
                  whileTap={!isLoading ? { scale: 0.98 } : {}}
                >
                  {isLoading && <Loader className="w-4 h-4 animate-spin" />}
                  <Pin className="w-4 h-4" />
                  Capture
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
