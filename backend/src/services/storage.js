import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import config from '../config/index.js';

const PUBLIC_URL = config.storage.r2.publicUrl;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.storage.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.storage.r2.accessKeyId,
    secretAccessKey: config.storage.r2.secretAccessKey,
  },
});

const BUCKET = config.storage.r2.bucket;

function publicUrl(key) {
  return `${PUBLIC_URL}/${key.replace(/^\//, '')}`;
}

/**
 * Strip the R2 public URL prefix from a stored URL to recover the object key.
 * Returns null if the URL is not on our R2 (e.g. legacy Supabase URL).
 */
export function extractKey(url) {
  if (!url) return null;
  const prefix = PUBLIC_URL + '/';
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}

export async function uploadBuffer(buffer, key, _bucket, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
  return publicUrl(key);
}

export async function downloadBuffer(key, _bucket) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteFile(key, _bucket) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    if (err.name !== 'NoSuchKey') {
      console.error(`Storage delete failed: ${err.message}`);
    }
  }
}

export async function downloadFromUrl(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });
  return Buffer.from(response.data);
}

export async function downloadAndStore(sourceUrl, storagePath, bucket, contentType = 'audio/wav') {
  const buffer = await downloadFromUrl(sourceUrl);
  const url = await uploadBuffer(buffer, storagePath, bucket, contentType);
  return { publicUrl: url, buffer };
}
