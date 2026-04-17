import axios from 'axios';
import config from '../config/index.js';
import { getAudioDuration } from './audioMerger.js';
import { getAppSetting } from './database.js';

// API key and base URL: DB settings override env vars
async function getApiKey() {
  const dbKey = await getAppSetting('qwen_api_key').catch(() => null);
  return dbKey || config.qwen.apiKey;
}

async function getBaseUrl() {
  const dbUrl = await getAppSetting('qwen_base_url').catch(() => null);
  return dbUrl || config.qwen.baseUrl;
}

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
  // ── Multilingual voices (support: zh, en, fr, de, ru, it, es, pt, ja, ko) ──
  // Chinese-accent
  { id: 'Cherry', name: 'Cherry', gender: 'female', description: 'Vui tươi, tự nhiên', locale: 'zh' },
  { id: 'Serena', name: 'Serena', gender: 'female', description: 'Nhẹ nhàng, dịu dàng', locale: 'zh' },
  { id: 'Ethan', name: 'Ethan', gender: 'male', description: 'Ấm áp, năng động', locale: 'zh' },
  { id: 'Chelsie', name: 'Chelsie', gender: 'female', description: 'Anime, dễ thương', locale: 'zh' },
  { id: 'Momo', name: 'Momo', gender: 'female', description: 'Vui nhộn, tinh nghịch', locale: 'zh' },
  { id: 'Vivian', name: 'Vivian', gender: 'female', description: 'Tự tin, cá tính', locale: 'zh' },
  { id: 'Moon', name: 'Moon', gender: 'male', description: 'Mạnh mẽ, phong độ', locale: 'zh' },
  { id: 'Maia', name: 'Maia', gender: 'female', description: 'Thông minh, nhẹ nhàng', locale: 'zh' },
  { id: 'Kai', name: 'Kai', gender: 'male', description: 'Êm dịu, thư giãn', locale: 'zh' },
  { id: 'Nofish', name: 'Nofish', gender: 'male', description: 'Tự nhiên, vui vẻ', locale: 'zh' },
  { id: 'Bella', name: 'Bella', gender: 'female', description: 'Trẻ trung, đáng yêu', locale: 'zh' },
  { id: 'Mia', name: 'Mia', gender: 'female', description: 'Ngọt ngào, dịu dàng', locale: 'zh' },
  { id: 'Mochi', name: 'Mochi', gender: 'male', description: 'Thông minh, trẻ trung', locale: 'zh' },
  { id: 'Bellona', name: 'Bellona', gender: 'female', description: 'Mạnh mẽ, rõ ràng', locale: 'zh' },
  { id: 'Vincent', name: 'Vincent', gender: 'male', description: 'Khàn, trầm ấm', locale: 'zh' },
  { id: 'Bunny', name: 'Bunny', gender: 'female', description: 'Bé gái, siêu dễ thương', locale: 'zh' },
  { id: 'Neil', name: 'Neil', gender: 'male', description: 'Chuyên nghiệp, MC tin tức', locale: 'zh' },
  { id: 'Elias', name: 'Elias', gender: 'female', description: 'Học thuật, kể chuyện', locale: 'zh' },
  { id: 'Arthur', name: 'Arthur', gender: 'male', description: 'Mộc mạc, chân thật', locale: 'zh' },
  { id: 'Nini', name: 'Nini', gender: 'female', description: 'Mềm mại, nhẹ nhàng', locale: 'zh' },
  { id: 'Seren', name: 'Seren', gender: 'female', description: 'Ru ngủ, thư giãn', locale: 'zh' },
  { id: 'Pip', name: 'Pip', gender: 'male', description: 'Bé trai, vui nhộn', locale: 'zh' },
  { id: 'Stella', name: 'Stella', gender: 'female', description: 'Ngọt ngào, tuổi teen', locale: 'zh' },
  // English-accent
  { id: 'Jennifer', name: 'Jennifer', gender: 'female', description: 'Cinematic, American English', locale: 'en' },
  { id: 'Ryan', name: 'Ryan', gender: 'male', description: 'Kịch tính, giàu nhịp điệu', locale: 'en' },
  { id: 'Aiden', name: 'Aiden', gender: 'male', description: 'Trẻ trung, American English', locale: 'en' },
  { id: 'Eldric Sage', name: 'Eldric Sage', gender: 'male', description: 'Điềm tĩnh, trí tuệ', locale: 'en' },
  { id: 'Andre', name: 'Andre', gender: 'male', description: 'Trầm ấm, tự nhiên', locale: 'en' },
  // Korean-accent
  { id: 'Sohee', name: 'Sohee', gender: 'female', description: 'Ấm áp, biểu cảm (Korean)', locale: 'ko' },
  // Japanese-accent
  { id: 'Ono Anna', name: 'Ono Anna', gender: 'female', description: 'Hoạt bát, dễ thương (Japanese)', locale: 'ja' },
  // Spanish-accent
  { id: 'Bodega', name: 'Bodega', gender: 'male', description: 'Đam mê, nhiệt huyết (Spanish)', locale: 'es' },
  { id: 'Sonrisa', name: 'Sonrisa', gender: 'female', description: 'Vui vẻ, Latin American', locale: 'es' },
  // Russian-accent
  { id: 'Alek', name: 'Alek', gender: 'male', description: 'Lạnh lùng nhưng ấm áp (Russian)', locale: 'ru' },
  // Italian-accent
  { id: 'Dolce', name: 'Dolce', gender: 'male', description: 'Thoải mái, lãng mạn (Italian)', locale: 'it' },
  // German-accent
  { id: 'Lenn', name: 'Lenn', gender: 'female', description: 'Lý trí, cá tính (German)', locale: 'de' },
  // French-accent
  { id: 'Emilien', name: 'Emilien', gender: 'male', description: 'Lãng mạn, ấm áp (French)', locale: 'fr' },
  // Portuguese-accent
  { id: 'Radio Gol', name: 'Radio Gol', gender: 'male', description: 'Bình luận viên (Portuguese)', locale: 'pt' },
  { id: 'Katerina', name: 'Katerina', gender: 'female', description: 'Trưởng thành, giàu cảm xúc', locale: 'zh' },

  // ── Chinese Dialect voices (Chinese only) ──
  { id: 'Jada', name: 'Jada', gender: 'female', description: 'Thượng Hải', locale: 'dialect', dialect: 'shanghainese' },
  { id: 'Dylan', name: 'Dylan', gender: 'male', description: 'Bắc Kinh', locale: 'dialect', dialect: 'beijing' },
  { id: 'Li', name: 'Li', gender: 'male', description: 'Nam Kinh', locale: 'dialect', dialect: 'nanjing' },
  { id: 'Marcus', name: 'Marcus', gender: 'male', description: 'Thiểm Tây', locale: 'dialect', dialect: 'shaanxi' },
  { id: 'Roy', name: 'Roy', gender: 'male', description: 'Mân Nam (Hokkien)', locale: 'dialect', dialect: 'minnan' },
  { id: 'Peter', name: 'Peter', gender: 'male', description: 'Thiên Tân', locale: 'dialect', dialect: 'tianjin' },
  { id: 'Sunny', name: 'Sunny', gender: 'female', description: 'Tứ Xuyên', locale: 'dialect', dialect: 'sichuan' },
  { id: 'Eric', name: 'Eric', gender: 'male', description: 'Tứ Xuyên (Thành Đô)', locale: 'dialect', dialect: 'sichuan' },
  { id: 'Rocky', name: 'Rocky', gender: 'male', description: 'Quảng Đông', locale: 'dialect', dialect: 'cantonese' },
  { id: 'Kiki', name: 'Kiki', gender: 'female', description: 'Quảng Đông (Hong Kong)', locale: 'dialect', dialect: 'cantonese' },
];

// Supported language_type values — matches Alibaba Cloud DashScope docs exactly.
// Vietnamese is NOT a valid language_type; use 'auto' instead (API auto-detects VI).
export const SUPPORTED_LANGUAGES = [
  { id: 'auto', name: 'Tự động (Vietnamese, ...)' },
  { id: 'Chinese', name: 'Tiếng Trung' },
  { id: 'English', name: 'Tiếng Anh' },
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
/**
 * Retry wrapper for rate-limited API calls.
 * Retries up to maxRetries times on 429 or "rate limit" errors with exponential backoff.
 */
async function withRetry(fn, maxRetries = 4, baseDelayMs = 2000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err.response?.status === 429 ||
        err.message?.toLowerCase().includes('rate limit') ||
        err.message?.toLowerCase().includes('throttl');

      if (!isRateLimit || attempt === maxRetries) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt); // 2s, 4s, 8s, 16s
      console.warn(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

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

  const apiKey = await getApiKey();
  const baseUrl = await getBaseUrl();

  let response;
  try {
    response = await withRetry(() =>
      axios.post(
        `${baseUrl}${config.qwen.ttsEndpoint}`,
        { model, input },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      )
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
  // Use ffprobe for reliable duration — WAV header parsing was giving wrong values
  const duration = await getAudioDuration(wavBuffer).catch(() => getWavDurationMs(wavBuffer) / 1000);
  return {
    buffer: wavBuffer,
    duration, // seconds
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

  // Run batches in parallel — max 2 concurrent to stay under DashScope rate limit (2 QPS free / 5 QPS paid)
  const batchResults = await parallelLimit(
    batches.map(batch => () => synthesizeSingle(batch, voiceId, options)),
    2
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

  const apiKey = await getApiKey();
  const baseUrl = await getBaseUrl();

  let response;
  try {
    response = await axios.post(
      `${baseUrl}${config.qwen.cloneEndpoint}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
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

// In-memory cache for system voice previews: voiceId → base64 WAV (lives for process lifetime)
const _systemPreviewCache = new Map();

/**
 * Generate a preview for a system voice.
 * Returns base64-encoded WAV (cached after first call per voiceId).
 */
export async function previewSystemVoice(voiceId) {
  if (_systemPreviewCache.has(voiceId)) {
    return _systemPreviewCache.get(voiceId);
  }
  const voice = SYSTEM_VOICES.find(v => v.id === voiceId);
  const locale = voice?.locale || 'zh';
  const previewTexts = {
    zh: '你好，这是我的声音示例。',
    en: 'Hello, this is a sample of my voice.',
    ja: 'こんにちは、これは私の声のサンプルです。',
    ko: '안녕하세요, 제 목소리 샘플입니다.',
    es: 'Hola, esta es una muestra de mi voz.',
    fr: 'Bonjour, ceci est un échantillon de ma voix.',
    de: 'Hallo, das ist eine Probe meiner Stimme.',
    ru: 'Здравствуйте, это образец моего голоса.',
    it: 'Ciao, questo è un campione della mia voce.',
    pt: 'Olá, esta é uma amostra da minha voz.',
    dialect: '你好，这是我的声音示例。',
  };
  const langMap = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean', es: 'Spanish', fr: 'French', de: 'German', ru: 'Russian', it: 'Italian', pt: 'Portuguese', dialect: 'Chinese' };
  const previewText = previewTexts[locale] || previewTexts.en;
  const previewLang = langMap[locale] || 'auto';

  const result = await synthesizeSingle(
    previewText,
    voiceId,
    { model: 'qwen3-tts-flash', language: previewLang }
  );
  const dataUri = `data:audio/wav;base64,${result.buffer.toString('base64')}`;
  _systemPreviewCache.set(voiceId, dataUri);
  return dataUri;
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
