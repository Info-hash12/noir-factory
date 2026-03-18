import { useEffect, useState } from 'react';
import { useContentStore } from '../store/contentStore';
import { motion, Reorder } from 'framer-motion';
import { CheckCircle, Clock, AlertCircle, Loader, Share2, RotateCcw, ChevronDown, Layers2, TrendingUp, TrendingDown, GripVertical } from 'lucide-react';
import * as api from '../lib/api';

const STATUS_CONFIG = {
  queued: { icon: Clock, color: 'text-text-secondary', bg: 'bg-noir-border/20' },
  processing: { icon: Loader, color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
  ready: { icon: CheckCircle, color: 'text-accent-success', bg: 'bg-accent-success/10' },
  failed: { icon: AlertCircle, color: 'text-accent-danger', bg: 'bg-accent-danger/10' },
  published: { icon: Share2, color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
};

export function QueuePage() {
  const { jobs, loadingJobs, fetchContentJobs } = useContentStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [batchCountdown, setBatchCountdown] = useState(0);
  const [isProcessingNow, setIsProcessingNow] = useState(false);
  const [queuedJobs, setQueuedJobs] = useState<typeof jobs>([]);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    fetchContentJobs();
    const interval = setInterval(fetchContentJobs, 5000);
    return () => clearInterval(interval);
  }, [fetchContentJobs]);

  // Update queued jobs list whenever jobs change
  useEffect(() => {
    const queued = jobs.filter(j => j.status === 'queued');
    setQueuedJobs(queued);
  }, [jobs]);

  // Batch countdown timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (batchCountdown > 0) {
      interval = setInterval(() => {
        setBatchCountdown(prev => prev > 0 ? prev - 1 : 0);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [batchCountdown]);

  // Initialize batch countdown on mount
  useEffect(() => {
    setBatchCountdown(Math.floor(Math.random() * 300) + 60); // 1-5 minutes
  }, []);

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

  const handleProcessNow = async () => {
    setIsProcessingNow(true);
    try {
      await fetchContentJobs();
      setBatchCountdown(Math.floor(Math.random() * 300) + 60);
    } catch (error) {
      console.error('Failed to process batch:', error);
    } finally {
      setIsProcessingNow(false);
    }
  };

  const handleReorderQueued = async (reorderedJobs: typeof jobs) => {
    setIsReordering(true);
    try {
      const jobIds = reorderedJobs.map(j => j.id);
      await api.reorderContentJobs(jobIds);
      setQueuedJobs(reorderedJobs);
      await fetchContentJobs();
    } catch (error) {
      console.error('Failed to reorder jobs:', error);
      // Revert on error
      const queued = jobs.filter(j => j.status === 'queued');
      setQueuedJobs(queued);
    } finally {
      setIsReordering(false);
    }
  };

  // Calculate stats by status
  const stats = {
    queued: jobs.filter(j => j.status === 'queued').length,
    processing: jobs.filter(j => j.status === 'processing').length,
    ready: jobs.filter(j => j.status === 'ready').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    published: jobs.filter(j => j.status === 'published').length,
  };

  // Calculate cost metrics
  const calculateCosts = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const todayTotal = jobs
      .filter(j => {
        const jobDate = new Date(j.created_at);
        jobDate.setHours(0, 0, 0, 0);
        return jobDate.getTime() === today.getTime();
      })
      .reduce((sum, j) => sum + (j.generation_cost_estimate || 0), 0);

    const monthlyTotal = jobs
      .filter(j => {
        const jobDate = new Date(j.created_at);
        return jobDate >= monthStart && jobDate <= today;
      })
      .reduce((sum, j) => sum + (j.generation_cost_estimate || 0), 0);

    const queueTotal = jobs
      .filter(j => j.status === 'queued')
      .reduce((sum, j) => sum + (j.generation_cost_estimate || 0), 0);

    return { today: todayTotal, monthly: monthlyTotal, queue: queueTotal };
  };

  const costs = calculateCosts();
  const costTrend = Math.random() > 0.5 ? 1 : -1; // Mock trend

  if (loadingJobs) {
    return (
      <div className="min-h-screen bg-noir-bg flex items-center justify-center px-4">
        <div className="text-center">
          <motion.div
            className="w-12 h-12 rounded-full border-4 border-noir-border border-t-accent-primary mx-auto mb-4"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-text-secondary">Loading queue...</p>
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="min-h-screen bg-noir-bg flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-noir-surface border border-noir-border flex items-center justify-center">
            <Layers2 className="w-8 h-8 text-text-muted" />
          </div>
          <p className="text-text-secondary">No jobs yet</p>
          <p className="text-text-muted text-sm">Approve content from Feed to create jobs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-noir-bg">
      {/* Cost Summary Section */}
      <div className="sticky top-20 z-20 bg-noir-bg/95 backdrop-blur-sm border-b border-noir-border px-4 py-4 space-y-4">
        {/* Cost Cards */}
        <div className="grid grid-cols-3 gap-3">
          <motion.div
            className="bg-noir-surface border border-noir-border rounded-xl p-3"
            whileHover={{ y: -2 }}
          >
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Today</p>
            <p className="text-xl font-black text-accent-primary">${costs.today.toFixed(2)}</p>
          </motion.div>

          <motion.div
            className="bg-noir-surface border border-noir-border rounded-xl p-3"
            whileHover={{ y: -2 }}
          >
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">This Month</p>
            <p className="text-xl font-black text-accent-primary">${costs.monthly.toFixed(2)}</p>
          </motion.div>

          <motion.div
            className="bg-noir-surface border border-noir-border rounded-xl p-3"
            whileHover={{ y: -2 }}
          >
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Queue</p>
            <div className="flex items-center gap-1">
              <p className="text-xl font-black text-accent-primary">${costs.queue.toFixed(2)}</p>
              {costTrend > 0 ? (
                <TrendingUp className="w-4 h-4 text-accent-danger" />
              ) : (
                <TrendingDown className="w-4 h-4 text-accent-success" />
              )}
            </div>
          </motion.div>
        </div>

        {/* Batch Processing Section */}
        <div className="bg-noir-surface border border-noir-border rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary mb-1">Batch Processing</p>
              <p className="text-xs text-text-muted">
                {stats.queued} queued {stats.queued !== 1 ? 'jobs' : 'job'}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                Next batch runs in:{' '}
                <span className="font-black text-accent-primary">
                  {Math.floor(batchCountdown / 60)}m {batchCountdown % 60}s
                </span>
              </p>
            </div>

            <motion.button
              onClick={handleProcessNow}
              disabled={isProcessingNow}
              className="px-4 py-2 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isProcessingNow ? 'Processing...' : 'Process Now'}
            </motion.button>
          </div>
        </div>

        {/* Status Stats */}
        <div className="grid grid-cols-5 gap-2">
          {stats.processing > 0 && (
            <motion.div
              className="bg-noir-surface border border-noir-border rounded-xl p-2 text-center"
              whileHover={{ y: -2 }}
            >
              <p className="text-xs text-text-muted uppercase tracking-wider">Processing</p>
              <p className="text-lg font-black text-accent-primary">{stats.processing}</p>
            </motion.div>
          )}
          {stats.queued > 0 && (
            <motion.div
              className="bg-noir-surface border border-noir-border rounded-xl p-2 text-center"
              whileHover={{ y: -2 }}
            >
              <p className="text-xs text-text-muted uppercase tracking-wider">Queued</p>
              <p className="text-lg font-black text-text-secondary">{stats.queued}</p>
            </motion.div>
          )}
          {stats.ready > 0 && (
            <motion.div
              className="bg-noir-surface border border-noir-border rounded-xl p-2 text-center"
              whileHover={{ y: -2 }}
            >
              <p className="text-xs text-text-muted uppercase tracking-wider">Ready</p>
              <p className="text-lg font-black text-accent-success">{stats.ready}</p>
            </motion.div>
          )}
          {stats.failed > 0 && (
            <motion.div
              className="bg-noir-surface border border-noir-border rounded-xl p-2 text-center"
              whileHover={{ y: -2 }}
            >
              <p className="text-xs text-text-muted uppercase tracking-wider">Failed</p>
              <p className="text-lg font-black text-accent-danger">{stats.failed}</p>
            </motion.div>
          )}
          {stats.published > 0 && (
            <motion.div
              className="bg-noir-surface border border-noir-border rounded-xl p-2 text-center"
              whileHover={{ y: -2 }}
            >
              <p className="text-xs text-text-muted uppercase tracking-wider">Published</p>
              <p className="text-lg font-black text-accent-primary">{stats.published}</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Jobs List */}
      <div className="p-4 pb-24">
        {/* Queued Jobs - Reorderable */}
        {queuedJobs.length > 0 && (
          <div className="space-y-3 mb-6">
            <div className="px-2 py-1">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2">
                <GripVertical className="w-4 h-4" />
                Queued (Drag to Reorder)
              </p>
            </div>
            <Reorder.Group
              axis="y"
              values={queuedJobs}
              onReorder={handleReorderQueued}
              className="space-y-3"
              disabled={isReordering}
            >
              {queuedJobs.map((job, index) => {
                const statusConfig = STATUS_CONFIG.queued;
                const StatusIcon = statusConfig.icon;
                const isExpanded = expandedId === job.id;

                return (
                  <Reorder.Item
                    key={job.id}
                    value={job}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-noir-surface border border-noir-border rounded-2xl overflow-hidden hover:border-accent-primary/30 transition-all cursor-grab active:cursor-grabbing hover:shadow-lg hover:shadow-accent-primary/10"
                  >
                    <motion.button
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className="w-full p-4 text-left flex items-start gap-3 min-h-[44px] group"
                      whileHover={{ paddingLeft: 20 }}
                    >
                      {/* Grip handle */}
                      <div className="flex-shrink-0 text-text-muted/40 group-hover:text-text-muted/70 transition-colors mt-1">
                        <div className="flex flex-col gap-0.5">
                          <div className="w-1 h-1 rounded-full bg-current"></div>
                          <div className="w-1 h-1 rounded-full bg-current"></div>
                          <div className="w-1 h-1 rounded-full bg-current"></div>
                          <div className="w-1 h-1 rounded-full bg-current"></div>
                        </div>
                      </div>

                      <div className={`${statusConfig.bg} rounded-xl p-2.5 flex-shrink-0`}>
                        <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                            {job.job_type.replace(/_/g, ' ')}
                          </span>
                          <motion.span
                            className={`text-xs font-black px-2.5 py-1 rounded-full ${statusConfig.bg} ${statusConfig.color} uppercase tracking-wider`}
                          >
                            {job.status}
                          </motion.span>
                          {job.generation_cost_estimate && (
                            <span className="ml-auto text-xs font-semibold text-accent-primary">
                              ${job.generation_cost_estimate.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-text-primary font-semibold line-clamp-1">
                          {job.target_platforms?.join(', ') || 'No platforms'}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {new Date(job.created_at).toLocaleDateString()} at {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex-shrink-0 text-text-muted"
                      >
                        <ChevronDown className="w-5 h-5" />
                      </motion.div>
                    </motion.button>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-noir-border p-4 space-y-4 bg-noir-surface/50"
                      >
                        <div className="space-y-3 text-sm">
                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Job ID</p>
                            <p className="text-text-secondary font-mono text-xs break-all bg-noir-bg/50 p-3 rounded-lg border border-noir-border">{job.id}</p>
                          </div>

                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Job Type</p>
                            <p className="text-text-primary font-semibold">{job.job_type.replace(/_/g, ' ')}</p>
                          </div>

                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Target Platforms</p>
                            <div className="flex flex-wrap gap-2">
                              {job.target_platforms?.map((platform) => (
                                <span
                                  key={platform}
                                  className="px-3 py-1.5 bg-noir-bg border border-noir-border text-text-secondary text-xs rounded-lg font-medium"
                                >
                                  {platform}
                                </span>
                              ))}
                            </div>
                          </div>

                          {job.generation_cost_estimate && (
                            <div>
                              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Cost Estimate</p>
                              <p className="text-accent-primary font-bold">${job.generation_cost_estimate.toFixed(2)}</p>
                            </div>
                          )}

                          {job.layout_type && (
                            <div>
                              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Layout</p>
                              <p className="text-text-primary font-semibold">{job.layout_type}</p>
                            </div>
                          )}

                          {job.first_comment && (
                            <div>
                              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">First Comment</p>
                              <p className="text-text-secondary text-xs bg-noir-bg/50 p-3 rounded-lg border border-noir-border">
                                {job.first_comment}
                              </p>
                            </div>
                          )}

                          {job.caption_text && (
                            <div>
                              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Caption</p>
                              <p className="text-text-secondary text-xs bg-noir-bg/50 p-3 rounded-lg border border-noir-border line-clamp-2">
                                {job.caption_text}
                              </p>
                            </div>
                          )}

                          {job.is_evergreen && (
                            <div>
                              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Evergreen</p>
                              <p className="text-text-primary font-semibold">
                                Every {job.evergreen_interval_days} days
                              </p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        )}

        {/* Non-Queued Jobs */}
        {jobs.filter(j => j.status !== 'queued').length > 0 && (
          <div className="space-y-3">
            {jobs.filter(j => j.status !== 'queued').map((job, index) => {
              const statusConfig =
                STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.queued;
              const StatusIcon = statusConfig.icon;
              const isExpanded = expandedId === job.id;

              return (
                <motion.div
                  key={job.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-noir-surface border border-noir-border rounded-2xl overflow-hidden hover:border-accent-primary/30 transition-colors"
                >
                  <motion.button
                    onClick={() => setExpandedId(isExpanded ? null : job.id)}
                    className="w-full p-4 text-left flex items-start gap-4 min-h-[44px] group"
                    whileHover={{ paddingLeft: 20 }}
                  >
                    <div className={`${statusConfig.bg} rounded-xl p-2.5 mt-1 flex-shrink-0`}>
                      <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                          {job.job_type.replace(/_/g, ' ')}
                        </span>
                        <motion.span
                          className={`text-xs font-black px-2.5 py-1 rounded-full ${statusConfig.bg} ${statusConfig.color} uppercase tracking-wider`}
                          animate={job.status === 'processing' ? { scale: [1, 1.02, 1] } : {}}
                          transition={job.status === 'processing' ? { duration: 2, repeat: Infinity } : {}}
                        >
                          {job.status}
                        </motion.span>
                        {job.generation_cost_estimate && (
                          <span className="ml-auto text-xs font-semibold text-accent-primary">
                            ${job.generation_cost_estimate.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-primary font-semibold line-clamp-1">
                        {job.target_platforms?.join(', ') || 'No platforms'}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        {new Date(job.created_at).toLocaleDateString()} at {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <motion.div
                      animate={{ rotate: isExpanded ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex-shrink-0 text-text-muted"
                    >
                      <ChevronDown className="w-5 h-5" />
                    </motion.div>
                  </motion.button>

                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-noir-border p-4 space-y-4 bg-noir-surface/50"
                    >
                      <div className="space-y-3 text-sm">
                        <div>
                          <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Job ID</p>
                          <p className="text-text-secondary font-mono text-xs break-all bg-noir-bg/50 p-3 rounded-lg border border-noir-border">{job.id}</p>
                        </div>

                        <div>
                          <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Job Type</p>
                          <p className="text-text-primary font-semibold">{job.job_type.replace(/_/g, ' ')}</p>
                        </div>

                        <div>
                          <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Target Platforms</p>
                          <div className="flex flex-wrap gap-2">
                            {job.target_platforms?.map((platform) => (
                              <span
                                key={platform}
                                className="px-3 py-1.5 bg-noir-bg border border-noir-border text-text-secondary text-xs rounded-lg font-medium"
                              >
                                {platform}
                              </span>
                            ))}
                          </div>
                        </div>

                        {job.generation_cost_estimate && (
                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Cost Estimate</p>
                            <p className="text-accent-primary font-bold">${job.generation_cost_estimate.toFixed(2)}</p>
                          </div>
                        )}

                        {job.layout_type && (
                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Layout</p>
                            <p className="text-text-primary font-semibold">{job.layout_type}</p>
                          </div>
                        )}

                        {job.first_comment && (
                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">First Comment</p>
                            <p className="text-text-secondary text-xs bg-noir-bg/50 p-3 rounded-lg border border-noir-border">
                              {job.first_comment}
                            </p>
                          </div>
                        )}

                        {job.caption_text && (
                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Caption</p>
                            <p className="text-text-secondary text-xs bg-noir-bg/50 p-3 rounded-lg border border-noir-border line-clamp-2">
                              {job.caption_text}
                            </p>
                          </div>
                        )}

                        {job.is_evergreen && (
                          <div>
                            <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Evergreen</p>
                            <p className="text-text-primary font-semibold">
                              Every {job.evergreen_interval_days} days
                            </p>
                          </div>
                        )}

                        {job.error_message && (
                          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3">
                            <p className="text-accent-danger text-xs font-mono">{job.error_message}</p>
                          </div>
                        )}
                      </div>

                      {job.status === 'failed' && (
                        <motion.button
                          onClick={() => handleRetry(job.id)}
                          disabled={retryingId === job.id}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <RotateCcw className={`w-5 h-5 ${retryingId === job.id ? 'animate-spin' : ''}`} />
                          Retry Job
                        </motion.button>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  );
}
