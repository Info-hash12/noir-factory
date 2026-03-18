import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { useContentStore } from '../store/contentStore';
import { useAuthStore } from '../store/authStore';
import { useCompanyStore } from '../store/companyStore';
import * as api from '../lib/api';

interface Feed {
  id: string;
  name: string;
  url: string;
  type: 'reddit' | 'twitter' | 'rss';
}

interface Prompts {
  script_generation?: string;
  hook?: string;
  hashtags?: string;
  caption?: string;
  first_comment?: string;
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

  useEffect(() => {
    fetchFeeds();
    if (currentCompany) {
      loadPrompts();
    }
  }, [currentCompany]);

  const loadPrompts = async () => {
    if (!currentCompany) return;
    try {
      const data = await api.getCompanyPrompts(currentCompany.id);
      setPrompts(data || {});
      setPromptValues(data || {});
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
    <div className="p-4 space-y-6 pb-24">
      {/* RSS Feeds */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">RSS Feeds</h3>
          <button
            onClick={() => setShowAddFeed(!showAddFeed)}
            className="w-9 h-9 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 min-h-[44px] min-w-[44px]"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {showAddFeed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 mb-4 p-4 bg-gray-800 rounded-lg"
          >
            <input
              type="text"
              value={newFeed.name}
              onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
              placeholder="Feed name"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-h-[44px]"
            />
            <input
              type="url"
              value={newFeed.url}
              onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
              placeholder="https://example.com/feed.xml"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-h-[44px]"
            />
            <select
              value={newFeed.type}
              onChange={(e) =>
                setNewFeed({
                  ...newFeed,
                  type: e.target.value as Feed['type'],
                })
              }
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-h-[44px]"
            >
              <option value="rss">RSS Feed</option>
              <option value="reddit">Reddit</option>
              <option value="twitter">Twitter</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleAddFeed}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 min-h-[44px]"
              >
                {loading ? 'Adding...' : 'Add Feed'}
              </button>
              <button
                onClick={() => setShowAddFeed(false)}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {loadingFeeds ? (
          <div className="text-center py-4 text-gray-400">Loading feeds...</div>
        ) : feeds.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No feeds yet. Add one to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {feeds.map((feed: Feed) => (
              <div
                key={feed.id}
                className="bg-gray-800 p-3 rounded-lg flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm mb-1">{feed.name}</p>
                  <p className="text-xs text-gray-400 truncate">{feed.url}</p>
                  <span className="inline-block text-xs text-gray-500 mt-1 bg-gray-700 px-2 py-0.5 rounded">
                    {feed.type}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveFeed(feed.id)}
                  className="flex-shrink-0 p-2 hover:bg-gray-700 rounded transition-colors min-h-[44px] min-w-[44px]"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Company Prompts */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold mb-4">Content Prompts</h3>
        <div className="space-y-4">
          {PROMPT_FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">{field.label}</label>
                {editingPrompt === field.key ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSavePrompt(field.key)}
                      className="p-1 hover:bg-gray-800 rounded text-green-400 min-h-[44px] min-w-[44px]"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingPrompt(null);
                        setPromptValues({ ...prompts });
                      }}
                      className="p-1 hover:bg-gray-800 rounded text-red-400 min-h-[44px] min-w-[44px]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingPrompt(field.key);
                      setPromptValues({ ...prompts });
                    }}
                    className="p-1 hover:bg-gray-800 rounded text-blue-400 min-h-[44px] min-w-[44px]"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {editingPrompt === field.key ? (
                <textarea
                  value={promptValues[field.key] || ''}
                  onChange={(e) =>
                    setPromptValues({ ...promptValues, [field.key]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm min-h-[88px]"
                />
              ) : (
                <div className="px-3 py-2 bg-gray-800 rounded text-sm text-gray-400 min-h-[44px] flex items-center">
                  {prompts[field.key] || '(empty)'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold mb-4">Account</h3>
        <button
          onClick={async () => {
            await logout();
          }}
          className="w-full px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors min-h-[44px]"
        >
          Logout
        </button>
      </div>

      {/* About */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center text-sm text-gray-400">
        <p className="mb-2">Noir Factory</p>
        <p>v0.1.0</p>
      </div>

      <div className="h-4" />
    </div>
  );
}
