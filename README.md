# Qur'an Chat

An AI-powered conversational app grounded entirely in Qur'anic verses. Every answer is backed by real citations retrieved via semantic search — no hallucinated content.

<!-- ============================================================
     SCREENSHOTS — place PNG files in docs/screenshots/ and
     uncomment/update the lines below. Suggested captures:
       welcome.png   → Welcome / splash screen
       home.png      → Home screen with suggested topics
       chat.png      → Active chat with verse citation card open
       history.png   → Conversation history screen
     ============================================================ -->

<!--
<p align="center">
  <img src="docs/screenshots/welcome.png" width="22%" />
  <img src="docs/screenshots/home.png"    width="22%" />
  <img src="docs/screenshots/chat.png"    width="22%" />
  <img src="docs/screenshots/history.png" width="22%" />
</p>
-->

## Features

- **Verse-grounded answers** — every reply cites the exact Qur'anic verses used to generate it
- **Semantic search** — questions are matched by meaning, not keywords, using 768-dim embeddings over all 6,236 verses
- **Low-confidence guard** — when no sufficiently close verses are found the app says so instead of guessing
- **Conversation history** — all chats are persisted and grouped by recency (Today / Yesterday / This Week / Earlier)
- **Auto-generated titles** — each conversation gets a 4–6 word title produced by the LLM
- **Islamic design** — dark green palette (`#0D1B14`), gold accent (`#C9A84C`), NoorHira IndoPak Arabic font for verse text
- **Offline-resilient** — failed messages can be retried with one tap

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 56 / React Native 0.85 (expo-router, file-based routing) |
| Backend API | Next.js 16 on Vercel (`/api/chat`, `/api/title`) |
| Database | Supabase (PostgreSQL + `pgvector` for vector search) |
| Embeddings | Jina AI `jina-embeddings-v2-base-en` (768 dimensions) |
| LLM | Groq `llama-3.3-70b-versatile` |
| Auth | Supabase Auth + `expo-secure-store` for session persistence |
| Build | EAS (Expo Application Services) |

## How Hallucination is Prevented

The chat API follows a strict retrieval-first pipeline:

1. The user's question is embedded with the same Jina model used at ingest time.
2. `pgvector` runs a cosine-similarity search over 6,236 pre-embedded verses, returning the top 8 matches above a threshold of **0.60**.
3. Only the retrieved verse texts are injected into the LLM prompt — the model cannot answer from its training data alone.
4. If the highest similarity score falls below 0.60, the app surfaces a **low-confidence warning** in the UI rather than presenting a potentially unfounded answer.
5. The system prompt explicitly forbids the model from adding information not present in the supplied verses.

This means every sentence in a response is traceable to a specific Surah and ayah shown in the citation card below the message.

## Architecture

```
User device (Expo)
    │  POST /api/chat { question, history }
    ▼
Vercel (Next.js API route)
    ├── Jina AI  →  embed question (768-dim vector)
    ├── Supabase pgvector  →  match_verses(embedding, threshold=0.60, count=8)
    ├── Build grounded prompt (verse texts injected)
    └── Groq llama-3.3-70b  →  stream reply
    │  { reply, citedVerses, lowConfidence }
    ▼
Expo app  →  render MessageBubble + VerseCard citations
    └── Supabase  →  persist messages & conversation
```

## Project Structure

```
quran_chat_app/
├── api/                    ← Next.js 16 backend (deployed to Vercel)
│   └── app/api/
│       ├── chat/route.ts   ← Main RAG pipeline
│       └── title/route.ts  ← Auto-title generation
├── mobile/                 ← Expo app
│   └── src/
│       ├── app/            ← expo-router screens
│       ├── components/     ← MessageBubble, VerseCard, TypingIndicator, Skeleton
│       ├── hooks/          ← use-auth
│       └── lib/            ← supabase client, API helpers
├── supabase/
│   └── schema.sql          ← Full DB schema (tables + pgvector + RLS)
└── scripts/
    └── ingest-quran.js     ← One-time verse ingestion script
```

## Setup

### Prerequisites

- Node.js 20+
- Supabase project (free tier works)
- Jina AI API key (free tier)
- Groq API key (free tier)
- Expo account + EAS CLI

### 1. Database

Run `supabase/schema.sql` in the Supabase SQL Editor to create tables, enable `pgvector`, and set up RLS policies.

### 2. Verse Ingestion

```bash
cd scripts
# set SUPABASE_URL, SUPABASE_SERVICE_KEY, JINA_API_KEY in environment
node ingest-quran.js
```

This embeds all 6,236 verses and inserts them into Supabase (takes ~10 minutes on the free Jina tier).

### 3. Backend API

```bash
cd api
cp .env.local.example .env.local   # fill in your keys
npx vercel dev                      # or deploy: npx vercel --prod
```

Environment variables needed: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JINA_API_KEY`, `GROQ_API_KEY`

### 4. Mobile App

```bash
cd mobile
cp .env.example .env               # fill in Supabase anon key + API URL
npx expo start                     # Expo Go for quick dev
# or build APK:
eas build --platform android --profile preview
```

Environment variables needed: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`

## License

MIT
