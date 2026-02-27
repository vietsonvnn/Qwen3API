# Qwen Voice Tool

Voice cloning + TTS powered by **Alibaba Cloud Qwen3**.

## Quick Start

### 1. Database
Run `database/schema.sql` in your Supabase SQL Editor.

Create two storage buckets in Supabase:
- `qwen-voice-audio` (private)
- `qwen-voice-sources` (private)

### 2. Backend
```bash
cd backend
cp .env.example .env   # Fill in your keys
npm install
npm run dev            # Starts on port 3001
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env   # Fill in Supabase URL + anon key
npm install
npm run dev            # Starts on port 5173
```

## Environment Variables

### Backend (.env)
| Variable | Value |
|---|---|
| `QWEN_API_KEY` | `sk-5c5f057a225246ab9dea18ef68425e9a` |
| `QWEN_BASE_URL` | `https://dashscope-intl.aliyuncs.com/api/v1` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |
| `PORT` | `3001` |
| `CORS_ORIGIN` | `http://localhost:5173` |

### Frontend (.env)
| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key |

## MVP Features
- ✅ TTS với 27 system voices (Qwen3 Flash)
- ✅ Voice Cloning — upload audio → Qwen3 voiceprint
- ✅ Multilingual: VI, EN, ZH, JA, KO, FR, DE, ES, PT, RU
- ✅ Batch processing for long texts (auto-split)
- ✅ Job history + download
- ✅ Auth via Supabase
