# ⚡ StudyQuiz AI

AI-powered study & quiz platform. Add any topic, generate explanations with flashcards, take MCQ + short-answer quizzes — all powered by multi-LLM providers (Groq, OpenAI, Gemini). Includes a full Super Admin panel for user and platform management.

**Live Demo**: [knowmore-ai.vercel.app](https://knowmore-ai.vercel.app)

---

## Features

- 🎯 **AI Study Material** — LLM-generated explanations with flashcards on any topic
- 📝 **AI Quizzes** — MCQ + short-answer questions with auto-grading
- 🤖 **Multi-LLM Support** — Switch between Groq, OpenAI GPT, and Google Gemini
- 🔒 **Admin-Controlled LLM Access** — Admins enable/disable providers per user
- 📊 **Progress Tracking** — Per-topic completion, scores, and retake history
- 📚 **Topic Management** — Add single, bulk, or file-upload topics with categories
- 🗞️ **AI News Feed** — Curated AI/ML news from NewsAPI
- 🛡️ **Super Admin Panel** — User management, activity monitoring, topic insights
- 🌙 **Dark/Light Theme** — System-aware with manual toggle
- 📱 **Fully Responsive** — Optimized for phone, tablet, and desktop

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React, Vanilla CSS |
| Backend | Node.js, Express |
| Database | PostgreSQL |
| Cache | Redis (Upstash) |
| LLM Providers | Groq, OpenAI, Google Gemini |
| Auth | JWT (7-day tokens) |
| Deploy | Vercel (frontend) + Render (backend) |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/Jayesh12356/KnowMore_AI.git
cd KnowMore_AI
```

### 2. Environment Variables

```bash
cp server/.env.example server/.env     # Edit with your keys
cp client/.env.example client/.env.local
```

**Required** in `server/.env`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studyquiz
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key

# LLM Providers (set at least one)
GROK_API_KEY=gsk_xxxx             # Groq
OPENAI_API_KEY=sk-xxxx            # OpenAI
GEMINI_API_KEY=AIza-xxxx          # Google

# Optional: override models
GROK_MODEL=llama-3.3-70b-versatile
OPENAI_MODEL=gpt-4o-mini
GEMINI_MODEL=gemini-2.0-flash
LLM_DEFAULT_PROVIDER=grok
```

**Required** in `client/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

### 3. Local Services

```bash
docker compose up -d   # Postgres + Redis
```

### 4. Backend

```bash
cd server
npm install
npm start              # http://localhost:4000
```

Migrations run automatically on startup. Admin account is auto-seeded:
- **Email**: `admin@knowmore.ai`
- **Password**: `Admin@123`

### 5. Frontend

```bash
cd client
npm install
npm run dev            # http://localhost:3000
```

---

## Deployment

### Backend → Render
- Web Service → connect repo → root directory: `server`
- Build: `npm install` · Start: `npm start`
- Add env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, API keys

### Frontend → Vercel
- Import repo → root directory: `client`
- Add env: `NEXT_PUBLIC_API_URL=https://your-app.onrender.com/api/v1`

---

## Project Structure

```
KnowMore_AI/
├── server/                     # Express backend
│   └── src/
│       ├── routes/
│       │   ├── auth.js         # Login, register
│       │   ├── context.js      # AI study material generation
│       │   ├── quiz.js         # AI quiz generation + grading
│       │   ├── topics.js       # CRUD, bulk, file upload
│       │   ├── progress.js     # Per-topic completion tracking
│       │   ├── news.js         # AI news feed (NewsAPI)
│       │   └── admin.js        # Super admin dashboard + user mgmt
│       ├── services/
│       │   ├── providers/      # Groq, OpenAI, Gemini (pluggable)
│       │   ├── llm.js          # Provider router
│       │   └── redis.js        # Cache layer
│       ├── db/
│       │   ├── migrate.js      # Auto-migrations on startup
│       │   ├── seed-admin.js   # Default admin seeder
│       │   └── client.js       # pg pool
│       └── middleware/
│           ├── auth.js         # JWT user auth
│           └── adminAuth.js    # JWT admin auth
├── client/                     # Next.js 16 frontend
│   └── src/
│       ├── app/
│       │   ├── page.tsx        # Dashboard — topics, providers, progress
│       │   ├── login/          # Auth (login + register)
│       │   ├── study/[id]/     # AI-generated study material
│       │   ├── quiz/[id]/      # AI quiz with auto-grading
│       │   ├── topics/manage/  # Add, delete, bulk upload topics
│       │   ├── news/           # AI news feed
│       │   └── admin/          # Super Admin panel
│       │       ├── page.tsx    # Dashboard stats
│       │       ├── users/      # User list + detail + controls
│       │       ├── topics/     # Topic insights
│       │       ├── activity/   # Activity feed
│       │       ├── settings/   # Change password
│       │       └── login/      # Admin auth
│       ├── components/         # ThemeToggle
│       └── lib/api.ts          # API client (user + admin)
└── docker-compose.yml          # Local Postgres + Redis
```

---

## Admin Panel

Access at `/admin/login` with default credentials above.

| Feature | Description |
|---------|-------------|
| 📊 Dashboard | Total users, active today, quizzes, popular topics |
| 👥 Users | Search, filter, sort, ban/unban, delete, revoke sessions |
| 🤖 LLM Control | Enable/disable AI providers per user |
| 📚 Topics | Most/least studied, highest failure rate |
| ⚡ Activity | Full quiz attempt feed with scores |
| ⚙️ Settings | Change admin password |

---

## License

MIT
