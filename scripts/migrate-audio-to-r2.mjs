#!/usr/bin/env node
/**
 * One-off migration: copy audio files from Supabase Storage → Cloudflare R2,
 * and rewrite the URL columns (output_url, source_file_url, preview_url) in the
 * NEW Railway Postgres database.
 *
 * Idempotent — rows whose URL is already on R2 are skipped.
 *
 * Required env (load via direnv / `export` / a local .env.migrate sourced before run):
 *   DATABASE_URL           — Railway Postgres (the NEW, restored one)
 *   SUPABASE_URL           — e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY   — service_role key (private bucket access)
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET              — destination bucket (single bucket consolidates
 *                            qwen-voice-audio + qwen-voice-sources)
 *   R2_PUBLIC_URL          — public origin (e.g. https://audio.your-domain.com)
 *
 * Usage:
 *   node scripts/migrate-audio-to-r2.mjs --dry-run
 *   node scripts/migrate-audio-to-r2.mjs --limit 5
 *   node scripts/migrate-audio-to-r2.mjs --table tts_jobs
 *   node scripts/migrate-audio-to-r2.mjs                # full run
 */
import pg from 'pg';
import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ---- args ----------------------------------------------------------------

const argv = process.argv.slice(2);
const args = {
  dryRun: argv.includes('--dry-run'),
  table: getArg('--table'),       // tts_jobs | cloned_voices (omit = both)
  limit: Number(getArg('--limit')) || Infinity,
};
function getArg(flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
}

// ---- env ----------------------------------------------------------------

const required = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
];
for (const k of required) {
  if (!process.env[k]) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, '');

// ---- clients ------------------------------------------------------------

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ---- helpers ------------------------------------------------------------

function encodePath(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

/**
 * Recognise a Supabase Storage URL and extract { bucket, key }.
 * Handles three URL shapes:
 *   /storage/v1/object/public/<bucket>/<key>
 *   /storage/v1/object/sign/<bucket>/<key>?token=...
 *   /storage/v1/object/<bucket>/<key>
 */
function parseSupabaseUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:public\/|sign\/)?([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: m[1], key: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

function guessContentType(key) {
  const ext = key.split('.').pop()?.toLowerCase();
  return ({
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
    ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
  })[ext] || 'application/octet-stream';
}

async function downloadFromSupabase(bucket, key) {
  // Service-role bearer auth works on private buckets, also fine on public ones.
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${encodePath(key)}`;
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
    timeout: 120_000,
    maxContentLength: 200 * 1024 * 1024,
    maxBodyLength: 200 * 1024 * 1024,
  });
  return Buffer.from(res.data);
}

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// ---- migration core -----------------------------------------------------

const stats = { migrated: 0, skipped: 0, errors: 0, attempted: 0 };

async function migrateColumn(table, column) {
  console.log(`\n=== ${table}.${column} ===`);
  const pageSize = 200;
  let offset = 0;

  while (stats.attempted < args.limit) {
    const { rows } = await pool.query(
      `SELECT id, user_id, ${column} AS url
       FROM ${table}
       WHERE ${column} IS NOT NULL
       ORDER BY created_at
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    if (!rows.length) break;

    for (const row of rows) {
      if (stats.attempted >= args.limit) break;
      stats.attempted++;

      const url = row.url;
      if (url.startsWith(R2_PUBLIC_URL + '/')) {
        stats.skipped++;
        continue;
      }
      const parsed = parseSupabaseUrl(url);
      if (!parsed) {
        console.warn(`  [skip-bad-url] ${table}#${row.id}  ${url}`);
        stats.errors++;
        continue;
      }

      try {
        if (args.dryRun) {
          console.log(`  [dry] ${table}#${row.id}  ${parsed.bucket}/${parsed.key}`);
        } else {
          const buf = await downloadFromSupabase(parsed.bucket, parsed.key);
          const newUrl = await uploadToR2(parsed.key, buf, guessContentType(parsed.key));
          await pool.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [newUrl, row.id]);
          console.log(`  [ok]  ${table}#${row.id}  ${(buf.length / 1024).toFixed(0)}KB → ${parsed.key}`);
        }
        stats.migrated++;
      } catch (e) {
        const status = e.response?.status;
        console.error(`  [err] ${table}#${row.id}  ${parsed.key}  ${status ? `HTTP ${status}` : ''} ${e.message}`);
        stats.errors++;
      }
    }
    offset += rows.length;
  }
}

// ---- run ----------------------------------------------------------------

(async () => {
  console.log(`migrate-audio-to-r2  ${args.dryRun ? '(DRY RUN)' : ''}  target=${R2_PUBLIC_URL}`);
  console.log(`limit=${args.limit === Infinity ? 'none' : args.limit}  table=${args.table || 'all'}`);

  try {
    if (!args.table || args.table === 'tts_jobs') {
      await migrateColumn('tts_jobs', 'output_url');
    }
    if (!args.table || args.table === 'cloned_voices') {
      await migrateColumn('cloned_voices', 'source_file_url');
      await migrateColumn('cloned_voices', 'preview_url');
    }
  } finally {
    await pool.end();
  }

  console.log(`\n=== summary ===`);
  console.log(stats);
  process.exit(stats.errors > 0 ? 1 : 0);
})();
