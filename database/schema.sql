-- =====================================================
-- QWEN VOICE TOOL — Database Schema (vanilla PostgreSQL)
-- Run on any Postgres (Railway, Neon, RDS, local).
--   psql "$DATABASE_URL" -f database/schema.sql
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER PROFILES
-- =====================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'suspended', 'pending', 'banned')),
    total_characters_used BIGINT DEFAULT 0,
    max_voices INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Profile creation is handled by the backend (upsertUserProfile in services/database.js)
-- after Google OAuth login — no DB trigger needed.

-- =====================================================
-- CLONED VOICES
-- =====================================================

CREATE TABLE IF NOT EXISTS cloned_voices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Qwen3 voiceprint
    qwen_voice_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    language TEXT DEFAULT 'auto',

    -- Source audio (stored in object storage)
    source_file_url TEXT,
    source_filename TEXT,
    source_duration_seconds DECIMAL(8,2),

    -- Preview
    preview_url TEXT,
    preview_text TEXT,

    -- Stats
    times_used INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloned_voices_user   ON cloned_voices(user_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voices_status ON cloned_voices(status);

-- =====================================================
-- TTS JOBS
-- =====================================================

CREATE TABLE IF NOT EXISTS tts_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Input
    input_text TEXT,
    total_characters INT NOT NULL DEFAULT 0,

    -- Voice
    voice_id TEXT NOT NULL,
    voice_name TEXT,
    voice_type TEXT DEFAULT 'system' CHECK (voice_type IN ('system', 'cloned')),

    -- Settings
    model TEXT DEFAULT 'qwen3-tts-flash',
    language TEXT DEFAULT 'auto',
    job_title TEXT,

    -- Output (stored in object storage)
    output_url TEXT,
    output_duration_seconds DECIMAL(10,2),
    output_file_size_bytes BIGINT,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed'
    )),
    error_message TEXT,
    progress_percent INT DEFAULT 0,

    -- Subtitles: [{text, startMs, endMs}] per batch
    segments JSONB,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tts_jobs_user    ON tts_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_tts_jobs_status  ON tts_jobs(status);
CREATE INDEX IF NOT EXISTS idx_tts_jobs_created ON tts_jobs(created_at DESC);

-- =====================================================
-- USAGE HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    action_type TEXT NOT NULL CHECK (action_type IN (
        'tts', 'voice_clone', 'voice_preview', 'voice_delete'
    )),

    job_id UUID REFERENCES tts_jobs(id) ON DELETE SET NULL,
    voice_id UUID REFERENCES cloned_voices(id) ON DELETE SET NULL,

    characters_used INT DEFAULT 0,
    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_history_user    ON usage_history(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_history_created ON usage_history(created_at DESC);

-- =====================================================
-- APP SETTINGS (key/value store for admin-tunable config)
-- =====================================================

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Atomic character counter increment
CREATE OR REPLACE FUNCTION increment_user_characters(p_user_id UUID, p_characters INT)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET total_characters_used = total_characters_used + p_characters,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;
