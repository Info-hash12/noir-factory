-- Noir Factory Database Setup
-- Run this SQL in your Supabase SQL Editor to create the posts table

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reddit_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  screenshot_url TEXT,
  ai_score INTEGER,
  ai_analysis TEXT,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_reddit_id ON posts(reddit_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE posts IS 'Stores Reddit posts with their processing status and AI audit results';
COMMENT ON COLUMN posts.reddit_id IS 'Unique identifier from Reddit (extracted from post URL)';
COMMENT ON COLUMN posts.status IS 'Processing status: pending, processing, completed, or failed';
COMMENT ON COLUMN posts.screenshot_url IS 'URL to the captured screenshot from ScreenshotOne API';
COMMENT ON COLUMN posts.ai_score IS 'AI quality score from 0-100 (higher is better)';
COMMENT ON COLUMN posts.ai_analysis IS 'AI-generated analysis explaining the score';
