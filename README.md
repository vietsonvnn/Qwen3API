# Qwen Voice Tool

Voice cloning + TTS powered by **Alibaba Cloud Qwen3**.

Stack: PostgreSQL (Railway/Neon/any) · Cloudflare R2 storage · Google OAuth · custom JWT.

---

## Quick Start

### 1. Database

Provision any PostgreSQL (Railway, Neon, RDS, local Docker). Then apply the schema:

```bash
psql "$DATABASE_URL" -f database/schema.sql
```

If migrating from a legacy Supabase project, see [database/migrate-from-supabase.sql](database/migrate-from-supabase.sql) and [scripts/migrate-audio-to-r2.mjs](scripts/migrate-audio-to-r2.mjs).

### 2. Cloudflare R2

1. Cloudflare dashboard → R2 → Create bucket (e.g. `qwen-voice-audio`).
2. Settings → Public access → Connect a Custom Domain (e.g. `audio.your-domain.com`).
3. R2 → Manage R2 API Tokens → Create a R/W token; copy Access Key ID + Secret.
4. CORS rule on the bucket allowing your frontend origin:
   ```json
   [{"AllowedOrigins":["https://<your-frontend>"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"]}]
   ```

### 3. Google OAuth

Cloud Console → APIs & Services → Credentials → OAuth client (Web application). Add authorised origins for your frontend domain. Note the **Client ID** — both backend (`GOOGLE_CLIENT_ID`) and frontend (`VITE_GOOGLE_CLIENT_ID`) must use the same value.

### 4. Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, R2_*, GOOGLE_CLIENT_ID, JWT_SECRET, QWEN_API_KEY
npm install
npm run dev            # → http://localhost:3001
```

Generate `JWT_SECRET` with `openssl rand -hex 32`.

### 5. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_GOOGLE_CLIENT_ID + (optional) VITE_API_URL
npm install
npm run dev            # → http://localhost:5173
```

---

## Environment Variables

### Backend
| Variable | Notes |
|---|---|
| `QWEN_API_KEY` | Alibaba DashScope API key |
| `QWEN_BASE_URL` | `https://dashscope-intl.aliyuncs.com/api/v1` (intl) |
| `DATABASE_URL` | `postgresql://user:pass@host:port/db` |
| `GOOGLE_CLIENT_ID` | Web OAuth client ID — must match frontend |
| `JWT_SECRET` | Random 256-bit hex (rotate to invalidate all sessions) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token |
| `R2_BUCKET` | Bucket name (e.g. `qwen-voice-audio`) |
| `R2_PUBLIC_URL` | Public origin, no trailing slash |
| `CORS_ORIGIN` | Frontend origin |
| `PORT` | Default 3001 |
| `STORAGE_RETENTION_DAYS` | Default 3 — auto-deletes old TTS audio |

### Frontend
| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend origin. Empty in dev (Vite proxies `/api`). |
| `VITE_GOOGLE_CLIENT_ID` | Same as backend's `GOOGLE_CLIENT_ID` |

---

## Features
- TTS với 27 system voices (Qwen3 Flash)
- Voice Cloning — upload audio → Qwen3 voiceprint
- Multilingual: VI, EN, ZH, JA, KO, FR, DE, ES, PT, RU
- Batch processing for long texts (auto-split)
- Job history + download (MP3 + SRT)
- Auth via Google + custom JWT
