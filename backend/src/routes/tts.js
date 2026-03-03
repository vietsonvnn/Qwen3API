import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import {
  createTtsJob,
  updateTtsJob,
  getTtsJobById,
  getTtsJobsByUser,
  deleteTtsJob,
  logUsage,
  getClonedVoicesByUser,
  incrementVoiceUsage,
} from '../services/database.js';
import {
  textToSpeech,
  estimateCharacters,
  SYSTEM_VOICES,
  MODELS,
  SUPPORTED_LANGUAGES,
  splitTextIntoBatches,
  previewSystemVoice,
} from '../services/qwenService.js';
import { mergeAudioBuffers, getAudioDuration } from '../services/audioMerger.js';
import { uploadBuffer } from '../services/storage.js';
import config from '../config/index.js';
import { v4 as uuidv4 } from 'uuid';

const router = new Hono();

// Public endpoints
router.get('/models', (c) => c.json({ data: MODELS }));
router.get('/languages', (c) => c.json({ data: SUPPORTED_LANGUAGES }));

// Apply auth to all routes below
router.use('*', authMiddleware);

// POST /api/tts/system-preview — on-demand preview for a system voice (cached per process)
router.post('/system-preview', async (c) => {
  const { voiceId } = await c.req.json();
  const valid = SYSTEM_VOICES.find(v => v.id === voiceId);
  if (!valid) return c.json({ error: 'Invalid voice ID' }, 400);
  try {
    const audio = await previewSystemVoice(voiceId);
    return c.json({ data: { audio } });
  } catch (err) {
    console.error('system-preview error:', err.message);
    return c.json({ error: err.message || 'Preview failed' }, 500);
  }
});

// POST /api/tts/estimate — estimate character count
router.post('/estimate', async (c) => {
  const body = await c.req.json();
  const { text = '' } = body;
  const characters = estimateCharacters(text);
  const batches = splitTextIntoBatches(text.trim()).length;
  return c.json({ data: { characters, batches } });
});

// POST /api/tts/generate — main TTS generation
router.post('/generate', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();

  const {
    text,
    voiceId,
    voiceName,
    voiceType = 'system',
    language = 'auto',
    jobTitle,
  } = body;

  // Cloned voices must use the vc model; system voices use flash by default
  const model = voiceType === 'cloned' ? 'qwen3-tts-vc-2026-01-22' : (body.model || 'qwen3-tts-flash');

  if (!text?.trim()) return c.json({ error: 'Text is required' }, 400);
  if (!voiceId) return c.json({ error: 'Voice ID is required' }, 400);
  if (text.length > 50000) return c.json({ error: 'Text too long (max 50,000 characters)' }, 400);

  // For cloned voices, verify ownership
  if (voiceType === 'cloned') {
    const userVoices = await getClonedVoicesByUser(userId);
    const owned = userVoices.find(v => v.qwen_voice_id === voiceId);
    if (!owned) return c.json({ error: 'Voice not found or not owned by user' }, 403);
  }

  const totalCharacters = estimateCharacters(text);

  // Create job record with pending status
  const job = await createTtsJob(userId, {
    input_text: text,
    total_characters: totalCharacters,
    voice_id: voiceId,
    voice_name: voiceName || voiceId,
    voice_type: voiceType,
    model,
    language,
    job_title: jobTitle || null,
    status: 'processing',
    started_at: new Date().toISOString(),
  });

  // Process TTS asynchronously (non-blocking response)
  processJob(job.id, userId, text, voiceId, { model, language, totalCharacters }).catch(err => {
    console.error(`Job ${job.id} failed:`, err.message);
  });

  return c.json({ data: job }, 201);
});

// GET /api/tts/jobs — list jobs
router.get('/jobs', async (c) => {
  const userId = c.get('userId');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');
  const status = c.req.query('status');

  const result = await getTtsJobsByUser(userId, { limit, offset, status });
  return c.json({ data: result.jobs, total: result.total });
});

// GET /api/tts/jobs/:id
router.get('/jobs/:id', async (c) => {
  const userId = c.get('userId');
  const jobId = c.req.param('id');
  const job = await getTtsJobById(jobId, userId);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ data: job });
});

// DELETE /api/tts/jobs/:id
router.delete('/jobs/:id', async (c) => {
  const userId = c.get('userId');
  const jobId = c.req.param('id');
  await deleteTtsJob(jobId, userId);
  return c.json({ success: true });
});

// GET /api/tts/download/:id — proxy download to avoid CORS
router.get('/download/:id', async (c) => {
  const userId = c.get('userId');
  const jobId = c.req.param('id');

  const job = await getTtsJobById(jobId, userId);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (!job.output_url) return c.json({ error: 'Audio not ready' }, 404);

  // Redirect to Supabase storage URL
  return c.redirect(job.output_url);
});

// GET /api/tts/jobs/:id/srt — download SRT subtitle file
router.get('/jobs/:id/srt', async (c) => {
  const userId = c.get('userId');
  const jobId = c.req.param('id');
  const job = await getTtsJobById(jobId, userId);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (!job.segments?.length) return c.json({ error: 'No subtitle data for this job' }, 404);

  const srt = job.segments.map((seg, i) =>
    `${i + 1}\n${msToSrtTime(seg.startMs)} --> ${msToSrtTime(seg.endMs)}\n${seg.text.trim()}\n`
  ).join('\n');

  const filename = (job.job_title || job.voice_name || 'subtitles').replace(/[^a-zA-Z0-9_\-]/g, '_');
  c.header('Content-Type', 'text/plain; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${filename}.srt"`);
  return c.text(srt);
});

function msToSrtTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const ms2 = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms2).padStart(3, '0')}`;
}

// =====================================================
// BACKGROUND JOB PROCESSOR
// =====================================================

async function processJob(jobId, userId, text, voiceId, options) {
  const { model, language, totalCharacters } = options;

  try {
    await updateTtsJob(jobId, { status: 'processing', progress_percent: 10 });

    // Generate TTS — parallel batching, returns segments for SRT
    const { buffers, totalCharacters: actualChars, segments } = await textToSpeech(text, voiceId, { model, language });

    await updateTtsJob(jobId, { progress_percent: 60 });

    // Merge all audio chunks into one MP3
    const mergedMp3 = await mergeAudioBuffers(buffers);

    await updateTtsJob(jobId, { progress_percent: 80 });

    // Get duration
    const duration = await getAudioDuration(mergedMp3).catch(() => null);

    // Upload to Supabase Storage
    const audioKey = `audio/${userId}/${jobId}.mp3`;
    const outputUrl = await uploadBuffer(mergedMp3, audioKey, config.storage.audioBucket, 'audio/mpeg');

    // Update job as completed (include segments for SRT export)
    await updateTtsJob(jobId, {
      status: 'completed',
      output_url: outputUrl,
      output_duration_seconds: duration,
      output_file_size_bytes: mergedMp3.length,
      total_characters: actualChars,
      segments: segments,
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    });

    // Log usage
    await logUsage(userId, {
      action_type: 'tts',
      job_id: jobId,
      characters_used: actualChars,
      metadata: { model, voice_id: voiceId },
    });

  } catch (err) {
    console.error(`processJob ${jobId} error:`, err);
    await updateTtsJob(jobId, {
      status: 'failed',
      error_message: err.message,
      progress_percent: 0,
    });
  }
}

export default router;
