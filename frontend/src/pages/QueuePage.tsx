import { useEffect, useState } from 'react';
import { useContentStore } from '../store/contentStore';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, AlertCircle, Loader, Share2, RotateCcw } from 'lucide-react';
import * as api from '../lib/api';

const STATUS_CONFIG = {
  queued: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500 bg-opacity-10' },
  processing: { icon: Loader, color: 'text-yellow-400', bg: 'bg-yellow-500 bg-opacity-10' },
  ready: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500 bg-opacity-10' },
  failed: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500 bg-opacity-10' },
  published: { icon: Share2, color: 'text-purple-400', bg: 'bg-purple-500 bg-opacity-10' },
};

export function QueuePage() {
  const { jobs, loadingJobs, fetchContentJobs } = useContentStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    fetchContentJobs();
    const interval = setInterval(fetchContentJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchContentJobs]);

  const handleRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await api.retryContentJob(jobId);
      await fetchContentJobs();
    } catch (error) {
      console.error('Failed to retry job:', error);
    } finally {
      setRetryingId(null);
    }
  };

  if (loadingJobs) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-gray-800 border-t-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading queue...</p>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 px-4">
        <div className="text-center">
          <p className="text-gray-400">No jobs yet. Approve content from Feed to create jobs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 pb-24">
      {jobs.map((job) => {
        const statusConfig =
          STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.queued;
        const StatusIcon = statusConfig.icon;
        const isExpanded = expandedId === job.id;

        return (
          <motion.div
            key={job.id}
            layout
            className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : job.id)}
              className="w-full p-4 text-left hover:bg-gray-800 transition-colors flex items-start gap-4 min-h-[44px]"
            >
              <div className={`${statusConfig.bg} rounded-lg p-2 mt-1`}>
                <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase">
                    {job.job_type.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-xs font-semibold ${statusConfig.color}`}
                  >
                    {job.status}
                  </span>
                </div>
                <p className="text-sm text-gray-300 line-clamp-1">
                  {job.target_platforms?.join(', ') || 'No platforms'}
                </p>
              </div>
            </button>

            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-gray-800 p-4 space-y-4 bg-gray-950"
              >
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-gray-400 mb-1">Job ID</p>
                    <p className="text-gray-200 font-mono text-xs break-all">{job.id}</p>
                  </div>

                  <div>
                    <p className="text-gray-400 mb-1">Status</p>
                    <span
                      className={`inline-block px-3 py-1 rounded text-xs font-semibold ${statusConfig.bg} ${statusConfig.color}`}
                    >
                      {job.status}
                    </span>
                  </div>

                  <div>
                    <p className="text-gray-400 mb-1">Job Type</p>
                    <p className="text-gray-200">{job.job_type.replace(/_/g, ' ')}</p>
                  </div>

                  <div>
                    <p className="text-gray-400 mb-1">Target Platforms</p>
                    <div className="flex flex-wrap gap-2">
                      {job.target_platforms?.map((platform) => (
                        <span
                          key={platform}
                          className="px-2 py-1 bg-gray-800 text-gray-300 text-xs rounded"
                        >
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>

                  {job.first_comment && (
                    <div>
                      <p className="text-gray-400 mb-1">First Comment</p>
                      <p className="text-gray-200 text-xs bg-gray-800 p-2 rounded">
                        {job.first_comment}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-gray-400 mb-1">Created</p>
                    <p className="text-gray-200 text-xs">
                      {new Date(job.created_at).toLocaleString()}
                    </p>
                  </div>

                  {job.error_message && (
                    <div className="bg-red-500 bg-opacity-10 border border-red-500 border-opacity-30 rounded p-3">
                      <p className="text-red-400 text-xs font-mono">{job.error_message}</p>
                    </div>
                  )}
                </div>

                {job.status === 'failed' && (
                  <button
                    onClick={() => handleRetry(job.id)}
                    disabled={retryingId === job.id}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 min-h-[44px]"
                  >
                    <RotateCcw className={`w-4 h-4 ${retryingId === job.id ? 'animate-spin' : ''}`} />
                    Retry
                  </button>
                )}
              </motion.div>
            )}
          </motion.div>
        );
      })}

      <div className="h-4" />
    </div>
  );
}
