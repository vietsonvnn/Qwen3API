import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';
import axios from 'axios';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

/**
 * Upload a buffer to Supabase Storage
 * @param {Buffer} buffer - File content
 * @param {string} path - Storage path e.g. "audio/user-id/job-id.wav"
 * @param {string} bucket - Bucket name
 * @param {string} contentType - MIME type
 * @returns {string} Public URL
 */
export async function uploadBuffer(buffer, path, bucket, contentType = 'audio/wav') {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

/**
 * Download a file from Supabase Storage to Buffer
 */
export async function downloadBuffer(path, bucket) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(path, bucket) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error(`Storage delete failed: ${error.message}`);
}

/**
 * Download audio from an external URL (e.g., expiring Qwen3 WAV URLs)
 * Must be called immediately after generation — URLs expire in 24h
 */
export async function downloadFromUrl(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(response.data);
}

/**
 * Upload audio from a URL directly to storage (download + re-upload)
 */
export async function downloadAndStore(sourceUrl, storagePath, bucket, contentType = 'audio/wav') {
  const buffer = await downloadFromUrl(sourceUrl);
  const publicUrl = await uploadBuffer(buffer, storagePath, bucket, contentType);
  return { publicUrl, buffer };
}
