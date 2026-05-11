import { pool } from './database.js';
import { deleteFile, extractKey } from './storage.js';

const RETENTION_DAYS = parseInt(process.env.STORAGE_RETENTION_DAYS || '3');

/**
 * Delete old TTS job audio files from object storage.
 * Finds completed jobs older than RETENTION_DAYS, deletes their audio files,
 * and clears the output_url in the database.
 */
export async function cleanupOldAudioFiles() {
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(`[Cleanup] Starting — retention=${RETENTION_DAYS}d, cutoff=${cutoffDate}`);

  let deleted = 0;
  let errors = 0;

  // 1. Delete audio files for completed jobs past retention
  const { rows: jobs } = await pool.query(
    `SELECT id, user_id, output_url FROM tts_jobs
     WHERE status = 'completed' AND output_url IS NOT NULL AND completed_at < $1 LIMIT 500`,
    [cutoffDate]
  );

  if (jobs.length) {
    console.log(`[Cleanup] Found ${jobs.length} expired jobs`);

    for (const job of jobs) {
      try {
        const key = extractKey(job.output_url) || `audio/${job.user_id}/${job.id}.mp3`;
        await deleteFile(key);
        deleted++;
      } catch (err) {
        console.error(`[Cleanup] Failed to delete file for job ${job.id}:`, err.message);
        errors++;
      }
    }

    // Clear output_url in batches of 50
    const jobIds = jobs.map(j => j.id);
    for (let i = 0; i < jobIds.length; i += 50) {
      const batch = jobIds.slice(i, i + 50);
      await pool.query(
        `UPDATE tts_jobs SET output_url = NULL, updated_at = $1 WHERE id = ANY($2)`,
        [new Date().toISOString(), batch]
      );
    }
  }

  // 2. Delete failed jobs older than 1 day
  const failedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { rowCount } = await pool.query(
    `DELETE FROM tts_jobs WHERE status = 'failed' AND created_at < $1`,
    [failedCutoff]
  );
  if (rowCount > 0) {
    console.log(`[Cleanup] Deleted ${rowCount} failed jobs`);
  }

  // 3. Clean up soft-deleted voices' storage files and records
  const { rows: deletedVoices } = await pool.query(
    `SELECT id, user_id, source_file_url, preview_url FROM cloned_voices
     WHERE status = 'deleted' LIMIT 200`
  );

  if (deletedVoices.length) {
    for (const voice of deletedVoices) {
      for (const url of [voice.source_file_url, voice.preview_url]) {
        const key = extractKey(url);
        if (key) {
          try { await deleteFile(key); } catch { /* swallow */ }
        }
      }
    }

    const voiceIds = deletedVoices.map(v => v.id);
    await pool.query('DELETE FROM cloned_voices WHERE id = ANY($1)', [voiceIds]);
    deleted += deletedVoices.length;
  }

  console.log(`[Cleanup] Done — deleted ${deleted} files, ${errors} errors`);
  return { deleted, errors };
}

/**
 * Start cleanup scheduler — runs every 6 hours to keep storage under limit.
 */
export function startCleanupScheduler() {
  const INTERVAL_MS = 6 * 60 * 60 * 1000;

  console.log(`[Cleanup] Scheduler started — every 6h, retention=${RETENTION_DAYS}d`);

  setTimeout(() => {
    cleanupOldAudioFiles().catch(err => console.error('[Cleanup] Run failed:', err.message));

    setInterval(() => {
      cleanupOldAudioFiles().catch(err => console.error('[Cleanup] Run failed:', err.message));
    }, INTERVAL_MS);
  }, 30_000);
}
