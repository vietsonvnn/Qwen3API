import axios from 'axios';
import config from '../config/index.js';

const BASE_URL = config.qwen.baseUrl;
const API_KEY = config.qwen.apiKey;

// Qwen3 API limit is 600 BYTES (not chars). CJK/Korean/Vietnamese = 3 bytes/char.
// Use 450 bytes as safe limit: allows 450 ASCII chars or ~150 CJK chars per batch.
const MAX_BYTES = 450;

// Byte length of a string in UTF-8
function byteLen(str) {
  return Buffer.byteLength(str, 'utf8');
}

// =====================================================
// SYSTEM VOICES
// =====================================================

export const SYSTEM_VOICES = [
  // Female
  { id: 'Cherry', name: 'Cherry', gender: 'female', description: 'Cheerful, expressive' },
  { id: 'Serena', name: 'Serena', gender: 'female', description: 'Calm, professional' },
  { id: 'Claire', name: 'Claire', gender: 'female', description: 'Warm, friendly' },
  { id: 'Stella', name: 'Stella', gender: 'female', description: 'Gentle, soft' },
  { id: 'Jade', name: 'Jade', gender: 'female', description: 'Clear, articulate' },
  { id: 'Aura', name: 'Aura', gender: 'female', description: 'Energetic, bright' },
  { id: 'Nova', name: 'Nova', gender: 'female', description: 'Smooth, refined' },
  { id: 'Luna', name: 'Luna', gender: 'female', description: 'Soft, dreamy' },
  { id: 'Chloe', name: 'Chloe', gender: 'female', description: 'Lively, youthful' },
  { id: 'Aria', name: 'Aria', gender: 'female', description: 'Elegant, sophisticated' },
  { id: 'Jennifer', name: 'Jennifer', gender: 'female', description: 'Natural, conversational' },
  { id: 'Emily', name: 'Emily', gender: 'female', description: 'Bright, clear' },
  { id: 'Ashley', name: 'Ashley', gender: 'female', description: 'Casual, friendly' },
  { id: 'Mia', name: 'Mia', gender: 'female', description: 'Sweet, gentle' },
  { id: 'Zoe', name: 'Zoe', gender: 'female', description: 'Vibrant, energetic' },
  // Male
  { id: 'Ethan', name: 'Ethan', gender: 'male', description: 'Deep, authoritative' },
  { id: 'Ryan', name: 'Ryan', gender: 'male', description: 'Clear, confident' },
  { id: 'Marcus', name: 'Marcus', gender: 'male', description: 'Rich, resonant' },
  { id: 'Leo', name: 'Leo', gender: 'male', description: 'Warm, approachable' },
  { id: 'Atlas', name: 'Atlas', gender: 'male', description: 'Powerful, commanding' },
  { id: 'Orion', name: 'Orion', gender: 'male', description: 'Calm, measured' },
  { id: 'Drake', name: 'Drake', gender: 'male', description: 'Bold, strong' },
  { id: 'Hunter', name: 'Hunter', gender: 'male', description: 'Casual, natural' },
  { id: 'Tyler', name: 'Tyler', gender: 'male', description: 'Upbeat, friendly' },
  { id: 'Nathan', name: 'Nathan', gender: 'male', description: 'Clear, professional' },
  // Chinese Dialect Voices
  { id: 'Jada', name: 'Jada', gender: 'female', description: 'Shanghainese dialect', dialect: 'shanghainese' },
  { id: 'Dylan', name: 'Dylan', gender: 'male', description: 'Beijing dialect', dialect: 'beijing' },
];

// Supported languages for language_type param
export const SUPPORTED_LANGUAGES = [
  { id: 'auto', name: 'Tự động phát hiện' },
  { id: 'Chinese', name: 'Tiếng Trung' },
  { id: 'English', name: 'Tiếng Anh' },
  { id: 'Vietnamese', name: 'Tiếng Việt' },
  { id: 'Japanese', name: 'Tiếng Nhật' },
  { id: 'Korean', name: 'Tiếng Hàn' },
  { id: 'French', name: 'Tiếng Pháp' },
  { id: 'German', name: 'Tiếng Đức' },
  { id: 'Spanish', name: 'Tiếng Tây Ban Nha' },
  { id: 'Portuguese', name: 'Tiếng Bồ Đào Nha' },
  { id: 'Russian', name: 'Tiếng Nga' },
  { id: 'Italian', name: 'Tiếng Ý' },
];

export const MODELS = [
  { id: 'qwen3-tts-flash', name: 'Qwen3 Flash', description: 'Nhanh, giá rẻ — phù hợp hầu hết use case' },
  { id: 'qwen3-tts-vc-2026-01-22', name: 'Qwen3 Voice Clone', description: 'Dùng cho giọng clone' },
];

// Model used for voice enrollment (creating voiceprint)
const VOICE_ENROLLMENT_MODEL = 'qwen-voice-enrollment';
// Model used for TTS synthesis with cloned voices
const VOICE_CLONE_TTS_MODEL = 'qwen3-tts-vc-2026-01-22';

// =====================================================
// CORE: TEXT-TO-SPEECH
// =====================================================

/**
 * Convert a single text chunk (≤500 chars) to audio
 * Returns a Buffer of WAV audio
 */
export async function synthesizeSingle(text, voiceId, options = {}) {
  const { model = 'qwen3-tts-flash', language = 'auto' } = options;

  const input = {
    text,
    voice: voiceId,
  };

  // Only add language_type if not auto (Qwen3 auto-detects by default)
  if (language !== 'auto') {
    input.language_type = language;
  }

  let response;
  try {
    response = await axios.post(
      `${BASE_URL}${config.qwen.ttsEndpoint}`,
      { model, input },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );
  } catch (err) {
    const apiMsg = err.response?.data?.message || err.response?.data?.error || err.response?.data?.msg || err.message;
    throw new Error(apiMsg);
  }

  const audio = response.data?.output?.audio;
  if (!audio?.url) {
    throw new Error(`Qwen3 TTS failed: ${JSON.stringify(response.data)}`);
  }

  // Download WAV immediately — URLs expire in 24h
  const wavResponse = await axios.get(audio.url, {
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  const wavBuffer = Buffer.from(wavResponse.data);
  return {
    buffer: wavBuffer,
    duration: getWavDurationMs(wavBuffer) / 1000, // seconds
    characters: response.data.usage?.characters || text.length,
  };
}

/**
 * Split text into byte-safe batches respecting sentence/paragraph boundaries.
 * Uses UTF-8 byte length because Qwen3 API limit is 600 bytes (not chars).
 * CJK/Korean/Vietnamese characters are 3 bytes each.
 */
export function splitTextIntoBatches(text, maxBytes = MAX_BYTES) {
  if (byteLen(text) <= maxBytes) return [text];

  const batches = [];
  const paragraphs = text.split(/\n\n+/);

  let current = '';
  for (const para of paragraphs) {
    if (!para.trim()) continue;

    if (byteLen(para) > maxBytes) {
      // Paragraph too long — split by sentences
      if (current) { batches.push(current.trim()); current = ''; }
      const sentences = para.split(/(?<=[.!?。！？\n])\s*/);
      for (const sent of sentences) {
        if (!sent.trim()) continue;
        const combined = current ? `${current} ${sent}` : sent;
        if (byteLen(combined) > maxBytes) {
          if (current) batches.push(current.trim());
          // Sentence itself is too long — force split by chars
          if (byteLen(sent) > maxBytes) {
            current = '';
            for (const ch of sent) {
              if (byteLen(current + ch) > maxBytes) {
                if (current) batches.push(current.trim());
                current = ch;
              } else {
                current += ch;
              }
            }
          } else {
            current = sent;
          }
        } else {
          current = combined;
        }
      }
    } else if (byteLen((current ? current + '\n\n' : '') + para) > maxBytes) {
      if (current) batches.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) batches.push(current.trim());
  return batches.filter(b => b.trim().length > 0);
}

/**
 * Main TTS entry point — handles batching with parallel execution.
 * Returns buffers, totalCharacters, and segments (for SRT export).
 */
export async function textToSpeech(text, voiceId, options = {}) {
  const batches = splitTextIntoBatches(text.trim());

  // Run batches in parallel (max 5 concurrent) for lower latency
  const batchResults = await parallelLimit(
    batches.map(batch => () => synthesizeSingle(batch, voiceId, options)),
    5
  );

  // Build ordered results + cumulative timestamps for SRT
  let curMs = 0;
  const buffers = [];
  const segments = [];
  let totalCharacters = 0;

  for (let i = 0; i < batches.length; i++) {
    const r = batchResults[i];
    const durationMs = Math.round((r.duration || 0) * 1000);
    buffers.push(r.buffer);
    segments.push({ text: batches[i], startMs: curMs, endMs: curMs + durationMs });
    curMs += durationMs;
    totalCharacters += r.characters;
  }

  return { buffers, totalCharacters, segments };
}

/**
 * Run async tasks in parallel with a concurrency limit.
 * Preserves order of results. No external dependencies.
 */
async function parallelLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < tasks.length) {
      const i = nextIdx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// =====================================================
// VOICE CLONING
// =====================================================

/**
 * Create a Qwen3 voiceprint from an audio buffer
 * Returns the custom voice ID to use in TTS (e.g. "qwen-tts-vc-name-voice-timestamp")
 *
 * NOTE: Audio must be in a supported language (EN, ZH, etc.)
 * Vietnamese audio will return "Unsupported language: vi"
 */
export async function createVoiceprint(audioBuffer, fileName, options = {}) {
  const { voiceName = 'my_voice' } = options;

  // Sanitize: API only accepts [A-Za-z0-9_], max 16 chars
  const sanitizedName = (voiceName || 'my_voice')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^A-Za-z0-9_]/g, '_')                   // replace invalid chars
    .replace(/_+/g, '_').replace(/^_|_$/g, '')        // clean underscores
    .substring(0, 16) || 'my_voice';

  // Convert audio buffer to base64 data URI
  const mimeType = getMimeType(fileName);
  const base64Audio = audioBuffer.toString('base64');
  const audioDataUri = `data:${mimeType};base64,${base64Audio}`;

  const payload = {
    model: VOICE_ENROLLMENT_MODEL,
    input: {
      action: 'create',
      target_model: VOICE_CLONE_TTS_MODEL,
      preferred_name: sanitizedName,
      audio: {
        data: audioDataUri,
      },
    },
  };

  let response;
  try {
    response = await axios.post(
      `${BASE_URL}${config.qwen.cloneEndpoint}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    );
  } catch (err) {
    // Extract actual error message from Qwen3 API response body
    const apiMsg = err.response?.data?.message || err.response?.data?.error || err.response?.data?.msg || err.message;
    throw new Error(apiMsg);
  }

  const voiceId = response.data?.output?.voice;
  if (!voiceId) {
    throw new Error(`Voice cloning failed: ${JSON.stringify(response.data)}`);
  }

  return voiceId;
}

/**
 * Generate a preview audio clip for a cloned voice
 */
export async function previewVoice(voiceId, previewText = 'Hello, this is a voice created with AI.') {
  return synthesizeSingle(previewText, voiceId, { model: VOICE_CLONE_TTS_MODEL });
}

// =====================================================
// HELPERS
// =====================================================

/**
 * Parse WAV header to get duration in milliseconds.
 * Avoids FFprobe call per batch — reads byte rate from header directly.
 */
function getWavDurationMs(buf) {
  if (!buf || buf.length < 44) return 0;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return 0;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return 0;

  let pos = 12;
  let byteRate = 0, dataSize = 0;

  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ' && pos + 8 + size <= buf.length) {
      byteRate = buf.readUInt32LE(pos + 16);
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    pos += 8 + size + (size % 2 !== 0 ? 1 : 0);
  }

  if (!byteRate || !dataSize) return 0;
  return Math.round((dataSize / byteRate) * 1000);
}

function getMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  const types = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    aac: 'audio/aac',
  };
  return types[ext] || 'audio/mpeg';
}

/**
 * Estimate character count for a text
 */
export function estimateCharacters(text) {
  return text.trim().length;
}
