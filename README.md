# StudyQuiz AI

AI-powered study & quiz app. Generate explanations, flashcards, and quizzes on 500+ topics using LLMs. Quiz results cached in Redis, scores persisted in Postgres.

## Quick Start

### 1. Clone
```bash
git clone <repo-url>
cd personal_quiz
```

### 2. Environment
```bash
cp server/.env.example server/.env   # Edit with your keys
cp client/.env.example client/.env.local
```

### 3. Local Services
```bash
docker compose up -d   # Postgres + Redis
```

### 4. Backend
```bash
cd server
npm install
npm run db:migrate
npm run db:seed
npm run dev            # http://localhost:4000
```

### 5. Frontend
```bash
cd client
npm install
npm run dev            # http://localhost:3000
```

### 6. Deploy Backend (Render)
- Create Web Service → connect repo → root: `server`
- Build: `npm install` · Start: `npm start`
- Add env vars: `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `JWT_SECRET`

### 7. Deploy Frontend (Vercel)
- Import repo → root: `client`
- Add env: `NEXT_PUBLIC_API_URL=https://your-app.onrender.com/api/v1`

## Architecture

```
Frontend (Next.js/Vercel) → Backend (Express/Render) → Redis (Upstash) + Postgres (Render) + OpenAI
```

Context & quizzes are cached in Redis with TTL. Only scores are persisted to Postgres.

## Project Structure
```
├── server/          # Express backend
│   └── src/
│       ├── routes/  # auth, context, quiz, history
│       ├── services/# redis, llm clients
│       ├── prompts/ # LLM prompt templates
│       ├── db/      # client, migrate, seed
│       └── middleware/
├── client/          # Next.js frontend
│   └── src/
│       ├── app/     # Pages (login, study, quiz, history)
│       └── lib/     # API client
└── docker-compose.yml
```
