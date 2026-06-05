# Qur'an Chat

An AI-powered conversational app grounded entirely in Qur'anic verses. Every answer is backed by real citations retrieved via semantic search, with no hallucinated content.

<p align="center">
  <img src="docs/screenshots/initial.png" width="320" />
</p>

<div align="center">
<table>
  <tr>
    <td align="center"><b>Welcome (Dark)</b></td>
    <td align="center"><b>Welcome (Light)</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/welcome_dark.png" width="320"/></td>
    <td><img src="docs/screenshots/welcome_light.png" width="320"/></td>
  </tr>
</table>
</div>


<div align="center">
<table>
  <tr>
    <td align="center"><b>Home (Dark)</b></td>
    <td align="center"><b>Home (Light)</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/home_dark.png" width="320"/></td>
    <td><img src="docs/screenshots/home_light.png" width="320"/></td>
  </tr>
</table>
</div>

<div align="center">
<table>
  <tr>
    <td align="center"><b>Chat (Dark)</b></td>
    <td align="center"><b>Chat (Light)</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/chat_dark.png" width="320"/></td>
    <td><img src="docs/screenshots/chat_light.png" width="320"/></td>
  </tr>
</table>
</div>
-->

<div align="center">
<table>
  <tr>
    <td align="center"><b>Prayer (Dark)</b></td>
    <td align="center"><b>Prayer (Light)</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/prayer_dark.png" width="320"/></td>
    <td><img src="docs/screenshots/prayer_light.png" width="320"/></td>
  </tr>
</table>
</div>


## Features

- **Verse-grounded answers**: every reply cites the exact Qur'anic verses used to generate it
- **Ibn Kathir tafseer**: cited verses include collapsible Ibn Kathir commentary, and the model weaves that commentary into its answers so it explains each verse rather than only quoting the translation
- **Query understanding**: each question is first rewritten into a focused English search query, translating names to the spellings used in the translation (for example, Musa becomes Moses) and removing honorifics, which keeps retrieval accurate regardless of how the question is phrased
- **Semantic search**: questions are matched by meaning, not keywords, using 768-dim embeddings over all 6,236 verses
- **Low-confidence guard**: when no sufficiently close verses are found, the app says so and shows no irrelevant citations
- **Natural read-aloud**: tap Listen on any answer to hear it in a natural neural voice (free Microsoft Edge voices for English, Urdu, and Arabic), with an on-device voice as an offline fallback
- **Multi-language responses**: choose English, Urdu, or Arabic in Settings, and answers plus citations come back in the chosen language
- **Light and dark theme**: toggle in Settings with the preference saved across sessions
- **Conversation history**: all chats are persisted and grouped by recency (Today, Yesterday, This Week, Earlier)
- **Auto-generated titles**: each conversation gets a 4 to 6 word title from the LLM
- **Typography and design**: dark green palette with a gold accent, Fraunces display serif for headings and Plus Jakarta Sans for body text, and the NoorHira IndoPak Arabic font for verse text
- **Retry on failure**: failed messages can be retried with one tap

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | Expo SDK 56 / React Native 0.85, expo-router (file-based routing) |
| Backend API | Next.js 16 on Vercel (`/api/chat`, `/api/title`, `/api/tts`) |
| Database | Supabase (PostgreSQL + pgvector for vector search) |
| Embeddings | Jina AI `jina-embeddings-v2-base-en` (768 dimensions) |
| LLM | Groq `llama-3.3-70b-versatile` |
| Tafseer | Ibn Kathir (English) via quran.com API, stored in Supabase |
| Auth | Supabase Auth + expo-secure-store for session persistence |
| TTS | Microsoft Edge neural voices via `/api/tts` (free, no key), with expo-speech as fallback, played through expo-audio |
| Build | EAS (Expo Application Services) |

## How Hallucination is Prevented

The chat API follows a strict retrieval-first pipeline:

1. The user's question is first rewritten by the LLM into a focused English search query. This normalizes names to the spellings used in the English translation (for example, Musa becomes Moses), strips honorifics such as Hazrat and PBUH, and adds thematic keywords. The step is essential: the English-only embedder does not recognize transliterated names, so without it a question about a prophet can retrieve the wrong verses even at high similarity scores.
2. That query is embedded with the same Jina model used at ingest time, and pgvector runs a cosine-similarity search over 6,236 pre-embedded verses, returning the top 8 matches above a threshold of 0.60.
3. The retrieved verse texts and their Ibn Kathir tafseer are injected into the prompt as the only permitted knowledge source. The model is instructed to explain the verses using the tafseer and cannot answer from its training data.
4. If the highest similarity score falls below 0.65, or the model decides the verses do not address the question, the app returns the standard "consult a qualified scholar" reply and shows no citations. Loosely matched verses are never displayed beneath a non-answer.
5. The system prompt forbids the model from adding any information not present in the supplied verses and tafseer, and requires a citation in the form [Surah Name, Surah:Ayah] for every claim.

Every sentence in a confident response is traceable to a specific Surah and ayah shown in the citation card below the message.

## Architecture

```
User device (Expo)
    |  POST /api/chat { message, history, language }
    v
Vercel (Next.js API route)
    |-- Groq               -->  rewrite question into an English search query
    |-- Jina AI            -->  embed the query (768-dim vector)
    |-- Supabase pgvector  -->  match_verses() LEFT JOIN tafseer
    |-- build grounded prompt (verse text + Ibn Kathir tafseer)
    +-- Groq llama-3.3-70b -->  answer in requested language, grounded in tafseer
    |  { reply, citedVerses (with tafseer), lowConfidence }
    v
Expo app  -->  MessageBubble + VerseCard (Arabic + translation + tafseer)
    |-- Listen action  -->  POST /api/tts  -->  neural MP3 played via expo-audio
    +-- Supabase       -->  persist messages and conversation
```

## Project Structure

```
quran_chat_app/
+-- api/                        Next.js 16 backend (deployed to Vercel)
|   +-- app/api/
|       +-- chat/route.ts       Main RAG pipeline (rewrite, embed, retrieve, tafseer, generate)
|       +-- title/route.ts      Auto-title generation
|       +-- tts/route.ts        Neural text-to-speech (Microsoft Edge voices)
+-- mobile/                     Expo app
|   +-- src/
|       +-- app/                expo-router screens
|       |   +-- (auth)/         welcome, login, register
|       |   +-- (app)/          home, history, settings (tab bar)
|       |   +-- chat/[id].tsx   Chat screen
|       +-- components/         MessageBubble, VerseCard, TypingIndicator, Skeleton
|       +-- context/            ThemeContext, LanguageContext
|       +-- hooks/              use-auth
|       +-- lib/                supabase client, API helpers, theme tokens, speech (TTS + fallback)
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
# SUPABASE_URL and SUPABASE_SERVICE_KEY must be set, no extra API key needed
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

The `/api/tts` route needs no extra keys. It uses the free Microsoft Edge read-aloud voices.

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
