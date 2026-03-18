-- Migration: Multi-tenant Content Jobs Support
-- Adds multi-tenant columns to content_jobs table for frontend integration

-- ============================================
-- 1. Add multi-tenant columns to content_jobs
-- ============================================

ALTER TABLE content_jobs
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS content_item_id TEXT,
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS platforms JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS first_comment TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued';

-- Add indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_content_jobs_company_id ON content_jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_content_jobs_company_status ON content_jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_content_jobs_content_item_id ON content_jobs(content_item_id);

-- ============================================
-- 2. Create content_items table for frontend
-- ============================================

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  author TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_content_items_company_id ON content_items(company_id);
CREATE INDEX IF NOT EXISTS idx_content_items_feed_id ON content_items(feed_id);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);

-- ============================================
-- 3. Update RLS policies for content_jobs
-- ============================================

ALTER TABLE content_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view content_jobs for their company"
  ON content_jobs
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies
      WHERE id = (auth.jwt() ->> 'company_id')::uuid
    )
  );

CREATE POLICY "Users can insert content_jobs for their company"
  ON content_jobs
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies
      WHERE id = (auth.jwt() ->> 'company_id')::uuid
    )
  );

CREATE POLICY "Users can update content_jobs for their company"
  ON content_jobs
  FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM companies
      WHERE id = (auth.jwt() ->> 'company_id')::uuid
    )
  );

-- ============================================
-- 4. Update RLS policies for content_items
-- ============================================

ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view content_items for their company"
  ON content_items
  FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM companies
      WHERE id = (auth.jwt() ->> 'company_id')::uuid
    )
  );

CREATE POLICY "Users can insert content_items for their company"
  ON content_items
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM companies
      WHERE id = (auth.jwt() ->> 'company_id')::uuid
    )
  );
