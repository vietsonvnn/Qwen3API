#!/usr/bin/env node
/**
 * For every cloned_voices row with preview_url=NULL, regenerate the preview
 * (calls Qwen with the existing voiceprint), uploads MP3 to R2, and writes
 * the new public URL back to the DB.
 *
 * Required env (loaded from scripts/.env.migrate via direnv or `set -a`):
 *   DATABASE_URL, QWEN_API_KEY, R2_* (5 vars)
 *
 * Usage:
 *   set -a; . scripts/.env.migrate; set +a
 *   node scripts/regenerate-voice-previews.mjs            # all NULL-preview voices
 *   node scripts/regenerate-voice-previews.mjs --voice <id>
 *   node scripts/regenerate-voice-previews.mjs --dry-run
 */
import { previewVoice } from '../backend/src/services/qwenService.js';
import { mergeAudioBuffers } from '../backend/src/services/audioMerger.js';
import { uploadBuffer } from '../backend/src/services/storage.js';
import { pool } from '../backend/src/services/database.js';
import { v4 as uuidv4 } from 'uuid';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const voiceIdx = argv.indexOf('--voice');
const voiceFilter = voiceIdx >= 0 ? argv[voiceIdx + 1] : null;

const PREVIEW_TEXT = 'Xin chào, đây là giọng nói của tôi được tạo bằng AI.';

const where = voiceFilter
  ? "WHERE id = $1 AND status = 'active'"
  : "WHERE status = 'active' AND preview_url IS NULL";
const params = voiceFilter ? [voiceFilter] : [];

const { rows: voices } = await pool.query(
  `SELECT id, user_id, qwen_voice_id, name FROM cloned_voices ${where} ORDER BY created_at`,
  params,
);

console.log(`Found ${voices.length} voices to regenerate.${dryRun ? ' (DRY RUN)' : ''}`);

const stats = { ok: 0, fail: 0 };
for (const v of voices) {
  process.stdout.write(`  ${v.id.slice(0, 8)} "${v.name}" (${v.qwen_voice_id})… `);
  if (dryRun) { console.log('skip'); continue; }
  try {
    const preview = await previewVoice(v.qwen_voice_id, PREVIEW_TEXT);
    const mp3 = await mergeAudioBuffers([preview.buffer]);
    const key = `audio/${v.user_id}/preview_${uuidv4()}.mp3`;
    const url = await uploadBuffer(mp3, key, null, 'audio/mpeg');
    await pool.query(
      `UPDATE cloned_voices SET preview_url = $1, preview_text = $2, updated_at = now() WHERE id = $3`,
      [url, PREVIEW_TEXT, v.id],
    );
    console.log(`ok (${(mp3.length / 1024).toFixed(0)} KB)`);
    stats.ok++;
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
    stats.fail++;
  }
}

console.log(`\nDone: ok=${stats.ok}, fail=${stats.fail}`);
await pool.end();
process.exit(stats.fail ? 1 : 0);
