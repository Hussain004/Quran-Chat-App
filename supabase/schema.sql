-- ============================================================
-- Qur'an Chat App — Supabase Schema
-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- -------------------------------------------------------
-- Core corpus: all 6,236 Qur'anic verses with embeddings
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS verses (
  id            SERIAL PRIMARY KEY,
  surah_number  INT NOT NULL,
  ayah_number   INT NOT NULL,
  arabic_text   TEXT NOT NULL,
  translation   TEXT NOT NULL,        -- Sahih International
  surah_name_en TEXT NOT NULL,
  surah_name_ar TEXT NOT NULL,
  juz_number    INT,
  embedding     vector(768),          -- Gemini gemini-embedding-001 (768-dim)
  UNIQUE(surah_number, ayah_number)
);

-- IVFFlat index for fast cosine similarity search
-- lists = 100 is appropriate for ~6,236 rows
CREATE INDEX IF NOT EXISTS verses_embedding_idx
  ON verses USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- -------------------------------------------------------
-- User profiles (extends Supabase Auth)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile when a new user signs up
-- SET search_path = '' prevents search-path injection and ensures Supabase auth's
-- internal trigger executor (which uses a different search_path) can find the table.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -------------------------------------------------------
-- Chat sessions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title      TEXT DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Messages (user turns + AI turns)
-- cited_verses: [{surah_number, ayah_number, surah_name_en, arabic_text, translation}]
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  cited_verses    JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- Tafseer (Ibn Kathir, English) — one row per ayah
-- No embeddings needed; looked up by (surah_number, ayah_number)
-- Run scripts/ingest-tafseer.js to populate.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tafseer (
  id           BIGSERIAL PRIMARY KEY,
  surah_number SMALLINT NOT NULL,
  ayah_number  SMALLINT NOT NULL,
  text         TEXT NOT NULL,
  source       TEXT DEFAULT 'ibn-kathir',
  UNIQUE(surah_number, ayah_number, source)
);

CREATE INDEX IF NOT EXISTS tafseer_lookup_idx ON tafseer(surah_number, ayah_number);

-- -------------------------------------------------------
-- RPC: vector similarity search over verses + tafseer join
-- tafseer_text is NULL until ingest-tafseer.js has been run
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION match_verses(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.65,
  match_count     INT DEFAULT 8
)
RETURNS TABLE (
  id            INT,
  surah_number  INT,
  ayah_number   INT,
  arabic_text   TEXT,
  translation   TEXT,
  surah_name_en TEXT,
  similarity    FLOAT,
  tafseer_text  TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    v.id,
    v.surah_number,
    v.ayah_number,
    v.arabic_text,
    v.translation,
    v.surah_name_en,
    1 - (v.embedding <=> query_embedding) AS similarity,
    t.text AS tafseer_text
  FROM verses v
  LEFT JOIN tafseer t
    ON t.surah_number = v.surah_number
   AND t.ayah_number  = v.ayah_number
  WHERE 1 - (v.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- -------------------------------------------------------
-- Row Level Security
-- -------------------------------------------------------
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own
CREATE POLICY "profiles_own" ON profiles
  USING (auth.uid() = id);

-- Conversations: users can only access their own
CREATE POLICY "conversations_own" ON conversations
  USING (auth.uid() = user_id);

-- Messages: users can access messages in their conversations
CREATE POLICY "messages_own" ON messages
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

-- verses table is read-only for all authenticated users (no RLS needed for reads)
-- The service key bypasses RLS for the ingest script
