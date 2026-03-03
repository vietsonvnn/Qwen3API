import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

export const supabase = createClient(config.supabase.url, config.supabase.anonKey);

export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// =====================================================
// USER
// =====================================================

export async function getUserById(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateUserLastLogin(userId) {
  await supabaseAdmin
    .from('user_profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}

export async function incrementUserCharacters(userId, characters) {
  await supabaseAdmin.rpc('increment_user_characters', {
    p_user_id: userId,
    p_characters: characters,
  });
}

// =====================================================
// CLONED VOICES
// =====================================================

export async function createClonedVoice(userId, data) {
  const { data: voice, error } = await supabaseAdmin
    .from('cloned_voices')
    .insert({ user_id: userId, ...data })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return voice;
}

export async function getClonedVoicesByUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('cloned_voices')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getClonedVoiceById(voiceId, userId) {
  const { data, error } = await supabaseAdmin
    .from('cloned_voices')
    .select('*')
    .eq('id', voiceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateClonedVoice(voiceId, userId, updates) {
  const { data, error } = await supabaseAdmin
    .from('cloned_voices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', voiceId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteClonedVoice(voiceId, userId) {
  const { error } = await supabaseAdmin
    .from('cloned_voices')
    .update({ status: 'deleted' })
    .eq('id', voiceId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function incrementVoiceUsage(voiceQwenId) {
  const { data } = await supabaseAdmin
    .from('cloned_voices')
    .select('times_used')
    .eq('qwen_voice_id', voiceQwenId)
    .maybeSingle();
  await supabaseAdmin
    .from('cloned_voices')
    .update({ times_used: (data?.times_used || 0) + 1, last_used_at: new Date().toISOString() })
    .eq('qwen_voice_id', voiceQwenId);
}

// =====================================================
// TTS JOBS
// =====================================================

export async function createTtsJob(userId, data) {
  const { data: job, error } = await supabaseAdmin
    .from('tts_jobs')
    .insert({ user_id: userId, ...data })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return job;
}

export async function updateTtsJob(jobId, updates) {
  const { data, error } = await supabaseAdmin
    .from('tts_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTtsJobById(jobId, userId) {
  const { data, error } = await supabaseAdmin
    .from('tts_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getTtsJobsByUser(userId, { limit = 20, offset = 0, status } = {}) {
  let query = supabaseAdmin
    .from('tts_jobs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { jobs: data || [], total: count };
}

export async function deleteTtsJob(jobId, userId) {
  const { error } = await supabaseAdmin
    .from('tts_jobs')
    .delete()
    .eq('id', jobId)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

// =====================================================
// USAGE HISTORY
// =====================================================

export async function logUsage(userId, data) {
  await supabaseAdmin
    .from('usage_history')
    .insert({ user_id: userId, ...data });
}

// =====================================================
// USER PROFILE MANAGEMENT
// =====================================================

export async function updateUserProfile(userId, { display_name }) {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .update({ display_name, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// =====================================================
// ADMIN
// =====================================================

export async function getAllUsers() {
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function adminGetAllJobs({ limit = 50, offset = 0, userId = null } = {}) {
  let query = supabaseAdmin
    .from('tts_jobs')
    .select('*, user_profiles(email, display_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) query = query.eq('user_id', userId);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { jobs: data || [], total: count };
}

export async function adminGetStats() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalUsers },
    { count: activeUsers7d },
    { count: totalJobs },
    { count: completedJobs },
    { count: failedJobs },
    { data: charData },
  ] = await Promise.all([
    supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true }).gte('last_login_at', sevenDaysAgo),
    supabaseAdmin.from('tts_jobs').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('tts_jobs').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
    supabaseAdmin.from('tts_jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    supabaseAdmin.from('user_profiles').select('total_characters_used'),
  ]);

  const totalCharactersUsed = (charData || []).reduce((s, u) => s + (u.total_characters_used || 0), 0);

  return {
    totalUsers: totalUsers || 0,
    activeUsers7d: activeUsers7d || 0,
    totalJobs: totalJobs || 0,
    completedJobs: completedJobs || 0,
    failedJobs: failedJobs || 0,
    totalCharactersUsed,
  };
}

export async function adminDeleteUser(userId) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

export async function adminUpdateUser(userId, updates) {
  const allowed = {};
  ['role', 'status', 'max_voices', 'display_name'].forEach(k => {
    if (updates[k] !== undefined) allowed[k] = updates[k];
  });
  allowed.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .update(allowed)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
