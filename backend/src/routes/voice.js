import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import {
  createClonedVoice,
  getClonedVoicesByUser,
  getClonedVoiceById,
  updateClonedVoice,
  deleteClonedVoice,
  logUsage,
} from '../services/database.js';
import { createVoiceprint, previewVoice, SYSTEM_VOICES } from '../services/qwenService.js';
import { uploadBuffer, downloadAndStore, deleteFile } from '../services/storage.js';
import { mergeAudioBuffers } from '../services/audioMerger.js';
import config from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = new Hono();

// Public endpoints (no auth required)
router.get('/system', (c) => {
  return c.json({ data: SYSTEM_VOICES });
});

// Apply auth to all routes below
router.use('*', authMiddleware);

// GET /api/voices — list user's cloned voices
router.get('/', async (c) => {
  const userId = c.get('userId');
  const voices = await getClonedVoicesByUser(userId);
  return c.json({ data: voices });
});

// POST /api/voices/clone — create voiceprint from audio upload
router.post('/clone', async (c) => {
  const userId = c.get('userId');

  // Parse multipart form
  const formData = await c.req.formData();
  const audioFile = formData.get('audio');
  const voiceName = formData.get('name') || 'Giọng của tôi';
  const language = formData.get('language') || 'auto';
  const description = formData.get('description') || '';

  if (!audioFile || !(audioFile instanceof File)) {
    return c.json({ error: 'Missing audio file' }, 400);
  }

  // Validate file type
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/flac', 'audio/aac'];
  if (!allowedTypes.includes(audioFile.type) && !audioFile.name.match(/\.(mp3|wav|m4a|ogg|flac|aac)$/i)) {
    return c.json({ error: 'Unsupported audio format. Use MP3, WAV, M4A, OGG, FLAC or AAC.' }, 400);
  }

  // Validate file size (max 50MB)
  if (audioFile.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large. Maximum 50MB.' }, 400);
  }

  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

  // 1. Create Qwen3 voiceprint
  let qwenVoiceId;
  try {
    qwenVoiceId = await createVoiceprint(audioBuffer, audioFile.name, { voiceName });
  } catch (err) {
    console.error('Voice clone error:', err.message);
    const isLangError = err.message?.toLowerCase().includes('unsupported language');
    const userMsg = isLangError
      ? `Audio mẫu không được hỗ trợ. Qwen3 chỉ hỗ trợ tiếng Anh và tiếng Trung cho voice enrollment. (${err.message})`
      : `Không thể tạo voiceprint: ${err.message}`;
    return c.json({ error: userMsg }, isLangError ? 400 : 500);
  }

  // 2. Store source audio for reference
  const sourceKey = `sources/${userId}/${uuidv4()}_${audioFile.name}`;
  let sourceUrl = null;
  try {
    sourceUrl = await uploadBuffer(audioBuffer, sourceKey, config.storage.sourcesBucket, audioFile.type);
  } catch (err) {
    console.error('Source audio upload failed (non-critical):', err.message);
  }

  // 3. Generate preview audio
  let previewUrl = null;
  const previewText = 'Hello, this is my AI voice.';
  try {
    const preview = await previewVoice(qwenVoiceId, previewText);
    const mergedPreview = await mergeAudioBuffers([preview.buffer]);
    const previewKey = `audio/${userId}/preview_${uuidv4()}.mp3`;
    previewUrl = await uploadBuffer(mergedPreview, previewKey, config.storage.audioBucket, 'audio/mpeg');
  } catch (err) {
    console.error('Preview generation failed (non-critical):', err.message);
  }

  // 4. Save to database
  const voice = await createClonedVoice(userId, {
    qwen_voice_id: qwenVoiceId,
    name: voiceName,
    description,
    language,
    source_file_url: sourceUrl,
    source_filename: audioFile.name,
    source_duration_seconds: null,
    preview_url: previewUrl,
    preview_text: previewText,
  });

  // 5. Log usage
  await logUsage(userId, {
    action_type: 'voice_clone',
    voice_id: voice.id,
    characters_used: 0,
    metadata: { voice_name: voiceName },
  });

  return c.json({ data: voice }, 201);
});

// POST /api/voices/:id/preview — regenerate preview
router.post('/:id/preview', async (c) => {
  const userId = c.get('userId');
  const voiceId = c.req.param('id');

  const voice = await getClonedVoiceById(voiceId, userId);
  if (!voice) return c.json({ error: 'Voice not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const previewText = body.text || 'Xin chào, đây là giọng nói của tôi được tạo bằng AI.';

  const preview = await previewVoice(voice.qwen_voice_id, previewText);
  const merged = await mergeAudioBuffers([preview.buffer]);
  const previewKey = `audio/${userId}/preview_${uuidv4()}.mp3`;
  const previewUrl = await uploadBuffer(merged, previewKey, config.storage.audioBucket, 'audio/mpeg');

  await updateClonedVoice(voiceId, userId, { preview_url: previewUrl, preview_text: previewText });

  return c.json({ data: { preview_url: previewUrl } });
});

// PATCH /api/voices/:id — update voice metadata
router.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const voiceId = c.req.param('id');
  const body = await c.req.json();

  const allowed = {};
  if (body.name) allowed.name = body.name;
  if (body.description !== undefined) allowed.description = body.description;
  if (body.language) allowed.language = body.language;

  const voice = await updateClonedVoice(voiceId, userId, allowed);
  return c.json({ data: voice });
});

// DELETE /api/voices/:id
router.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const voiceId = c.req.param('id');

  const voice = await getClonedVoiceById(voiceId, userId);
  if (!voice) return c.json({ error: 'Voice not found' }, 404);

  await deleteClonedVoice(voiceId, userId);

  await logUsage(userId, {
    action_type: 'voice_delete',
    voice_id: voice.id,
    characters_used: 0,
    metadata: { voice_name: voice.name },
  });

  return c.json({ success: true });
});

export default router;
