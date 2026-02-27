import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';

if (config.ffmpeg.path) {
  ffmpeg.setFfmpegPath(config.ffmpeg.path);
}

/**
 * Merge multiple audio buffers into a single MP3
 * @param {Buffer[]} audioBuffers - Array of WAV/audio buffers in order
 * @returns {Buffer} Merged MP3 buffer
 */
export async function mergeAudioBuffers(audioBuffers) {
  if (audioBuffers.length === 0) throw new Error('No audio buffers to merge');
  if (audioBuffers.length === 1) return convertToMp3(audioBuffers[0]);

  const tmpDir = path.join(os.tmpdir(), 'qwen-voice', uuidv4());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Write each buffer to temp file
    const inputFiles = await Promise.all(
      audioBuffers.map(async (buf, i) => {
        const filePath = path.join(tmpDir, `part_${i}.wav`);
        await fs.writeFile(filePath, buf);
        return filePath;
      })
    );

    // Create ffmpeg concat list
    const listPath = path.join(tmpDir, 'list.txt');
    const listContent = inputFiles.map(f => `file '${f}'`).join('\n');
    await fs.writeFile(listPath, listContent);

    // Merge and convert to MP3
    const outputPath = path.join(tmpDir, 'merged.mp3');
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Convert WAV buffer to MP3
 */
async function convertToMp3(wavBuffer) {
  const tmpDir = path.join(os.tmpdir(), 'qwen-voice', uuidv4());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const inputPath = path.join(tmpDir, 'input.wav');
    const outputPath = path.join(tmpDir, 'output.mp3');

    await fs.writeFile(inputPath, wavBuffer);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Get audio duration in seconds from a buffer
 */
export async function getAudioDuration(audioBuffer) {
  const tmpDir = path.join(os.tmpdir(), 'qwen-voice', uuidv4());
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const filePath = path.join(tmpDir, 'audio.wav');
    await fs.writeFile(filePath, audioBuffer);

    return await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration || 0);
      });
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
