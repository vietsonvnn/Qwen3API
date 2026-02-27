-- =====================================================
-- QWEN VOICE TOOL — Database Schema
-- Run this in Supabase SQL Editor
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER PROFILES
-- =====================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    total_characters_used BIGINT DEFAULT 0,
    max_voices INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_user_profiles_email ON user_profiles(email);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_profiles (id, email, display_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- CLONED VOICES
-- =====================================================

CREATE TABLE IF NOT EXISTS cloned_voices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,

    -- Qwen3 voiceprint
    qwen_voice_id TEXT NOT NULL,          -- e.g. "custom_xxx" returned by Qwen3
    name TEXT NOT NULL,
    description TEXT,
    language TEXT DEFAULT 'auto',

    -- Source audio
    source_file_url TEXT,                 -- stored in Supabase Storage
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

CREATE INDEX idx_cloned_voices_user ON cloned_voices(user_id);
CREATE INDEX idx_cloned_voices_status ON cloned_voices(status);

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
    voice_id TEXT NOT NULL,               -- system voice ID or cloned qwen_voice_id
    voice_name TEXT,
    voice_type TEXT DEFAULT 'system' CHECK (voice_type IN ('system', 'cloned')),

    -- Settings
    model TEXT DEFAULT 'qwen3-tts-flash',
    language TEXT DEFAULT 'auto',
    job_title TEXT,

    -- Output
    output_url TEXT,                      -- final audio stored in Supabase Storage
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

CREATE INDEX idx_tts_jobs_user ON tts_jobs(user_id);
CREATE INDEX idx_tts_jobs_status ON tts_jobs(status);
CREATE INDEX idx_tts_jobs_created ON tts_jobs(created_at DESC);

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

CREATE INDEX idx_usage_history_user ON usage_history(user_id);
CREATE INDEX idx_usage_history_created ON usage_history(created_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloned_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE tts_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_history ENABLE ROW LEVEL SECURITY;

-- user_profiles: users can read/update own profile
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

-- cloned_voices: users manage own voices
CREATE POLICY "Users manage own voices" ON cloned_voices
    FOR ALL USING (auth.uid() = user_id);

-- tts_jobs: users manage own jobs
CREATE POLICY "Users manage own jobs" ON tts_jobs
    FOR ALL USING (auth.uid() = user_id);

-- usage_history: users read own history
CREATE POLICY "Users read own history" ON usage_history
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Atomic character counter increment (used by backend RPC call)
CREATE OR REPLACE FUNCTION increment_user_characters(p_user_id UUID, p_characters INT)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET total_characters_used = total_characters_used + p_characters,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- STORAGE BUCKET (run in Supabase dashboard or via API)
-- =====================================================
-- Create bucket: qwen-voice-audio (public: false)
-- Create bucket: qwen-voice-sources (public: false)
