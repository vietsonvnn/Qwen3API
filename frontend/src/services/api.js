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

  systemPreview: (voiceId) =>
    api.post('/tts/system-preview', { voiceId }),

  downloadUrl: (jobId) =>
    `/api/tts/download/${jobId}`,

  downloadSrtUrl: (jobId) =>
    `${import.meta.env.VITE_API_URL || ''}/api/tts/jobs/${jobId}/srt`,
};

// Authenticated SRT download (browser <a download> doesn't send auth headers)
export async function downloadSrtFile(jobId, title) {
  const token = localStorage.getItem('access_token');
  const url = `${import.meta.env.VITE_API_URL || ''}/api/tts/jobs/${jobId}/srt`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Không thể tải file SRT');
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `${(title || 'subtitles').replace(/[^\w\-]/g, '_')}.srt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

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
  updateMe: (data) => api.patch('/user/me', data),
};

// =====================================================
// ADMIN
// =====================================================

export const adminApi = {
  getUsers: () => api.get('/admin/users'),
  updateUser: (id, data) => api.patch(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  getAllJobs: (params = {}) => api.get('/admin/jobs', { params }),
  getStats: () => api.get('/admin/stats'),
};

export default api;
