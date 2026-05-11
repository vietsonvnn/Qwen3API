-- =====================================================
-- One-off migration: applied AFTER restoring a pg_dump of the public schema
-- from the legacy Supabase project into a vanilla Postgres database.
--
-- Idempotent — safe to run more than once.
--   psql "$DATABASE_URL" -f database/migrate-from-supabase.sql
-- =====================================================

BEGIN;

-- 1. Drop the FK pointing at the Supabase-only auth.users table.
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;

-- 2. user_profiles.email must be unique (schema.sql declares it; old Supabase
--    schema didn't). Ignore if duplicate emails exist — fix manually then re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_email_key'
  ) THEN
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_email_key UNIQUE (email);
  END IF;
END $$;

-- 3. Disable & drop RLS — backend enforces ownership via WHERE clauses.
ALTER TABLE user_profiles  DISABLE ROW LEVEL SECURITY;
ALTER TABLE cloned_voices  DISABLE ROW LEVEL SECURITY;
ALTER TABLE tts_jobs       DISABLE ROW LEVEL SECURITY;
ALTER TABLE usage_history  DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile"   ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users manage own voices"      ON cloned_voices;
DROP POLICY IF EXISTS "Users manage own jobs"        ON tts_jobs;
DROP POLICY IF EXISTS "Users read own history"       ON usage_history;

-- 4. Allow 'banned' status (backend auth.js references it).
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_status_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_status_check
  CHECK (status IN ('active', 'suspended', 'pending', 'banned'));

-- 5. Create app_settings if it didn't exist in the old project.
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Rewrite SECURITY DEFINER helper (no Supabase RLS context anymore).
CREATE OR REPLACE FUNCTION increment_user_characters(p_user_id UUID, p_characters INT)
RETURNS void AS $$
BEGIN
  UPDATE user_profiles
  SET total_characters_used = total_characters_used + p_characters,
      updated_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

COMMIT;
