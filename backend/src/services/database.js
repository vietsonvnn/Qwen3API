import pg from 'pg';
import config from '../config/index.js';

const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export { pool };

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

// =====================================================
// USER
// =====================================================

export async function getUserById(userId) {
  return queryOne('SELECT * FROM user_profiles WHERE id = $1', [userId]);
}

export async function getUserByEmail(email) {
  return queryOne('SELECT * FROM user_profiles WHERE email = $1', [email]);
}

export async function ensureUserProfile(userId, email) {
  const displayName = email ? email.split('@')[0] : 'User';
  return queryOne(
    `INSERT INTO user_profiles (id, email, display_name, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [userId, email, displayName]
  );
}

export async function upsertUserProfile(userId, email, displayName) {
  return queryOne(
    `INSERT INTO user_profiles (id, email, display_name, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (email) DO UPDATE SET last_login_at = now()
     RETURNING *`,
    [userId, email, displayName || email.split('@')[0]]
  );
}

export async function updateUserLastLogin(userId) {
  await query('UPDATE user_profiles SET last_login_at = now() WHERE id = $1', [userId]);
}

export async function incrementUserCharacters(userId, characters) {
  await query('SELECT increment_user_characters($1, $2)', [userId, characters]);
}

export async function updateUserProfile(userId, { display_name }) {
  return queryOne(
    'UPDATE user_profiles SET display_name = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [display_name, userId]
  );
}

// =====================================================
// CLONED VOICES
// =====================================================

export async function createClonedVoice(userId, data) {
  const cols = ['user_id', ...Object.keys(data)];
  const vals = [userId, ...Object.values(data)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  return queryOne(
    `INSERT INTO cloned_voices (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals
  );
}

export async function getClonedVoicesByUser(userId) {
  return query(
    `SELECT * FROM cloned_voices WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`,
    [userId]
  );
}

export async function getClonedVoiceById(voiceId, userId) {
  return queryOne(
    'SELECT * FROM cloned_voices WHERE id = $1 AND user_id = $2',
    [voiceId, userId]
  );
}

export async function updateClonedVoice(voiceId, userId, updates) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() });
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const vals = entries.map(([, v]) => v);
  return queryOne(
    `UPDATE cloned_voices SET ${sets} WHERE id = $${vals.length + 1} AND user_id = $${vals.length + 2} RETURNING *`,
    [...vals, voiceId, userId]
  );
}

export async function deleteClonedVoice(voiceId, userId) {
  await query(
    `UPDATE cloned_voices SET status = 'deleted' WHERE id = $1 AND user_id = $2`,
    [voiceId, userId]
  );
}

export async function incrementVoiceUsage(voiceQwenId) {
  await query(
    `UPDATE cloned_voices
     SET times_used = COALESCE(times_used, 0) + 1, last_used_at = now()
     WHERE qwen_voice_id = $1`,
    [voiceQwenId]
  );
}

// =====================================================
// TTS JOBS
// =====================================================

export async function createTtsJob(userId, data) {
  const cols = ['user_id', ...Object.keys(data)];
  const vals = [userId, ...Object.values(data)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  return queryOne(
    `INSERT INTO tts_jobs (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    vals
  );
}

export async function updateTtsJob(jobId, updates) {
  const entries = Object.entries({ ...updates, updated_at: new Date().toISOString() });
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const vals = entries.map(([, v]) => v);
  return queryOne(
    `UPDATE tts_jobs SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
    [...vals, jobId]
  );
}

export async function getTtsJobById(jobId, userId) {
  return queryOne(
    'SELECT * FROM tts_jobs WHERE id = $1 AND user_id = $2',
    [jobId, userId]
  );
}

export async function getTtsJobsByUser(userId, { limit = 20, offset = 0, status } = {}) {
  const countRow = await queryOne(
    status
      ? 'SELECT COUNT(*) as count FROM tts_jobs WHERE user_id = $1 AND status = $2'
      : 'SELECT COUNT(*) as count FROM tts_jobs WHERE user_id = $1',
    status ? [userId, status] : [userId]
  );
  const jobs = status
    ? await query(
        'SELECT * FROM tts_jobs WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
        [userId, status, limit, offset]
      )
    : await query(
        'SELECT * FROM tts_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );
  return { jobs, total: parseInt(countRow?.count || 0, 10) };
}

export async function deleteTtsJob(jobId, userId) {
  await query('DELETE FROM tts_jobs WHERE id = $1 AND user_id = $2', [jobId, userId]);
}

// =====================================================
// USAGE HISTORY
// =====================================================

export async function logUsage(userId, data) {
  const cols = ['user_id', ...Object.keys(data)];
  const vals = [userId, ...Object.values(data)];
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  await query(
    `INSERT INTO usage_history (${cols.join(', ')}) VALUES (${placeholders})`,
    vals
  ).catch(() => {}); // Non-critical, don't throw
}

// =====================================================
// ADMIN
// =====================================================

export async function getAllUsers() {
  return query('SELECT * FROM user_profiles ORDER BY created_at DESC');
}

export async function adminGetAllJobs({ limit = 50, offset = 0, userId = null } = {}) {
  const countRow = await queryOne(
    userId
      ? 'SELECT COUNT(*) as count FROM tts_jobs WHERE user_id = $1'
      : 'SELECT COUNT(*) as count FROM tts_jobs',
    userId ? [userId] : []
  );
  const jobs = await query(
    `SELECT j.*, up.email, up.display_name
     FROM tts_jobs j
     LEFT JOIN user_profiles up ON up.id = j.user_id
     ${userId ? 'WHERE j.user_id = $3' : ''}
     ORDER BY j.created_at DESC LIMIT $1 OFFSET $2`,
    userId ? [limit, offset, userId] : [limit, offset]
  );
  return { jobs, total: parseInt(countRow?.count || 0, 10) };
}

export async function adminGetStats() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    totalUsersRow, activeUsersRow, totalJobsRow,
    completedJobsRow, failedJobsRow, charRow,
  ] = await Promise.all([
    queryOne('SELECT COUNT(*) as count FROM user_profiles'),
    queryOne('SELECT COUNT(*) as count FROM user_profiles WHERE last_login_at >= $1', [sevenDaysAgo]),
    queryOne('SELECT COUNT(*) as count FROM tts_jobs'),
    queryOne("SELECT COUNT(*) as count FROM tts_jobs WHERE status = 'completed'"),
    queryOne("SELECT COUNT(*) as count FROM tts_jobs WHERE status = 'failed'"),
    queryOne('SELECT SUM(total_characters_used) as total FROM user_profiles'),
  ]);
  return {
    totalUsers: parseInt(totalUsersRow?.count || 0, 10),
    activeUsers7d: parseInt(activeUsersRow?.count || 0, 10),
    totalJobs: parseInt(totalJobsRow?.count || 0, 10),
    completedJobs: parseInt(completedJobsRow?.count || 0, 10),
    failedJobs: parseInt(failedJobsRow?.count || 0, 10),
    totalCharactersUsed: parseInt(charRow?.total || 0, 10),
  };
}

export async function adminDeleteUser(userId) {
  // Without Supabase Auth, we suspend the user profile instead of hard-delete
  await query(
    `UPDATE user_profiles SET status = 'suspended', updated_at = now() WHERE id = $1`,
    [userId]
  );
}

export async function adminUpdateUser(userId, updates) {
  const allowed = {};
  ['role', 'status', 'max_voices', 'display_name'].forEach(k => {
    if (updates[k] !== undefined) allowed[k] = updates[k];
  });
  allowed.updated_at = new Date().toISOString();
  const entries = Object.entries(allowed);
  const sets = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ');
  const vals = entries.map(([, v]) => v);
  return queryOne(
    `UPDATE user_profiles SET ${sets} WHERE id = $${vals.length + 1} RETURNING *`,
    [...vals, userId]
  );
}

// =====================================================
// APP SETTINGS
// =====================================================

export async function getAppSettings() {
  return query('SELECT * FROM app_settings ORDER BY key');
}

export async function getAppSetting(key) {
  const row = await queryOne('SELECT value FROM app_settings WHERE key = $1', [key]);
  return row?.value ?? null;
}

export async function upsertAppSetting(key, value, description) {
  return queryOne(
    `INSERT INTO app_settings (key, value, description, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now()
     RETURNING *`,
    [key, value, description || null]
  );
}
