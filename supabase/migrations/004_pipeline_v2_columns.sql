-- Migration: Pipeline V2 Support
-- Adds pipeline_version, overlay_mode, openrouter_tokens columns

-- ============================================
-- 1. Add Pipeline V2 columns to content_jobs
-- ============================================

ALTER TABLE content_jobs
ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'v1',
ADD COLUMN IF NOT EXISTS overlay_mode TEXT DEFAULT 'split_screen_bottom_content',
ADD COLUMN IF NOT EXISTS openrouter_tokens JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS cost_estimate REAL DEFAULT 0.0;

-- Create index for pipeline version filtering
CREATE INDEX IF NOT EXISTS idx_content_jobs_pipeline_version ON content_jobs(pipeline_version);
CREATE INDEX IF NOT EXISTS idx_content_jobs_overlay_mode ON content_jobs(overlay_mode);

-- ============================================
-- 2. Add comments for documentation
-- ============================================

COMMENT ON COLUMN content_jobs.pipeline_version IS 'Pipeline version: v1 (legacy) or v2 (new multi-stage)';
COMMENT ON COLUMN content_jobs.overlay_mode IS 'Compositor overlay mode: split_screen_bottom_content or greenscreen_overlay';
COMMENT ON COLUMN content_jobs.openrouter_tokens IS 'OpenRouter token usage: {prompt: X, completion: Y, total: Z}';
COMMENT ON COLUMN content_jobs.cost_estimate IS 'Estimated total cost for this job execution';
COMMENT ON COLUMN content_jobs.gpu_seconds IS 'Total GPU seconds consumed (Wan2.2 + InfiniteTalk)';
COMMENT ON COLUMN content_jobs.voice_profile_used IS 'Character voice profile used for TTS';

-- ============================================
-- 3. Update existing jobs to v1
-- ============================================

UPDATE content_jobs 
SET pipeline_version = 'v1' 
WHERE pipeline_version IS NULL;

-- ============================================
-- 4. Create view for V2 pipeline jobs
-- ============================================

CREATE OR REPLACE VIEW pipeline_v2_jobs AS
SELECT 
  id,
  source_title,
  source_url,
  pipeline_version,
  overlay_mode,
  processing_step,
  publish_status,
  voice_profile_used,
  gpu_seconds,
  cost_estimate,
  openrouter_tokens,
  created_at,
  processed_at
FROM content_jobs
WHERE pipeline_version = 'v2'
ORDER BY created_at DESC;

COMMENT ON VIEW pipeline_v2_jobs IS 'All jobs using the V2 pipeline';
