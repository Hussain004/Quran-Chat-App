# Qur'an Chat

An AI-powered conversational app grounded entirely in Qur'anic verses. Every answer is backed by real citations retrieved via semantic search with no hallucinated content.

<!-- ============================================================
     SCREENSHOTS -- place PNG files in docs/screenshots/ and
     uncomment/update the lines below. Suggested captures:
       welcome.png   -- Welcome / splash screen
       home.png      -- Home screen with suggested topics
       chat.png      -- Active chat with verse citation card open
       history.png   -- Conversation history screen
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

- **Verse-grounded answers**: every reply cites the exact Qur'anic verses used to generate it
- **Ibn Kathir tafseer**: cited verses include collapsible Ibn Kathir commentary; the LLM also draws on tafseer context to give richer, interpretation-aware answers
- **Semantic search**: questions are matched by meaning, not keywords, using 768-dim embeddings over all 6,236 verses
- **Low-confidence guard**: when no sufficiently close verses are found the app says so and shows no irrelevant citations
- **Text-to-speech**: tap the speaker icon on any AI message to have it read aloud; tap again to stop
- **Multi-language responses**: choose English, Urdu, or Arabic in Settings; non-English queries are translated before embedding so the retrieval stays accurate
- **Light and dark theme**: toggle in Settings with preference saved across sessions
- **Conversation history**: all chats persisted and grouped by recency (Today / Yesterday / This Week / Earlier)
- **Auto-generated titles**: each conversation gets a 4-6 word title from the LLM
- **Islamic design**: dark green palette, gold accent, NoorHira IndoPak Arabic font for verse text
- **Retry on failure**: failed messages can be retried with one tap

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 56 / React Native 0.85, expo-router (file-based routing) |
| Backend API | Next.js 16 on Vercel (`/api/chat`, `/api/title`) |
| Database | Supabase (PostgreSQL + pgvector for vector search) |
| Embeddings | Jina AI `jina-embeddings-v2-base-en` (768 dimensions) |
| LLM | Groq `llama-3.3-70b-versatile` |
| Tafseer | Ibn Kathir (English) via quran.com API, stored in Supabase |
| Auth | Supabase Auth + expo-secure-store for session persistence |
| TTS | expo-speech (native device TTS) |
| Build | EAS (Expo Application Services) |

## How Hallucination is Prevented

The chat API follows a strict retrieval-first pipeline:

1. The user's question is embedded with the same Jina model used at ingest time. For Urdu and Arabic questions, the query is first translated to English so the English-only vector index is searched with correct semantics.
2. pgvector runs a cosine-similarity search over 6,236 pre-embedded verses, returning the top 8 matches above a threshold of 0.60.
3. The retrieved verse texts and their Ibn Kathir tafseer snippets are injected into the LLM prompt. The model cannot answer from its training data alone.
4. If the highest similarity score falls below 0.65, the app surfaces a low-confidence warning and returns no citations. Showing loosely-matched verses would mislead the user.
5. The system prompt explicitly forbids the model from adding information not present in the supplied verses and tafseer.

Every sentence in a confident response is traceable to a specific Surah and ayah shown in the citation card below the message.

## Architecture

```
User device (Expo)
    |  POST /api/chat { message, history, language }
    v
Vercel (Next.js API route)
    |-- [if language != en] Groq  -->  translate query to English
    |-- Jina AI              -->  embed English query (768-dim vector)
    |-- Supabase pgvector    -->  match_verses() LEFT JOIN tafseer
    |-- build grounded prompt (verse text + Ibn Kathir snippets)
    +-- Groq llama-3.3-70b   -->  answer in requested language
    |  { reply, citedVerses (with tafseer), lowConfidence }
    v
Expo app  -->  MessageBubble + VerseCard (Arabic + translation + tafseer)
    +-- Supabase  -->  persist messages and conversation
```

## Project Structure

```
quran_chat_app/
+-- api/                        Next.js 16 backend (deployed to Vercel)
|   +-- app/api/
|       +-- chat/route.ts       Main RAG pipeline (embed, retrieve, tafseer, generate)
|       +-- title/route.ts      Auto-title generation
+-- mobile/                     Expo app
|   +-- src/
|       +-- app/                expo-router screens
|       |   +-- (auth)/         welcome, login, register
|       |   +-- (app)/          home, history, settings (tab bar)
|       |   +-- chat/[id].tsx   Chat screen
|       +-- components/         MessageBubble, VerseCard, TypingIndicator, Skeleton
|       +-- context/            ThemeContext, LanguageContext
|       +-- hooks/              use-auth
|       +-- lib/                supabase client, API helpers, theme tokens
+-- supabase/
|   +-- schema.sql              Full DB schema (verses, tafseer, profiles, conversations, messages)
+-- scripts/
    +-- ingest-quran.js         One-time verse ingestion (Jina embeddings)
    +-- ingest-tafseer.js       One-time tafseer ingestion (Ibn Kathir via quran.com)
```

## Setup

### Prerequisites

- Node.js 20+
- Supabase project (free tier works)
- Jina AI API key (free tier)
- Groq API key (free tier)
- Expo account and EAS CLI

### 1. Database

Run `supabase/schema.sql` in the Supabase SQL Editor to create all tables, enable pgvector, configure RLS policies, and create the `match_verses` function.

### 2. Verse Ingestion

```bash
cd scripts
# set SUPABASE_URL, SUPABASE_SERVICE_KEY, JINA_API_KEY in .env at repo root
node ingest-quran.js
```

Embeds all 6,236 verses and inserts them into Supabase. Takes roughly 10 minutes on the free Jina tier.

### 3. Tafseer Ingestion

```bash
cd scripts
# SUPABASE_URL and SUPABASE_SERVICE_KEY must be set -- no extra API key needed
node ingest-tafseer.js
```

Fetches Ibn Kathir sections from the quran.com public API (114 requests), expands each section to cover every verse in its range, and inserts approximately 6,000 per-ayah rows. Takes roughly 1 minute.

### 4. Backend API

```bash
cd api
cp .env.local.example .env.local   # fill in your keys
npx vercel dev                      # or deploy: npx vercel --prod
```

Required environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JINA_API_KEY`, `GROQ_API_KEY`

### 5. Mobile App

```bash
cd mobile
cp .env.example .env               # fill in Supabase anon key and API URL
npx expo start                     # Expo Go for quick iteration
# or build APK:
eas build --platform android --profile preview
```

Required environment variables: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`

## License

MIT
