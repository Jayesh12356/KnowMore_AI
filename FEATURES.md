# StudyQuiz AI — Product Overview

> An AI-powered learning platform that turns any topic into study material, flashcards, and auto-graded quizzes — powered by your choice of AI engine.

---

## What It Does

**StudyQuiz AI** lets users add any topic they want to learn, then uses AI to generate comprehensive study content and quizzes. Think of it as a personal tutor that can teach you anything, test your knowledge, and track your progress — all in one place.

---

## Core User Flow

```
Register → Add Topics → Study with AI → Take Quiz → Track Progress → Improve
```

### 1. 📚 Add Topics
Users add topics they want to learn — one at a time, multiple at once, or bulk upload from a file. Each topic gets a title, description, and optional category.

### 2. 🧠 Study with AI
Click any topic to get AI-generated study material:
- **Detailed explanations** broken into clear sections
- **Interactive flashcards** — flip to reveal answers
- **Key concepts** highlighted for quick review

### 3. 📝 Take AI Quizzes
Test your knowledge with AI-generated quizzes:
- **Multiple choice questions** — auto-graded instantly
- **Short answer questions** — AI evaluates your response
- **Randomized retakes** — different questions each time
- **Detailed results** — see what you got right/wrong and why

### 4. 📊 Track Progress
- Per-topic status: **New → In Progress → Completed**
- Best scores, average scores, attempt history
- Global progress bar across all topics

---

## Key Features

### 🤖 Multi-LLM Engine
Users can switch between AI providers on the fly:

| Provider | Model | Speed |
|----------|-------|-------|
| **Groq** | Llama 3.3 70B | ⚡ Ultra-fast |
| **OpenAI** | GPT-4o Mini | 🎯 High quality |
| **Google Gemini** | Gemini 2.0 Flash | ✨ Balanced |

Each generates study material and quizzes differently — users pick what works best for them.

### 🔒 Admin-Controlled Access
Admins decide which AI providers each user can access. Locked providers show a 🔒 icon and can't be selected. New users get Groq enabled by default.

### 📚 Flexible Topic Management
- **Single add** — type a title and click Add
- **Batch add** — queue multiple topics with + button, then add all at once
- **File upload** — upload `.txt`, `.csv`, or `.json` files with topics
- **Categories** — organize topics into groups, filter by category
- **Search** — find topics instantly

### 🗞️ AI News Feed
Stay updated with the latest AI/ML news from top sources, delivered in clean, compact cards with source attribution and publish dates.

### 🌙 Theme Support
- Dark mode and light mode
- System-aware auto-detection
- Manual toggle in header

### 📱 Fully Responsive
Every screen is optimized for:
- 📱 Phones (including small 360px screens)
- 📱 Tablets (768px+)
- 💻 Desktop (1440px+)

---

## Super Admin Panel

A dedicated admin interface at `/admin` for platform management.

### 📊 Dashboard
At-a-glance system overview:
- Total users, active today, banned count
- Quizzes taken today and total
- Popular topics with attempt counts
- Recent activity feed

### 👥 User Management
Full control over every user:
- **Search & filter** — by name, email, or status
- **Sort** — by join date, activity, score, or attempts
- **Ban / Unban** — block abusive users
- **Revoke sessions** — force re-login
- **Delete** — permanently remove user + all data
- **LLM access** — enable/disable AI providers per user

### 📚 Topic Insights
Analytics on topic usage:
- 🔥 Most studied topics (by attempts)
- ❄️ Least studied topics
- ⚠️ Highest failure rate topics

### ⚡ Activity Feed
Real-time stream of all quiz attempts with:
- User identity, topic, score percentage
- Question count, retake indicator
- Click to view full user profile

### ⚙️ Settings
- Change admin password
- Auto-logout after password change

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌───────────────┐
│   Next.js   │────▶│   Express   │────▶│  PostgreSQL   │
│   (Vercel)  │     │  (Render)   │     │   (Render)    │
└─────────────┘     └──────┬──────┘     └───────────────┘
                           │
                     ┌─────┴─────┐
                     │           │
               ┌─────▼───┐ ┌────▼────┐
               │  Redis  │ │   LLM   │
               │(Upstash)│ │Providers│
               └─────────┘ └─────────┘
                            Groq │ OpenAI │ Gemini
```

- **Study material & quizzes** are cached in Redis (fast, avoids re-generation)
- **Scores & progress** are persisted in PostgreSQL
- **Migrations run automatically** on server start — no manual DB setup
- **Admin account auto-seeds** on first boot

---

## Security

- **JWT authentication** for all API routes (7-day tokens)
- **Separate admin auth** with dedicated tokens
- **Password hashing** with bcrypt (10 rounds)
- **Rate limiting** on auth and LLM endpoints
- **Provider enforcement** — backend validates allowed providers per request
- **User banning** — banned users get 403 on login
- **Session revocation** — admin can force re-login via Redis flag

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | Next.js 16, React 19, Vanilla CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| Cache | Redis |
| AI | Groq (Llama 3.3), OpenAI (GPT-4o), Gemini (2.0 Flash) |
| Auth | JSON Web Tokens |
| Deployment | Vercel + Render |

---

*Built with ❤️ for learners who want to study smarter.*
