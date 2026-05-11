import 'dotenv/config';

const config = {
  port: parseInt(process.env.PORT || '3001'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  qwen: {
    apiKey: process.env.QWEN_API_KEY,
    baseUrl: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/api/v1',
    ttsEndpoint: '/services/aigc/multimodal-generation/generation',
    cloneEndpoint: '/services/audio/tts/customization',
    maxCharsPerBatch: 500,
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  auth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d',
  },

  storage: {
    r2: {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      bucket: process.env.R2_BUCKET,
      publicUrl: (process.env.R2_PUBLIC_URL || '').replace(/\/$/, ''),
    },
  },

  ffmpeg: {
    path: process.env.FFMPEG_PATH || null,
  },
};

const required = [
  'QWEN_API_KEY',
  'DATABASE_URL',
  'JWT_SECRET',
  'GOOGLE_CLIENT_ID',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

export default config;
