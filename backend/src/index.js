import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import config from './config/index.js';
import ttsRoutes from './routes/tts.js';
import voiceRoutes from './routes/voice.js';
import userRoutes from './routes/user.js';

const app = new Hono();

// CORS
app.use('*', cors({
  origin: config.corsOrigin,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Routes
app.route('/api/tts', ttsRoutes);
app.route('/api/voices', voiceRoutes);
app.route('/api/user', userRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404
app.notFound((c) => c.json({ error: 'Not found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: err.message || 'Internal server error' }, 500);
});

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`Qwen Voice Tool API running on port ${config.port}`);
});
