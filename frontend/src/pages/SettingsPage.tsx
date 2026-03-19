import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit2, Save, X, Settings, Rss, LogOut, Link, CheckCircle2 } from 'lucide-react';
import { useContentStore } from '../store/contentStore';
import { useAuthStore } from '../store/authStore';
import { useCompanyStore } from '../store/companyStore';
import * as api from '../lib/api';

interface Feed {
  id: string;
  name: string;
  url: string;
  type: 'rss' | 'reddit' | 'twitter' | 'youtube' | 'instagram' | 'tiktok' | 'linkedin' | 'news' | 'competitor' | 'generic';
}

interface Prompts {
  script_generation?: string;
  hook?: string;
  hashtags?: string;
  caption?: string;
  first_comment?: string;
}

interface PlatformStatus {
  connected: boolean;
  account_name?: string;
  expires_at?: string;
  error?: string;
  reason?: string;
}

export function SettingsPage() {
  const { logout } = useAuthStore();
  const { currentCompany } = useCompanyStore();
  const { feeds, loadingFeeds, fetchFeeds, addFeed, removeFeed } = useContentStore();

  const [showAddFeed, setShowAddFeed] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: '', url: '', type: 'rss' as Feed['type'] });
  const [loading, setLoading] = useState(false);

  const [prompts, setPrompts] = useState<Prompts>({});
  const [editingPrompt, setEditingPrompt] = useState<keyof Prompts | null>(null);
  const [promptValues, setPromptValues] = useState<Prompts>({});

  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({});
  const [connecting, setConnecting] = useState<Record<string, boolean>>({});

  const PLATFORMS = [
    { id: 'instagram', name: 'Instagram', icon: '📷' },
    { id: 'facebook', name: 'Facebook', icon: '👍' },
    { id: 'threads', name: 'Threads', icon: '🧵' },
    { id: 'tiktok', name: 'TikTok', icon: '🎵' },
    { id: 'twitter', name: 'Twitter/X', icon: '𝕏' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
  ];

  useEffect(() => {
    fetchFeeds();
    loadConnectionStatus();
    if (currentCompany) {
      loadPrompts();
    }
  }, [currentCompany]);

  const loadConnectionStatus = async () => {
    try {
      const response = await api.getConnectionStatus();
      setPlatformStatus(response?.platforms || {});
    } catch (error) {
      console.error('Failed to load connection status:', error);
      const emptyStatus: Record<string, PlatformStatus> = {};
      PLATFORMS.forEach(p => {
        emptyStatus[p.id] = { connected: false };
      });
      setPlatformStatus(emptyStatus);
    }
  };

  const handleConnectPlatform = async (platformId: string) => {
    try {
      setConnecting(prev => ({ ...prev, [platformId]: true }));
      const response = await api.connectPlatform(platformId);

      if (response?.authUrl) {
        const authWindow = window.open(response.authUrl, '_blank', 'width=500,height=600');
        const checkInterval = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(checkInterval);
            setTimeout(() => loadConnectionStatus(), 1000);
          }
        }, 500);
      } else if (response?.error) {
        alert(`Error: ${response.error}`);
      }
    } catch (error) {
      console.error('Failed to initiate connection:', error);
      alert('Failed to connect platform');
    } finally {
      setConnecting(prev => ({ ...prev, [platformId]: false }));
    }
  };

  const handleDisconnectPlatform = async (platformId: string) => {
    if (!window.confirm(`Disconnect ${platformId}?`)) return;

    try {
      setConnecting(prev => ({ ...prev, [platformId]: true }));
      await api.disconnectPlatform(platformId);
      await loadConnectionStatus();
    } catch (error) {
      console.error('Failed to disconnect:', error);
      alert('Failed to disconnect platform');
    } finally {
      setConnecting(prev => ({ ...prev, [platformId]: false }));
    }
  };

  const loadPrompts = async () => {
    if (!currentCompany) return;
    try {
      const result = await api.getCompanyPrompts(currentCompany.id);
      const p = result.prompts || result.data || result || {};
      setPrompts(p);
      setPromptValues(p);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    }
  };

  const handleAddFeed = async () => {
    if (!newFeed.name.trim() || !newFeed.url.trim()) return;

    setLoading(true);
    try {
      await addFeed(newFeed);
      setNewFeed({ name: '', url: '', type: 'rss' });
      setShowAddFeed(false);
    } catch (error) {
      console.error('Failed to add feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFeed = async (feedId: string) => {
    try {
      await removeFeed(feedId);
    } catch (error) {
      console.error('Failed to remove feed:', error);
    }
  };

  const handleSavePrompt = async (key: keyof Prompts) => {
    if (!currentCompany) return;

    try {
      const updated = { ...prompts, [key]: promptValues[key] };
      await api.updateCompanyPrompts(currentCompany.id, updated);
      setPrompts(updated);
      setEditingPrompt(null);
    } catch (error) {
      console.error('Failed to save prompt:', error);
    }
  };

  const PROMPT_FIELDS = [
    {
      key: 'script_generation' as const,
      label: 'Script Generation Prompt',
      placeholder: 'Instructions for generating video scripts...',
    },
    {
      key: 'hook' as const,
      label: 'Hook Template',
      placeholder: 'Template for content hooks...',
    },
    {
      key: 'hashtags' as const,
      label: 'Hashtag Strategy',
      placeholder: 'Instructions for hashtag selection...',
    },
    {
      key: 'caption' as const,
      label: 'Caption Template',
      placeholder: 'Template for captions...',
    },
    {
      key: 'first_comment' as const,
      label: 'First Comment Template',
      placeholder: 'Template for first comments...',
    },
  ];

  return (
    <div className="min-h-screen bg-noir-bg">
      <div className="px-4 py-6 pb-24 max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          className="space-y-2"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6 text-accent-primary" />
            <h1 className="text-3xl font-black text-text-primary">Settings</h1>
          </div>
          <p className="text-text-secondary">Manage your content sources and AI prompts</p>
        </motion.div>

        {/* Integrations Section */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Link className="w-5 h-5 text-accent-primary" />
              <h3 className="text-lg font-black text-text-primary">Social Media Integrations</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {PLATFORMS.map((platform, index) => {
              const status = platformStatus[platform.id];
              const isConnected = status?.connected;

              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 + index * 0.03 }}
                  className="bg-noir-bg border border-noir-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{platform.icon}</span>
                      <div>
                        <h4 className="text-sm font-bold text-text-primary">{platform.name}</h4>
                        {isConnected && status?.account_name && (
                          <p className="text-xs text-accent-success font-semibold">
                            {status.account_name}
                          </p>
                        )}
                      </div>
                    </div>
                    {isConnected && (
                      <CheckCircle2 className="w-4 h-4 text-accent-success flex-shrink-0" />
                    )}
                  </div>

                  {isConnected ? (
                    <motion.button
                      onClick={() => handleDisconnectPlatform(platform.id)}
                      disabled={connecting[platform.id]}
                      className="w-full px-3 py-2 bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs min-h-[36px]"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {connecting[platform.id] ? 'Disconnecting...' : 'Disconnect'}
                    </motion.button>
                  ) : (
                    <motion.button
                      onClick={() => handleConnectPlatform(platform.id)}
                      disabled={connecting[platform.id]}
                      className="w-full px-3 py-2 bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs min-h-[36px]"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {connecting[platform.id] ? 'Connecting...' : 'Connect'}
                    </motion.button>
                  )}

                  {status?.reason && (
                    <p className="text-xs text-text-muted italic">{status.reason}</p>
                  )}
                </motion.div>
              );
            })}
          </div>

          <p className="text-sm text-text-muted mt-6">
            Connect your social media accounts to enable the engagement bot to post content and manage your social presence.
          </p>
        </motion.div>

        {/* RSS Feeds Section */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rss className="w-5 h-5 text-accent-primary" />
              <h3 className="text-lg font-black text-text-primary">RSS Feeds</h3>
            </div>
            <motion.button
              onClick={() => setShowAddFeed(!showAddFeed)}
              className="w-10 h-10 rounded-lg bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg flex items-center justify-center transition-all duration-200 min-h-[44px] min-w-[44px]"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-5 h-5" />
            </motion.button>
          </div>

          <AnimatePresence>
            {showAddFeed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 mb-6 p-4 bg-noir-bg border border-noir-border rounded-xl"
              >
                <input
                  type="text"
                  value={newFeed.name}
                  onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                  placeholder="Feed name"
                  className="w-full px-4 py-3 bg-noir-surface border border-noir-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[44px]"
                />
                <input
                  type="url"
                  value={newFeed.url}
                  onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
                  placeholder="https://example.com/feed.xml"
                  className="w-full px-4 py-3 bg-noir-surface border border-noir-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[44px]"
                />
                <select
                  value={newFeed.type}
                  onChange={(e) =>
                    setNewFeed({
                      ...newFeed,
                      type: e.target.value as Feed['type'],
                    })
                  }
                  className="w-full px-4 py-3 bg-noir-surface border border-noir-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[44px]"
                >
                  <option value="rss">RSS Feed</option>
                  <option value="reddit">Reddit</option>
                  <option value="twitter">Twitter/X</option>
                  <option value="youtube">YouTube</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="news">News</option>
                  <option value="competitor">Competitor Account</option>
                  <option value="generic">Generic</option>
                </select>
                <div className="flex gap-2">
                  <motion.button
                    onClick={handleAddFeed}
                    disabled={loading}
                    className="flex-1 px-4 py-3 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {loading ? 'Adding...' : 'Add Feed'}
                  </motion.button>
                  <motion.button
                    onClick={() => setShowAddFeed(false)}
                    className="flex-1 px-4 py-3 bg-noir-border text-text-primary rounded-lg font-semibold transition-all duration-200 hover:bg-noir-border/80 min-h-[44px]"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Cancel
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {loadingFeeds ? (
            <div className="text-center py-8 text-text-muted">Loading feeds...</div>
          ) : feeds.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">
              No feeds yet. Add one to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {feeds.map((feed: Feed, index) => (
                <motion.div
                  key={feed.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-noir-bg p-4 rounded-lg border border-noir-border hover:border-accent-primary/30 transition-colors flex items-start justify-between gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-text-primary mb-2">{feed.name}</p>
                    <p className="text-xs text-text-secondary truncate mb-2">{feed.url}</p>
                    <span className="inline-block text-xs font-medium text-accent-primary bg-accent-primary/10 px-3 py-1 rounded-full">
                      {feed.type.toUpperCase()}
                    </span>
                  </div>
                  <motion.button
                    onClick={() => handleRemoveFeed(feed.id)}
                    className="flex-shrink-0 p-2 hover:bg-accent-danger/10 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 className="w-4 h-4 text-accent-danger opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Content Prompts Section */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-lg font-black text-text-primary mb-6">Content Prompts</h3>
          <div className="space-y-5">
            {PROMPT_FIELDS.map((field, index) => (
              <motion.div
                key={field.key}
                className="space-y-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.05 }}
              >
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-text-primary">{field.label}</label>
                  {editingPrompt === field.key ? (
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => handleSavePrompt(field.key)}
                        className="p-2 hover:bg-accent-success/10 rounded-lg text-accent-success transition-colors min-h-[44px] min-w-[44px]"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Save className="w-4 h-4" />
                      </motion.button>
                      <motion.button
                        onClick={() => {
                          setEditingPrompt(null);
                          setPromptValues({ ...prompts });
                        }}
                        className="p-2 hover:bg-accent-danger/10 rounded-lg text-accent-danger transition-colors min-h-[44px] min-w-[44px]"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button
                      onClick={() => {
                        setEditingPrompt(field.key);
                        setPromptValues({ ...prompts });
                      }}
                      className="p-2 hover:bg-accent-primary/10 rounded-lg text-accent-primary transition-colors min-h-[44px] min-w-[44px]"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </motion.button>
                  )}
                </div>

                {editingPrompt === field.key ? (
                  <textarea
                    value={promptValues[field.key] || ''}
                    onChange={(e) =>
                      setPromptValues({ ...promptValues, [field.key]: e.target.value })
                    }
                    placeholder={field.placeholder}
                    className="w-full px-4 py-3 bg-noir-bg border border-noir-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[88px]"
                  />
                ) : (
                  <div className="px-4 py-3 bg-noir-bg rounded-lg text-sm text-text-secondary border border-noir-border min-h-[44px] flex items-center">
                    {prompts[field.key] || <span className="text-text-muted italic">(empty)</span>}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Account Section */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-lg font-black text-text-primary mb-4">Account</h3>
          <motion.button
            onClick={async () => {
              await logout();
            }}
            className="w-full px-4 py-3 bg-accent-danger hover:shadow-lg hover:shadow-accent-danger/30 text-noir-bg rounded-xl font-semibold transition-all duration-200 flex items-center justify-center gap-2 min-h-[44px]"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <LogOut className="w-5 h-5" />
            Logout
          </motion.button>
        </motion.div>

        {/* Footer */}
        <motion.div
          className="text-center space-y-1 py-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-sm font-black text-text-primary">NOIR FACTORY</p>
          <p className="text-xs text-text-muted">v0.1.0</p>
        </motion.div>

        <div className="h-8" />
      </div>
    </div>
  );
}
