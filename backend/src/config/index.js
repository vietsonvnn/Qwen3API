import 'dotenv/config';

const config = {
  port: parseInt(process.env.PORT || '3001'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  qwen: {
    apiKey: process.env.QWEN_API_KEY,
    baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/api/v1',
    ttsEndpoint: '/services/aigc/multimodal-generation/generation',
    cloneEndpoint: '/services/audio/tts/customization',
    // Max chars per batch (512 tokens ≈ 500 chars safe)
    maxCharsPerBatch: 500,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },

  storage: {
    audioBucket: 'qwen-voice-audio',
    sourcesBucket: 'qwen-voice-sources',
  },

  ffmpeg: {
    path: process.env.FFMPEG_PATH || null,
  },
};

// Validate required
const required = ['QWEN_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

export default config;
