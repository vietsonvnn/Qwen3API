import axios from 'axios';

const api = axios.create({
  // In dev: VITE_API_URL is empty → Vite proxy handles /api → localhost:3001
  // In prod: VITE_API_URL = https://your-backend.railway.app
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  timeout: 120000,
});

// Attach auth token from localStorage
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('access_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// =====================================================
// TTS
// =====================================================

export const ttsApi = {
  estimate: (text) =>
    api.post('/tts/estimate', { text }),

  generate: (data) =>
    api.post('/tts/generate', data),

  getJobs: (params = {}) =>
    api.get('/tts/jobs', { params }),

  getJob: (jobId) =>
    api.get(`/tts/jobs/${jobId}`),

  deleteJob: (jobId) =>
    api.delete(`/tts/jobs/${jobId}`),

  getModels: () =>
    api.get('/tts/models'),

  getLanguages: () =>
    api.get('/tts/languages'),

  downloadUrl: (jobId) =>
    `/api/tts/download/${jobId}`,

  downloadSrtUrl: (jobId) =>
    `/api/tts/jobs/${jobId}/srt`,
};

// =====================================================
// VOICES
// =====================================================

export const voiceApi = {
  getSystemVoices: () =>
    api.get('/voices/system'),

  getMyVoices: () =>
    api.get('/voices'),

  cloneVoice: (formData) =>
    api.post('/voices/clone', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000,
    }),

  previewVoice: (voiceId, text) =>
    api.post(`/voices/${voiceId}/preview`, { text }),

  updateVoice: (voiceId, data) =>
    api.patch(`/voices/${voiceId}`, data),

  deleteVoice: (voiceId) =>
    api.delete(`/voices/${voiceId}`),
};

// =====================================================
// USER
// =====================================================

export const userApi = {
  getMe: () => api.get('/user/me'),
};

export default api;
