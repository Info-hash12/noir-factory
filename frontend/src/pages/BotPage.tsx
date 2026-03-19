import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Heart, MessageCircle, UserPlus, Sparkles, X, CheckCircle2, Send, LogOut } from 'lucide-react';
import * as api from '../lib/api';

interface Template {
  id: string;
  name: string;
  content: string;
}

interface DetailedActivityItem {
  id: string;
  platform: string;
  action: 'like' | 'comment' | 'follow' | 'dm';
  target: string;
  content?: string;
  postTitle?: string;
  username?: string;
  timestamp: string;
  success: boolean;
}

interface PlatformStatus {
  connected: boolean;
  account_name?: string;
  expires_at?: string;
  error?: string;
  reason?: string;
}

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: '📷' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵' },
  { id: 'twitter', name: 'Twitter/X', icon: '𝕏' },
  { id: 'facebook', name: 'Facebook', icon: '👍' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼' },
  { id: 'threads', name: 'Threads', icon: '🧵' },
];

const BOT_ACTIONS = [
  {
    id: 'like',
    title: 'Auto-Like',
    icon: '🤍',
    description: 'Likes posts matching your hashtags',
    rateLimit: '20/hour max',
  },
  {
    id: 'comment',
    title: 'Auto-Comment',
    icon: '💬',
    description: 'Comments using your templates',
    rateLimit: '20/hour max',
  },
  {
    id: 'follow',
    title: 'Auto-Follow',
    icon: '👤',
    description: 'Follows users in your niche',
    rateLimit: '20/hour max',
  },
  {
    id: 'dm',
    title: 'Auto-DM',
    icon: '📩',
    description: 'Welcome message to new followers',
    rateLimit: '20/hour max',
  },
];

// Demo activity data
const DEMO_ACTIVITIES: DetailedActivityItem[] = [
  {
    id: '1',
    platform: 'instagram',
    action: 'comment',
    target: '@travelsafe_tips',
    content: 'Great tips! Airport WiFi security is so important for frequent travelers 🛫',
    postTitle: 'WiFi Security at Airports',
    timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    success: true,
  },
  {
    id: '2',
    platform: 'instagram',
    action: 'like',
    target: '@cybersecurity_daily',
    postTitle: 'New vulnerability discovered in public WiFi networks',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    success: true,
  },
  {
    id: '3',
    platform: 'instagram',
    action: 'follow',
    target: '@digitalnomad_security',
    username: 'digitalnomad_security',
    timestamp: new Date(Date.now() - 8 * 60000).toISOString(),
    success: true,
  },
  {
    id: '4',
    platform: 'instagram',
    action: 'comment',
    target: '@vpn_reviews',
    content: 'This is exactly what every traveler needs to know! 🔒',
    postTitle: 'Best VPNs for Travel 2026',
    timestamp: new Date(Date.now() - 12 * 60000).toISOString(),
    success: true,
  },
  {
    id: '5',
    platform: 'instagram',
    action: 'like',
    target: '@security_tips_daily',
    postTitle: 'How to protect your passwords on public WiFi',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    success: true,
  },
];

export function BotPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('instagram');
  const [botEnabled, setBotEnabled] = useState(false);
  const [actionStates, setActionStates] = useState({
    like: true,
    comment: true,
    follow: true,
    dm: false,
  });
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [activities, setActivities] = useState<DetailedActivityItem[]>(DEMO_ACTIVITIES);
  const [loading, setLoading] = useState(true);
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [platformStatus, setPlatformStatus] = useState<Record<string, PlatformStatus>>({});
  const [connecting, setConnecting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadBotData();
    loadConnectionStatus();
  }, []);

  const loadBotData = async () => {
    try {
      setLoading(true);
      const [status, hashtags, templates] = await Promise.all([
        api.getEngagementStatus(),
        api.getEngagementHashtags(),
        api.getEngagementTemplates(),
      ]);

      setBotEnabled(status?.data?.enabled || status?.enabled || false);
      setHashtags(hashtags?.data?.hashtags || hashtags?.hashtags || []);
      setTemplates(templates?.templates || templates?.data || []);
    } catch (error) {
      console.error('Failed to load bot data:', error);
      setBotEnabled(false);
      setHashtags([]);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const loadConnectionStatus = async () => {
    try {
      const response = await api.getConnectionStatus();
      setPlatformStatus(response?.platforms || {});
    } catch (error) {
      console.error('Failed to load connection status:', error);
      // Initialize empty status
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
        // Open OAuth flow in new window
        const authWindow = window.open(response.authUrl, '_blank', 'width=500,height=600');

        // Check for success periodically
        const checkInterval = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(checkInterval);
            // Reload status after window closes
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

  const handleToggleBot = async () => {
    try {
      await api.updateEngagementStatus(!botEnabled);
      setBotEnabled(!botEnabled);
    } catch (error) {
      console.error('Failed to toggle bot:', error);
    }
  };

  const handleToggleAction = (actionId: string) => {
    setActionStates(prev => ({
      ...prev,
      [actionId]: !prev[actionId as keyof typeof actionStates],
    }));
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

  const getPlatformInfo = (platformId: string) => {
    return PLATFORMS.find(p => p.id === platformId);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'like':
        return <Heart className="w-5 h-5" />;
      case 'comment':
        return <MessageCircle className="w-5 h-5" />;
      case 'follow':
        return <UserPlus className="w-5 h-5" />;
      case 'dm':
        return <Send className="w-5 h-5" />;
      default:
        return null;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'like':
        return 'text-accent-danger bg-accent-danger/10';
      case 'comment':
        return 'text-accent-primary bg-accent-primary/10';
      case 'follow':
        return 'text-accent-success bg-accent-success/10';
      case 'dm':
        return 'text-accent-primary bg-accent-primary/10';
      default:
        return 'text-text-secondary bg-noir-border/20';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
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

  const selectedPlatformInfo = getPlatformInfo(selectedPlatform);

  return (
    <div className="min-h-screen bg-noir-bg">
      <div className="px-4 py-6 pb-24 max-w-3xl mx-auto space-y-6">
        {/* Section 1: Platform Selector and Connection Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-black text-text-primary">Connected Platforms</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {PLATFORMS.map((platform, index) => {
              const status = platformStatus[platform.id];
              const isConnected = status?.connected;

              return (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 rounded-xl border-2 transition-all duration-200 space-y-3 ${
                    selectedPlatform === platform.id
                      ? 'bg-accent-primary/20 border-accent-primary'
                      : 'bg-noir-surface border-noir-border hover:border-accent-primary/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{platform.icon}</span>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">{platform.name}</h3>
                        {isConnected && status?.account_name && (
                          <p className="text-xs text-accent-success font-semibold">
                            {status.account_name}
                          </p>
                        )}
                      </div>
                    </div>
                    {isConnected && (
                      <CheckCircle2 className="w-5 h-5 text-accent-success flex-shrink-0" />
                    )}
                  </div>

                  {isConnected ? (
                    <motion.button
                      onClick={() => handleDisconnectPlatform(platform.id)}
                      disabled={connecting[platform.id]}
                      className="w-full px-3 py-2 bg-accent-danger/10 hover:bg-accent-danger/20 text-accent-danger rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2 min-h-[40px]"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <LogOut className="w-4 h-4" />
                      {connecting[platform.id] ? 'Disconnecting...' : 'Disconnect'}
                    </motion.button>
                  ) : (
                    <motion.button
                      onClick={() => handleConnectPlatform(platform.id)}
                      disabled={connecting[platform.id]}
                      className="w-full px-3 py-2 bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[40px]"
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

          <h2 className="text-lg font-black text-text-primary pt-4">Select Platform</h2>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {PLATFORMS.map((platform, index) => (
              <motion.button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-shrink-0 px-4 py-3 rounded-xl border-2 transition-all duration-200 flex items-center gap-2 min-h-[44px] ${
                  selectedPlatform === platform.id
                    ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
                    : 'bg-noir-surface border-noir-border text-text-secondary hover:border-accent-primary/50'
                }`}
              >
                <span className="text-xl">{platform.icon}</span>
                <span className="text-sm font-semibold whitespace-nowrap">{platform.name}</span>
                <motion.div
                  className={`w-2 h-2 rounded-full ml-1 ${
                    selectedPlatform === platform.id ? 'bg-accent-primary' : 'bg-text-muted'
                  }`}
                  animate={{
                    scale: selectedPlatform === platform.id ? [1, 1.2, 1] : 1,
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Section 2: Bot Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-accent-primary/15 to-accent-primary/5 border-2 border-accent-primary/30 rounded-2xl p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                {botEnabled && (
                  <motion.div
                    className="w-3 h-3 rounded-full bg-accent-success"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
                <h3 className="text-xl font-black text-text-primary">
                  Engagement Bot {selectedPlatformInfo && `on ${selectedPlatformInfo.name}`}
                </h3>
              </div>
              <p className="text-sm text-text-secondary">
                {botEnabled
                  ? `Active and engaging on ${selectedPlatformInfo?.name}`
                  : `Enable to start automated engagement on ${selectedPlatformInfo?.name}`}
              </p>
            </div>
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

        {/* Section 3: What the Bot Does */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-black text-text-primary">Bot Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {BOT_ACTIONS.map((action, index) => (
              <motion.div
                key={action.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 + index * 0.05 }}
                className="bg-noir-surface border border-noir-border rounded-xl p-4 space-y-3"
              >
                <div className="text-3xl">{action.icon}</div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-text-primary">{action.title}</h4>
                  <p className="text-xs text-text-muted leading-tight">{action.description}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-noir-border">
                  <span className="text-xs text-text-muted font-semibold">{action.rateLimit}</span>
                  <motion.button
                    onClick={() => handleToggleAction(action.id)}
                    className={`relative inline-flex w-10 h-6 items-center rounded-full transition-all duration-300 flex-shrink-0 min-h-[44px]`}
                    style={{
                      backgroundColor: actionStates[action.id as keyof typeof actionStates] ? 'rgb(108, 92, 231)' : 'rgb(46, 46, 62)',
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <motion.span
                      className="inline-block h-5 w-5 rounded-full bg-white shadow-lg"
                      animate={{
                        x: actionStates[action.id as keyof typeof actionStates] ? 20 : 2,
                      }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Section 4: Activity Feed */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <h2 className="text-lg font-black text-text-primary">Activity Timeline</h2>
          <div className="space-y-2">
            {activities.length === 0 ? (
              <div className="bg-noir-surface border border-noir-border rounded-xl p-8 text-center">
                <p className="text-text-muted">No activity yet. Enable the bot to start.</p>
              </div>
            ) : (
              activities.map((activity, index) => {
                const platformInfo = getPlatformInfo(activity.platform);
                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35 + index * 0.03 }}
                    className="bg-noir-surface border border-noir-border rounded-xl p-4 space-y-3"
                  >
                    {/* Header: Platform, Action, Time, Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{platformInfo?.icon}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-accent-primary uppercase tracking-wide">
                              {platformInfo?.name}
                            </span>
                            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${getActionColor(activity.action)}`}>
                              {getActionIcon(activity.action)}
                              {activity.action}
                            </div>
                          </div>
                          <p className="text-xs text-text-muted mt-0.5 font-semibold">{activity.target}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activity.success && (
                          <CheckCircle2 className="w-4 h-4 text-accent-success flex-shrink-0" />
                        )}
                        <span className="text-xs text-text-muted whitespace-nowrap">
                          {formatTime(activity.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Content: Comment text or Post title */}
                    {activity.action === 'comment' && activity.content && (
                      <div className="bg-noir-bg rounded-lg p-3 border-l-2 border-accent-primary">
                        <p className="text-sm text-text-primary leading-relaxed italic">
                          "{activity.content}"
                        </p>
                      </div>
                    )}

                    {(activity.action === 'like' || (activity.action === 'comment' && activity.postTitle)) && activity.postTitle && (
                      <div className="bg-noir-bg rounded-lg p-3 border border-noir-border">
                        <p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">
                          {activity.action === 'like' ? 'Post Liked' : 'Post'}
                        </p>
                        <p className="text-sm font-semibold text-text-primary">{activity.postTitle}</p>
                      </div>
                    )}

                    {activity.action === 'follow' && activity.username && (
                      <div className="bg-noir-bg rounded-lg p-3 border border-noir-border">
                        <p className="text-xs text-text-muted uppercase tracking-wide font-semibold mb-1">Followed User</p>
                        <p className="text-sm font-semibold text-text-primary">@{activity.username}</p>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Section 5: Target Hashtags */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-noir-surface border border-noir-border rounded-2xl p-6 space-y-4"
        >
          <h3 className="text-lg font-black text-text-primary">Target Hashtags</h3>
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

        {/* Section 6: Comment Templates */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-noir-surface border border-noir-border rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
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
                className="space-y-3 p-4 bg-noir-bg border border-noir-border rounded-xl"
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

        <div className="h-8" />
      </div>
    </div>
  );
}
