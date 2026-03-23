import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import * as api from '../lib/api';
import { useContentStore } from '../store/contentStore';
import { motion, Reorder } from 'framer-motion';
import { CheckCircle, Clock, AlertCircle, Loader, Share2, RotateCcw, ChevronDown, Layers2, TrendingUp, TrendingDown, GripVertical, Play, Pause } from 'lucide-react';

const STATUS_CONFIG = {
  queued: { icon: Clock, color: 'text-text-secondary', bg: 'bg-noir-border/20' },
  processing: { icon: Loader, color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
  ready: { icon: CheckCircle, color: 'text-accent-success', bg: 'bg-accent-success/10' },
  failed: { icon: AlertCircle, color: 'text-accent-danger', bg: 'bg-accent-danger/10' },
  published: { icon: Share2, color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
};

// Isolated countdown component — ticks every second without re-rendering parent
const BatchCountdown = memo(({ initialSeconds }: { initialSeconds: number }) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds > 0]);
  return (
    <span className="font-black text-accent-primary">
      {Math.floor(seconds / 60)}m {String(seconds % 60).padStart(2, '0')}s
    </span>
  );
});

export function QueuePage() {
  const { jobs, loadingJobs, fetchContentJobs } = useContentStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isProcessingNow, setIsProcessingNow] = useState(false);
  const [queuedJobs, setQueuedJobs] = useState<typeof jobs>([]);
  const [isReordering, setIsReordering] = useState(false);
  const [batchEnabled, setBatchEnabled] = useState(true);
  const [nextBatchSeconds] = useState(() => Math.floor(Math.random() * 300) + 60);

  useEffect(() => {
    fetchContentJobs(true);
    const interval = setInterval(() => fetchContentJobs(false), 10000);
    return () => clearInterval(interval);
  }, [fetchContentJobs]);

  // Only update queuedJobs when job IDs actually change
  useEffect(() => {
    const queued = jobs.filter(j => j.status === 'queued' || j.review_status === 'pending_review');
    setQueuedJobs(prev => {
      const prevIds = prev.map(j => j.id).join(',');
      const newIds = queued.map(j => j.id).join(',');
      return prevIds === newIds ? prev : queued;
    });
  }, [jobs]);

  const handleRetry = useCallback(async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await (api as any).retryContentJob(jobId);
      await fetchContentJobs(false);
    } catch (error) {
      console.error('Failed to retry job:', error);
    } finally {
      setRetryingId(null);
    }
  }, [fetchContentJobs]);

  const handleProcessNow = useCallback(async () => {
    setIsProcessingNow(true);
    try {
      await fetchContentJobs(false);
    } catch (error) {
      console.error('Failed to process batch:', error);
    } finally {
      setIsProcessingNow(false);
    }
  }, [fetchContentJobs]);

  const handleReorderQueued = useCallback(async (reorderedJobs: typeof jobs) => {
    setIsReordering(true);
    setQueuedJobs(reorderedJobs);
    try {
      const jobIds = reorderedJobs.map(j => j.id);
      await (api as any).reorderContentJobs(jobIds);
    } catch (error) {
      console.error('Failed to reorder jobs:', error);
      const queued = jobs.filter(j => j.status === 'queued');
      setQueuedJobs(queued);
    } finally {
      setIsReordering(false);
    }
  }, [jobs]);

  // Memoized stats — only recalculate when jobs change
  const stats = useMemo(() => ({
    queued: jobs.filter(j => j.status === 'queued').length,
    processing: jobs.filter(j => j.status === 'processing').length,
    ready: jobs.filter(j => j.status === 'ready').length,
    failed: jobs.filter(j => j.status === 'failed').length,
    published: jobs.filter(j => j.status === 'published').length,
  }), [jobs]);

  // Memoized costs — only recalculate when jobs change
  const costs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayTotal = jobs
      .filter(j => { const d = new Date(j.created_at); d.setHours(0,0,0,0); return d.getTime() === today.getTime(); })
      .reduce((s, j) => s + (j.generation_cost_estimate || 0), 0);
    const monthlyTotal = jobs
      .filter(j => { const d = new Date(j.created_at); return d >= monthStart; })
      .reduce((s, j) => s + (j.generation_cost_estimate || 0), 0);
    const queueTotal = jobs
      .filter(j => j.status === 'queued')
      .reduce((s, j) => s + (j.generation_cost_estimate || 0), 0);
    return { today: todayTotal, monthly: monthlyTotal, queue: queueTotal };
  }, [jobs]);

  // Memoized non-queued jobs list
  const nonQueuedJobs = useMemo(() => jobs.filter(j => j.status !== 'queued'), [jobs]);

  if (loadingJobs && jobs.length === 0) {
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
      {/* Header */}
      <div className="sticky top-0 z-20 bg-noir-bg/95 backdrop-blur-sm border-b border-noir-border px-4 py-4 space-y-4">
        {/* Cost Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-noir-surface border border-noir-border rounded-xl p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Today</p>
            <p className="text-xl font-black text-accent-primary">${costs.today.toFixed(2)}</p>
          </div>
          <div className="bg-noir-surface border border-noir-border rounded-xl p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">This Month</p>
            <p className="text-xl font-black text-accent-primary">${costs.monthly.toFixed(2)}</p>
          </div>
          <div className="bg-noir-surface border border-noir-border rounded-xl p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Queue</p>
            <p className="text-xl font-black text-accent-primary">${costs.queue.toFixed(2)}</p>
          </div>
        </div>

        {/* Batch Processing */}
        <div className="bg-noir-surface border border-noir-border rounded-xl p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-text-primary">Batch Processing</p>
                {/* Toggle */}
                <button
                  onClick={() => setBatchEnabled(e => !e)}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 flex-shrink-0 ${batchEnabled ? 'bg-accent-primary' : 'bg-noir-border'}`}
                >
                  <motion.div
                    className="absolute top-0.5 left-0.5 w-4 h-4 bg-noir-bg rounded-full shadow"
                    animate={{ x: batchEnabled ? 20 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                </button>
                <span className={`text-xs font-semibold ${batchEnabled ? 'text-accent-primary' : 'text-text-muted'}`}>
                  {batchEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <p className="text-xs text-text-muted">{stats.queued} queued {stats.queued !== 1 ? 'jobs' : 'job'}</p>
              {batchEnabled && (
                <p className="text-xs text-text-secondary mt-1">
                  Next batch in: <BatchCountdown initialSeconds={nextBatchSeconds} />
                </p>
              )}
            </div>
            <motion.button
              onClick={handleProcessNow}
              disabled={isProcessingNow || !batchEnabled}
              className="px-4 py-2 bg-accent-primary hover:shadow-lg hover:shadow-accent-primary/30 text-noir-bg rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm flex-shrink-0"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isProcessingNow ? 'Processing...' : batchEnabled ? 'Process Now' : 'Paused'}
            </motion.button>
          </div>
        </div>

        {/* Status Stats */}
        {(stats.processing > 0 || stats.queued > 0 || stats.ready > 0 || stats.failed > 0 || stats.published > 0) && (
          <div className="flex gap-2 overflow-x-auto">
            {stats.processing > 0 && <div className="bg-noir-surface border border-noir-border rounded-xl px-3 py-2 text-center flex-shrink-0"><p className="text-xs text-text-muted uppercase tracking-wider">Processing</p><p className="text-lg font-black text-accent-primary">{stats.processing}</p></div>}
            {stats.queued > 0 && <div className="bg-noir-surface border border-noir-border rounded-xl px-3 py-2 text-center flex-shrink-0"><p className="text-xs text-text-muted uppercase tracking-wider">Queued</p><p className="text-lg font-black text-text-secondary">{stats.queued}</p></div>}
            {stats.ready > 0 && <div className="bg-noir-surface border border-noir-border rounded-xl px-3 py-2 text-center flex-shrink-0"><p className="text-xs text-text-muted uppercase tracking-wider">Ready</p><p className="text-lg font-black text-accent-success">{stats.ready}</p></div>}
            {stats.failed > 0 && <div className="bg-noir-surface border border-noir-border rounded-xl px-3 py-2 text-center flex-shrink-0"><p className="text-xs text-text-muted uppercase tracking-wider">Failed</p><p className="text-lg font-black text-accent-danger">{stats.failed}</p></div>}
            {stats.published > 0 && <div className="bg-noir-surface border border-noir-border rounded-xl px-3 py-2 text-center flex-shrink-0"><p className="text-xs text-text-muted uppercase tracking-wider">Published</p><p className="text-lg font-black text-accent-primary">{stats.published}</p></div>}
          </div>
        )}
      </div>

      {/* Jobs List */}
      <div className="p-4 pb-24 space-y-6">
        {/* Queued — draggable */}
        {queuedJobs.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center gap-2 px-1">
              <GripVertical className="w-4 h-4" /> Queued · Drag to reorder
            </p>
            <Reorder.Group axis="y" values={queuedJobs} onReorder={handleReorderQueued} className="space-y-3" disabled={isReordering}>
              {queuedJobs.map(job => {
                const isExpanded = expandedId === job.id;
                return (
                  <Reorder.Item
                    key={job.id}
                    value={job}
                    initial={false}
                    className="bg-noir-surface border border-noir-border rounded-2xl overflow-hidden hover:border-accent-primary/30 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : job.id)}
                      className="w-full p-4 text-left flex items-start gap-3 min-h-[44px]"
                    >
                      <div className="flex-shrink-0 text-text-muted/40 mt-1">
                        <div className="flex flex-col gap-0.5">
                          {[0,1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-current" />)}
                        </div>
                      </div>
                      <div className="bg-noir-border/20 rounded-xl p-2.5 flex-shrink-0">
                        <Clock className="w-5 h-5 text-text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{job.job_type?.replace(/_/g, ' ') || 'video with avatar'}</span>
                          <span className="text-xs font-black px-2 py-0.5 rounded-full bg-noir-border/20 text-text-secondary uppercase tracking-wider">queued</span>
                        </div>
                        <p className="text-sm text-text-primary font-semibold">{job.target_platforms?.join(', ') || 'No platforms'}</p>
                        <p className="text-xs text-text-muted mt-0.5">{new Date(job.created_at).toLocaleDateString()} at {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0 text-text-muted mt-1">
                        <ChevronDown className="w-5 h-5" />
                      </motion.div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-noir-border p-4 space-y-3 text-sm bg-noir-surface/50">
                        <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Job ID</p><p className="text-text-secondary font-mono text-xs break-all bg-noir-bg/50 p-2 rounded-lg border border-noir-border">{job.id}</p></div>
                        <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Platforms</p><div className="flex flex-wrap gap-2">{job.target_platforms?.map(p => <span key={p} className="px-2 py-1 bg-noir-bg border border-noir-border text-text-secondary text-xs rounded-lg">{p}</span>)}</div></div>
                        {job.layout_type && <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Layout</p><p className="text-text-primary font-semibold">{job.layout_type}</p></div>}
                        {job.caption_text && <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Caption</p><p className="text-text-secondary text-xs bg-noir-bg/50 p-2 rounded-lg border border-noir-border line-clamp-2">{job.caption_text}</p></div>}
                      </div>
                    )}
                  </Reorder.Item>
                );
              })}
            </Reorder.Group>
          </div>
        )}

        {/* Non-queued jobs */}
        {nonQueuedJobs.length > 0 && (
          <div className="space-y-3">
            {nonQueuedJobs.map(job => {
              const statusConfig = STATUS_CONFIG[job.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.queued;
              const StatusIcon = statusConfig.icon;
              const isExpanded = expandedId === job.id;
              return (
                <div key={job.id} className="bg-noir-surface border border-noir-border rounded-2xl overflow-hidden hover:border-accent-primary/30 transition-colors">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : job.id)}
                    className="w-full p-4 text-left flex items-start gap-3 min-h-[44px]"
                  >
                    <div className={`${statusConfig.bg} rounded-xl p-2.5 flex-shrink-0`}>
                      <StatusIcon className={`w-5 h-5 ${statusConfig.color} ${job.status === 'processing' ? 'animate-spin' : ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">{job.job_type?.replace(/_/g, ' ') || 'video with avatar'}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.color} uppercase tracking-wider`}>{job.status}</span>
                      </div>
                      <p className="text-sm text-text-primary font-semibold">{job.target_platforms?.join(', ') || 'No platforms'}</p>
                      <p className="text-xs text-text-muted mt-0.5">{new Date(job.created_at).toLocaleDateString()} at {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0 text-text-muted mt-1">
                      <ChevronDown className="w-5 h-5" />
                    </motion.div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-noir-border p-4 space-y-3 text-sm bg-noir-surface/50">
                      <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Job ID</p><p className="text-text-secondary font-mono text-xs break-all bg-noir-bg/50 p-2 rounded-lg border border-noir-border">{job.id}</p></div>
                      <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Platforms</p><div className="flex flex-wrap gap-2">{job.target_platforms?.map(p => <span key={p} className="px-2 py-1 bg-noir-bg border border-noir-border text-text-secondary text-xs rounded-lg">{p}</span>)}</div></div>
                      {job.layout_type && <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Layout</p><p className="text-text-primary font-semibold">{job.layout_type}</p></div>}
                      {job.generation_cost_estimate && <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Cost</p><p className="text-accent-primary font-bold">${job.generation_cost_estimate.toFixed(2)}</p></div>}
                      {job.caption_text && <div><p className="text-text-muted text-xs uppercase tracking-wider mb-1">Caption</p><p className="text-text-secondary text-xs bg-noir-bg/50 p-2 rounded-lg border border-noir-border line-clamp-2">{job.caption_text}</p></div>}
                      {job.error_message && <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3"><p className="text-accent-danger text-xs font-mono">{job.error_message}</p></div>}
                      {job.status === 'failed' && (
                        <motion.button
                          onClick={() => handleRetry(job.id)}
                          disabled={retryingId === job.id}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-primary text-noir-bg rounded-xl font-semibold disabled:opacity-50 min-h-[44px]"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <RotateCcw className={`w-5 h-5 ${retryingId === job.id ? 'animate-spin' : ''}`} />
                          Retry Job
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
