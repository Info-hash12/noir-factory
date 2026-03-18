import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Heart, MessageCircle, UserPlus, Sparkles, X } from 'lucide-react';
import * as api from '../lib/api';

interface Activity {
  id: string;
  type: 'like' | 'comment' | 'follow';
  platform: string;
  timestamp: string;
}

interface Template {
  id: string;
  name: string;
  content: string;
}

interface PlatformStats {
  platform: string;
  likes: number;
  comments: number;
  follows: number;
  total: number;
}

interface DetailedStats {
  period: string;
  totals: {
    likes: number;
    comments: number;
    follows: number;
    total: number;
  };
  byPlatform: Record<string, { likes: number; comments: number; follows: number; total: number }>;
}

const PLATFORM_INFO = {
  instagram: { name: 'Instagram', icon: '📷', color: 'from-pink-500 to-rose-500' },
  tiktok: { name: 'TikTok', icon: '🎵', color: 'from-black to-slate-900' },
  youtube: { name: 'YouTube', icon: '▶️', color: 'from-red-500 to-red-600' },
  twitter: { name: 'Twitter/X', icon: '𝕏', color: 'from-black to-slate-800' },
  facebook: { name: 'Facebook', icon: '👍', color: 'from-blue-500 to-blue-600' },
  threads: { name: 'Threads', icon: '🧵', color: 'from-black to-slate-900' },
  linkedin: { name: 'LinkedIn', icon: '💼', color: 'from-blue-400 to-blue-500' },
};

export function BotPage() {
  const [botEnabled, setBotEnabled] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [loading, setLoading] = useState(true);
  const [showAddTemplate, setShowAddTemplate] = useState(false);

  useEffect(() => {
    loadBotData();
  }, [period]);

  const loadBotData = async () => {
    try {
      setLoading(true);
      const [status, hashtags, templates, activities, detailedStats] = await Promise.all([
        api.getEngagementStatus(),
        api.getEngagementHashtags(),
        api.getEngagementTemplates(),
        api.getEngagementActivities(),
        api.getEngagementStatsDetailed({ period }),
      ]);

      setBotEnabled(status.enabled || false);
      setHashtags(hashtags.hashtags || []);
      setTemplates(templates || []);
      setActivities(activities || []);
      setStats(detailedStats || null);
    } catch (error) {
      console.error('Failed to load bot data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBot = async () => {
    try {
      await api.updateEngagementStatus(!botEnabled);
      setBotEnabled(!botEnabled);
    } catch (error) {
      console.error('Failed to toggle bot:', error);
    }
  };

  const handleAddHashtag = async () => {
    if (!newHashtag.trim()) return;
    try {
      const updated = [...hashtags, newHashtag];
      await api.updateEngagementHashtags(updated);
      setHashtags(updated);
      setNewHashtag('');
    } catch (error) {
      console.error('Failed to add hashtag:', error);
    }
  };

  const handleRemoveHashtag = async (tag: string) => {
    try {
      const updated = hashtags.filter((t) => t !== tag);
      await api.updateEngagementHashtags(updated);
      setHashtags(updated);
    } catch (error) {
      console.error('Failed to remove hashtag:', error);
    }
  };

  const handleAddTemplate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.content.trim()) return;
    try {
      await api.createEngagementTemplate(newTemplate);
      setTemplates([
        ...templates,
        { id: Date.now().toString(), ...newTemplate },
      ]);
      setNewTemplate({ name: '', content: '' });
      setShowAddTemplate(false);
    } catch (error) {
      console.error('Failed to add template:', error);
    }
  };

  const handleRemoveTemplate = async (templateId: string) => {
    try {
      await api.deleteEngagementTemplate(templateId);
      setTemplates(templates.filter((t) => t.id !== templateId));
    } catch (error) {
      console.error('Failed to remove template:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-noir-bg flex items-center justify-center px-4">
        <div className="text-center">
          <motion.div
            className="w-12 h-12 rounded-full border-4 border-noir-border border-t-accent-primary mx-auto mb-4"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-text-secondary">Loading bot settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-noir-bg">
      <div className="px-4 py-6 pb-24 max-w-2xl mx-auto space-y-8">
        {/* Hero Section - Bot Toggle */}
        <motion.div
          className="bg-gradient-to-br from-accent-primary/10 to-accent-danger/5 border border-accent-primary/30 rounded-2xl p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent-primary" />
                <h2 className="text-xl font-black text-text-primary">Engagement Bot</h2>
              </div>
              <p className="text-sm text-text-secondary">
                {botEnabled ? 'Active and engaging with your audience' : 'Enable to start automated engagement'}
              </p>
            </div>

            {/* Toggle Switch */}
            <motion.button
              onClick={handleToggleBot}
              className={`relative inline-flex w-14 h-8 items-center rounded-full transition-all duration-300 flex-shrink-0 min-h-[44px]`}
              style={{
                backgroundColor: botEnabled ? 'rgb(108, 92, 231)' : 'rgb(46, 46, 62)',
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.span
                className="inline-block h-6 w-6 rounded-full bg-white shadow-lg"
                animate={{
                  x: botEnabled ? 28 : 4,
                }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            </motion.button>
          </div>
        </motion.div>

        {/* Period Selector Pills */}
        <motion.div
          className="flex gap-2 overflow-x-auto scrollbar-hide pb-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {(['today', 'week', 'month', 'all'] as const).map((p) => (
            <motion.button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-shrink-0 px-4 py-2 rounded-full font-semibold text-sm transition-all duration-200 min-h-[44px] whitespace-nowrap border capitalize ${
                period === p
                  ? 'bg-accent-primary text-noir-bg border-accent-primary shadow-lg shadow-accent-primary/30'
                  : 'border-noir-border text-text-secondary hover:text-text-primary hover:border-accent-primary/50'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {p}
            </motion.button>
          ))}
        </motion.div>

        {/* Overall Stats Hero Section */}
        {stats && (
          <motion.div
            className="bg-gradient-to-br from-accent-primary/20 to-accent-primary/5 border border-accent-primary/30 rounded-2xl p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="text-lg font-black text-text-primary mb-6">Overall Stats</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <motion.div
                  className="w-12 h-12 rounded-lg bg-accent-danger/10 flex items-center justify-center mx-auto mb-3"
                  animate={botEnabled && stats.totals.likes > 0 ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Heart className="w-6 h-6 text-accent-danger" />
                </motion.div>
                <div className="text-3xl font-black text-text-primary">{stats.totals.likes}</div>
                <div className="text-xs text-text-muted uppercase tracking-wider mt-2">Likes</div>
              </div>

              <div className="text-center">
                <motion.div
                  className="w-12 h-12 rounded-lg bg-accent-primary/10 flex items-center justify-center mx-auto mb-3"
                  animate={botEnabled && stats.totals.comments > 0 ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <MessageCircle className="w-6 h-6 text-accent-primary" />
                </motion.div>
                <div className="text-3xl font-black text-text-primary">{stats.totals.comments}</div>
                <div className="text-xs text-text-muted uppercase tracking-wider mt-2">Comments</div>
              </div>

              <div className="text-center">
                <motion.div
                  className="w-12 h-12 rounded-lg bg-accent-success/10 flex items-center justify-center mx-auto mb-3"
                  animate={botEnabled && stats.totals.follows > 0 ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <UserPlus className="w-6 h-6 text-accent-success" />
                </motion.div>
                <div className="text-3xl font-black text-text-primary">{stats.totals.follows}</div>
                <div className="text-xs text-text-muted uppercase tracking-wider mt-2">Follows</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Platform Stats */}
        {stats && Object.keys(stats.byPlatform).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3"
          >
            <h3 className="text-lg font-black text-text-primary px-1 mb-4">By Platform</h3>
            {Object.entries(stats.byPlatform).map(([platformId, platformStats], index) => {
              const info = PLATFORM_INFO[platformId as keyof typeof PLATFORM_INFO] || {
                name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
                icon: '📱',
                color: 'from-slate-500 to-slate-600',
              };
              return (
                <motion.div
                  key={platformId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + index * 0.05 }}
                  className="bg-noir-surface border border-noir-border rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{info.icon}</div>
                      <div>
                        <p className="font-semibold text-text-primary">{info.name}</p>
                        <p className="text-xs text-text-muted">{platformStats.total} total actions</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-noir-bg rounded-lg border border-accent-danger/20">
                      <Heart className="w-4 h-4 text-accent-danger mx-auto mb-2" />
                      <p className="text-xl font-black text-text-primary">{platformStats.likes}</p>
                      <p className="text-xs text-text-muted mt-1">Likes</p>
                    </div>
                    <div className="text-center p-3 bg-noir-bg rounded-lg border border-accent-primary/20">
                      <MessageCircle className="w-4 h-4 text-accent-primary mx-auto mb-2" />
                      <p className="text-xl font-black text-text-primary">{platformStats.comments}</p>
                      <p className="text-xs text-text-muted mt-1">Comments</p>
                    </div>
                    <div className="text-center p-3 bg-noir-bg rounded-lg border border-accent-success/20">
                      <UserPlus className="w-4 h-4 text-accent-success mx-auto mb-2" />
                      <p className="text-xl font-black text-text-primary">{platformStats.follows}</p>
                      <p className="text-xs text-text-muted mt-1">Follows</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Hashtags Section */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-lg font-black text-text-primary mb-4">Target Hashtags</h3>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newHashtag}
                onChange={(e) => setNewHashtag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddHashtag()}
                placeholder="#hashtag"
                className="flex-1 px-4 py-3 bg-noir-bg border border-noir-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[44px]"
              />
              <motion.button
                onClick={handleAddHashtag}
                className="px-6 py-3 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-xl font-semibold transition-all duration-200 min-h-[44px] min-w-[44px]"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-5 h-5" />
              </motion.button>
            </div>

            {hashtags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {hashtags.map((tag, index) => (
                  <motion.div
                    key={tag}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-accent-primary/10 border border-accent-primary/30 text-accent-primary px-4 py-2 rounded-full flex items-center gap-2 text-sm font-semibold"
                  >
                    <span>{tag}</span>
                    <motion.button
                      onClick={() => handleRemoveHashtag(tag)}
                      className="hover:opacity-70 transition-opacity flex-shrink-0 min-h-[44px] min-w-[44px]"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">No hashtags yet. Add one to get started.</p>
            )}
          </div>
        </motion.div>

        {/* Templates Section */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-text-primary">Comment Templates</h3>
            <motion.button
              onClick={() => setShowAddTemplate(!showAddTemplate)}
              className="w-10 h-10 rounded-lg bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg flex items-center justify-center transition-all duration-200 min-h-[44px] min-w-[44px]"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-5 h-5" />
            </motion.button>
          </div>

          <AnimatePresence>
            {showAddTemplate && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 mb-6 p-4 bg-noir-bg border border-noir-border rounded-xl"
              >
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) =>
                    setNewTemplate({ ...newTemplate, name: e.target.value })
                  }
                  placeholder="Template name"
                  className="w-full px-4 py-3 bg-noir-surface border border-noir-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[44px]"
                />
                <textarea
                  value={newTemplate.content}
                  onChange={(e) =>
                    setNewTemplate({ ...newTemplate, content: e.target.value })
                  }
                  placeholder="Comment template..."
                  className="w-full px-4 py-3 bg-noir-surface border border-noir-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/20 min-h-[88px]"
                />
                <div className="flex gap-2">
                  <motion.button
                    onClick={handleAddTemplate}
                    className="flex-1 px-4 py-3 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-lg font-semibold transition-all duration-200 min-h-[44px]"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Save Template
                  </motion.button>
                  <motion.button
                    onClick={() => setShowAddTemplate(false)}
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

          <div className="space-y-2">
            {templates.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">
                No templates yet. Add one to get started.
              </p>
            ) : (
              templates.map((template, index) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-noir-bg p-4 rounded-lg border border-noir-border hover:border-accent-primary/30 transition-colors flex items-start justify-between gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-text-primary mb-2">{template.name}</p>
                    <p className="text-xs text-text-secondary line-clamp-2">
                      {template.content}
                    </p>
                  </div>
                  <motion.button
                    onClick={() => handleRemoveTemplate(template.id)}
                    className="flex-shrink-0 p-2 hover:bg-accent-danger/10 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 className="w-4 h-4 text-accent-danger opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>

        {/* Activity Feed */}
        <motion.div
          className="bg-noir-surface border border-noir-border rounded-2xl p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h3 className="text-lg font-black text-text-primary mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {activities.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">
                No activity yet. Enable the bot to start.
              </p>
            ) : (
              activities.slice(0, 10).map((activity, index) => {
                const icons = {
                  like: { icon: Heart, color: 'text-accent-danger', bg: 'bg-accent-danger/10' },
                  comment: { icon: MessageCircle, color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
                  follow: { icon: UserPlus, color: 'text-accent-success', bg: 'bg-accent-success/10' },
                };

                const config = icons[activity.type];
                const IconComponent = config.icon;

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-noir-bg/50 transition-colors"
                  >
                    <div className={`${config.bg} rounded-lg p-2.5 flex-shrink-0`}>
                      <IconComponent className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary capitalize font-medium">
                        {activity.type} on {activity.platform}
                      </p>
                    </div>
                    <span className="text-xs text-text-muted flex-shrink-0">
                      {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        <div className="h-8" />
      </div>
    </div>
  );
}
