import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Heart, MessageCircle, UserPlus } from 'lucide-react';
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

export function BotPage() {
  const [botEnabled, setBotEnabled] = useState(false);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState({ likes: 0, comments: 0, follows: 0 });
  const [loading, setLoading] = useState(true);
  const [showAddTemplate, setShowAddTemplate] = useState(false);

  useEffect(() => {
    loadBotData();
  }, []);

  const loadBotData = async () => {
    try {
      setLoading(true);
      const [status, hashtags, templates, activities] = await Promise.all([
        api.getEngagementStatus(),
        api.getEngagementHashtags(),
        api.getEngagementTemplates(),
        api.getEngagementActivities(),
      ]);

      setBotEnabled(status.enabled || false);
      setHashtags(hashtags.hashtags || []);
      setTemplates(templates || []);
      setActivities(activities || []);

      // Calculate stats
      const todayActivities = activities.filter(
        (a: Activity) =>
          new Date(a.timestamp).toDateString() === new Date().toDateString()
      );
      setStats({
        likes: todayActivities.filter((a: Activity) => a.type === 'like').length,
        comments: todayActivities.filter((a: Activity) => a.type === 'comment').length,
        follows: todayActivities.filter((a: Activity) => a.type === 'follow').length,
      });
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
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-gray-800 border-t-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading bot settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 pb-24">
      {/* Bot Toggle */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold mb-1">Engagement Bot</h3>
            <p className="text-sm text-gray-400">
              {botEnabled ? 'Active' : 'Inactive'}
            </p>
          </div>
          <button
            onClick={handleToggleBot}
            className={`relative inline-flex w-12 h-7 items-center rounded-full transition-colors min-h-[44px] min-w-[44px] ${
              botEnabled ? 'bg-blue-500' : 'bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                botEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <Heart className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <div className="text-2xl font-bold">{stats.likes}</div>
          <div className="text-xs text-gray-400 mt-1">Likes Today</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <MessageCircle className="w-6 h-6 text-blue-400 mx-auto mb-2" />
          <div className="text-2xl font-bold">{stats.comments}</div>
          <div className="text-xs text-gray-400 mt-1">Comments Today</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
          <UserPlus className="w-6 h-6 text-green-400 mx-auto mb-2" />
          <div className="text-2xl font-bold">{stats.follows}</div>
          <div className="text-xs text-gray-400 mt-1">Follows Today</div>
        </div>
      </div>

      {/* Hashtags */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold mb-4">Target Hashtags</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newHashtag}
              onChange={(e) => setNewHashtag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddHashtag()}
              placeholder="#hashtag"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm min-h-[44px]"
            />
            <button
              onClick={handleAddHashtag}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors min-h-[44px] min-w-[44px]"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <div
                key={tag}
                className="bg-blue-500 bg-opacity-20 text-blue-400 px-3 py-2 rounded-full flex items-center gap-2 text-sm"
              >
                <span>{tag}</span>
                <button
                  onClick={() => handleRemoveHashtag(tag)}
                  className="hover:text-blue-300 transition-colors min-h-[44px] min-w-[44px]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Templates */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Comment Templates</h3>
          <button
            onClick={() => setShowAddTemplate(!showAddTemplate)}
            className="w-9 h-9 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 min-h-[44px] min-w-[44px]"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {showAddTemplate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 mb-4 p-4 bg-gray-800 rounded-lg"
          >
            <input
              type="text"
              value={newTemplate.name}
              onChange={(e) =>
                setNewTemplate({ ...newTemplate, name: e.target.value })
              }
              placeholder="Template name"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-h-[44px]"
            />
            <textarea
              value={newTemplate.content}
              onChange={(e) =>
                setNewTemplate({ ...newTemplate, content: e.target.value })
              }
              placeholder="Comment template..."
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-sm min-h-[88px]"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddTemplate}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 min-h-[44px]"
              >
                Save
              </button>
              <button
                onClick={() => setShowAddTemplate(false)}
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        <div className="space-y-2">
          {templates.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No templates yet. Add one to get started.
            </p>
          ) : (
            templates.map((template) => (
              <div
                key={template.id}
                className="bg-gray-800 p-3 rounded-lg flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm mb-1">{template.name}</p>
                  <p className="text-xs text-gray-400 line-clamp-2">
                    {template.content}
                  </p>
                </div>
                <button
                  onClick={() => handleRemoveTemplate(template.id)}
                  className="flex-shrink-0 p-2 hover:bg-gray-700 rounded transition-colors min-h-[44px] min-w-[44px]"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <h3 className="font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No activity yet. Enable the bot to start.
            </p>
          ) : (
            activities.slice(0, 10).map((activity) => {
              const icons = {
                like: <Heart className="w-4 h-4 text-red-400" />,
                comment: <MessageCircle className="w-4 h-4 text-blue-400" />,
                follow: <UserPlus className="w-4 h-4 text-green-400" />,
              };

              return (
                <div key={activity.id} className="flex items-center gap-3 text-sm">
                  <div className="flex-shrink-0">
                    {icons[activity.type]}
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-300 capitalize">
                      {activity.type} on {activity.platform}
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}
