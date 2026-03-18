-- Migration: Budget Controls and Enhanced Tracking
-- Adds app_config table and extends content_jobs with cost tracking

-- ============================================
-- 1. Create app_config table
-- ============================================
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_app_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW
  EXECUTE FUNCTION update_app_config_timestamp();

-- Seed default configuration values
INSERT INTO app_config (key, value) VALUES
  ('videos_per_batch', '5'::jsonb),
  ('daily_cap', '25'::jsonb),
  ('monthly_cap', '500'::jsonb),
  ('hard_stop_spend_usd', '50.0'::jsonb),
  ('max_retries_per_stage', '3'::jsonb),
  ('one_off_spend_ceiling_usd', '5.0'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 2. Extend content_jobs table
-- ============================================

-- Add cost tracking columns
ALTER TABLE content_jobs
ADD COLUMN IF NOT EXISTS voice_profile_used TEXT,
ADD COLUMN IF NOT EXISTS prompt_hash TEXT,
ADD COLUMN IF NOT EXISTS render_settings_hash TEXT,
ADD COLUMN IF NOT EXISTS generation_cost_estimate REAL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS gpu_seconds REAL DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS openrouter_prompt_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS openrouter_completion_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS one_off_run BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_stage TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_jobs_created_at ON content_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_jobs_publish_status ON content_jobs(publish_status);
CREATE INDEX IF NOT EXISTS idx_content_jobs_processing_step ON content_jobs(processing_step);
CREATE INDEX IF NOT EXISTS idx_content_jobs_one_off_run ON content_jobs(one_off_run);
CREATE INDEX IF NOT EXISTS idx_content_jobs_failed_stage ON content_jobs(failed_stage);

-- ============================================
-- 3. Create views for dashboard
-- ============================================

-- View: Today's spend
CREATE OR REPLACE VIEW daily_spend AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_jobs,
  SUM(generation_cost_estimate) as total_cost,
  SUM(CASE WHEN publish_status = 'ready' THEN 1 ELSE 0 END) as successful_jobs,
  SUM(CASE WHEN publish_status = 'failed' THEN 1 ELSE 0 END) as failed_jobs
FROM content_jobs
WHERE created_at >= DATE_TRUNC('day', NOW())
GROUP BY DATE(created_at);

-- View: Monthly spend
CREATE OR REPLACE VIEW monthly_spend AS
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total_jobs,
  SUM(generation_cost_estimate) as total_cost,
  SUM(CASE WHEN publish_status = 'ready' THEN 1 ELSE 0 END) as successful_jobs,
  SUM(CASE WHEN publish_status = 'failed' THEN 1 ELSE 0 END) as failed_jobs
FROM content_jobs
WHERE created_at >= DATE_TRUNC('month', NOW())
GROUP BY DATE_TRUNC('month', created_at);

-- View: Failure heatmap by stage
CREATE OR REPLACE VIEW failure_heatmap AS
SELECT 
  failed_stage,
  COUNT(*) as failure_count,
  ROUND(AVG(generation_cost_estimate)::numeric, 2) as avg_cost_at_failure
FROM content_jobs
WHERE publish_status = 'failed'
  AND failed_stage IS NOT NULL
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY failed_stage
ORDER BY failure_count DESC;

-- View: Cost per successful draft (7-day average)
CREATE OR REPLACE VIEW cost_metrics AS
SELECT 
  ROUND(AVG(generation_cost_estimate)::numeric, 2) as avg_cost_per_draft,
  ROUND(SUM(generation_cost_estimate)::numeric, 2) as total_spend_7d,
  COUNT(*) as successful_drafts_7d,
  ROUND((SUM(gpu_seconds) / 3600.0)::numeric, 2) as total_gpu_hours
FROM content_jobs
WHERE publish_status = 'ready'
  AND created_at >= NOW() - INTERVAL '7 days';

COMMENT ON TABLE app_config IS 'Application configuration key-value store';
COMMENT ON TABLE content_jobs IS 'Content jobs with enhanced cost tracking and budget controls';
COMMENT ON VIEW daily_spend IS 'Daily spending summary';
COMMENT ON VIEW monthly_spend IS 'Monthly spending summary';
COMMENT ON VIEW failure_heatmap IS 'Failure analysis by processing stage';
COMMENT ON VIEW cost_metrics IS 'Cost and efficiency metrics';
