import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

// Keep audio files for 3 days by default (free tier = 1GB limit)
const RETENTION_DAYS = parseInt(process.env.STORAGE_RETENTION_DAYS || '3');

/**
 * Delete old TTS job audio files from storage.
 * Finds completed jobs older than RETENTION_DAYS, deletes their audio files,
 * and clears the output_url in the database.
 */
export async function cleanupOldAudioFiles() {
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`[Cleanup] Starting — retention=${RETENTION_DAYS}d, cutoff=${cutoffDate}`);

  let deleted = 0;
  let errors = 0;

  // 1. Delete audio files for completed jobs past retention
  const { data: jobs, error } = await supabase
    .from('tts_jobs')
    .select('id, user_id, output_url')
    .eq('status', 'completed')
    .not('output_url', 'is', null)
    .lt('completed_at', cutoffDate)
    .limit(500);

  if (error) {
    console.error('[Cleanup] Query failed:', error.message);
    return { deleted: 0, errors: 1 };
  }

  if (jobs?.length) {
    console.log(`[Cleanup] Found ${jobs.length} expired jobs`);

    // Batch delete: collect all paths first
    const paths = jobs.map(j => `audio/${j.user_id}/${j.id}.mp3`);
    const jobIds = jobs.map(j => j.id);

    // Supabase storage supports batch delete
    const { error: batchErr } = await supabase.storage
      .from(config.storage.audioBucket)
      .remove(paths);

    if (batchErr) {
      console.error('[Cleanup] Batch delete failed:', batchErr.message);
      errors++;
    } else {
      deleted += paths.length;

      // Clear output_url in batch (using IN filter)
      for (let i = 0; i < jobIds.length; i += 50) {
        const batch = jobIds.slice(i, i + 50);
        await supabase
          .from('tts_jobs')
          .update({ output_url: null, updated_at: new Date().toISOString() })
          .in('id', batch);
      }
    }
  }

  // 2. Delete failed jobs older than 1 day
  const failedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: failedJobs } = await supabase
    .from('tts_jobs')
    .select('id')
    .eq('status', 'failed')
    .lt('created_at', failedCutoff)
    .limit(500);

  if (failedJobs?.length) {
    await supabase
      .from('tts_jobs')
      .delete()
      .eq('status', 'failed')
      .lt('created_at', failedCutoff);
    console.log(`[Cleanup] Deleted ${failedJobs.length} failed jobs`);
  }

  // 3. Clean up soft-deleted voices' storage files
  const { data: deletedVoices } = await supabase
    .from('cloned_voices')
    .select('id, user_id, source_file_url, preview_url')
    .eq('status', 'deleted')
    .limit(200);

  if (deletedVoices?.length) {
    const audioPaths = [];
    const sourcePaths = [];

    for (const voice of deletedVoices) {
      try {
        if (voice.source_file_url) {
          const key = new URL(voice.source_file_url).pathname.split('/object/public/' + config.storage.sourcesBucket + '/')[1];
          if (key) sourcePaths.push(decodeURIComponent(key));
        }
        if (voice.preview_url) {
          const key = new URL(voice.preview_url).pathname.split('/object/public/' + config.storage.audioBucket + '/')[1];
          if (key) audioPaths.push(decodeURIComponent(key));
        }
      } catch { /* skip malformed URLs */ }
    }

    if (audioPaths.length) await supabase.storage.from(config.storage.audioBucket).remove(audioPaths);
    if (sourcePaths.length) await supabase.storage.from(config.storage.sourcesBucket).remove(sourcePaths);

    // Hard-delete voice records
    const voiceIds = deletedVoices.map(v => v.id);
    await supabase.from('cloned_voices').delete().in('id', voiceIds);
    deleted += deletedVoices.length;
  }

  console.log(`[Cleanup] Done — deleted ${deleted} files, ${errors} errors`);
  return { deleted, errors };
}

/**
 * Start cleanup scheduler — runs every 6 hours to keep storage under limit.
 */
export function startCleanupScheduler() {
  const INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

  console.log(`[Cleanup] Scheduler started — every 6h, retention=${RETENTION_DAYS}d`);

  // Run first cleanup after 30 seconds (let server fully start)
  setTimeout(() => {
    cleanupOldAudioFiles().catch(err => console.error('[Cleanup] Run failed:', err.message));

    setInterval(() => {
      cleanupOldAudioFiles().catch(err => console.error('[Cleanup] Run failed:', err.message));
    }, INTERVAL_MS);
  }, 30_000);
}
