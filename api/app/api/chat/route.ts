import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const REFUSAL = "I was unable to find verses that directly address this question. For a more complete answer, please consult a qualified Islamic scholar."

const BASE_SYSTEM_PROMPT = `You are a knowledgeable, respectful Islamic assistant whose sole purpose is to help users understand the Qur'an. You answer strictly from the verses and Ibn Kathir's Tafseer (commentary) provided in the context below.

HOW TO ANSWER:
- Write a clear, genuinely helpful answer that synthesizes what the provided verses say about the user's question.
- Actively use Ibn Kathir's Tafseer to explain the meaning, context, and significance of the verses, do NOT merely restate the translation. Weave the Tafseer's explanation into your answer so the user understands the verse, not just reads it.
- Cite every claim with the verse reference in the form [Surah Name, Surah:Ayah], e.g., [Al-Baqarah, 2:286].
- Break longer answers into short paragraphs so they are easy to read.

STRICT GROUNDING RULES, follow absolutely:
1. Use ONLY the provided verses and their Tafseer. Never add outside knowledge, history, hadith, or personal opinion.
2. Never speculate or extrapolate beyond what the verses and Tafseer explicitly state.
3. If the provided verses genuinely do not address the question, reply with EXACTLY this sentence and nothing else: "${REFUSAL}"
4. Always remain respectful and reverent toward the Qur'an, the Prophet ﷺ, and Islam.`

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ur: 'IMPORTANT: Write your entire response in Urdu script (اردو). All text including citations must be in Urdu.',
  ar: 'IMPORTANT: Write your entire response in Modern Standard Arabic (فصحى العربية). All text including citations must be in Arabic.',
}

// Turns a user's question (in any language, with honorifics / Arabic-Urdu name
// spellings) into a clean ENGLISH query optimised for semantic search over the
// English (Sahih International) verse translations. This is the single most
// important step for retrieval quality: the English-only embedder does not know
// that "Musa" means "Moses", so without it queries about Islamic figures match
// the wrong verses entirely.
const SEARCH_REWRITE_PROMPT = `You convert a user's question about the Qur'an into ONE concise English search query for a semantic search engine that indexes the English (Sahih International) translation of the Qur'an.

Rules:
- Translate names of prophets, people, places, and tribes to the English spellings used in standard English Qur'an translations, AND keep the original in parentheses. Examples: Musa → Moses (Musa), Isa → Jesus (Isa), Ibrahim → Abraham (Ibrahim), Nuh → Noah (Nuh), Yusuf → Joseph (Yusuf), Maryam → Mary (Maryam), Dawud → David (Dawud), Sulaiman → Solomon (Sulaiman), Harun → Aaron (Harun), Firawn → Pharaoh, Jibreel → Gabriel.
- Remove honorifics and titles entirely: Hazrat, Hadhrat, Sayyiduna, Prophet, Maulana, (PBUH), ﷺ, (AS), (RA).
- Add a few key thematic words that are likely to appear in the verse translations (e.g. for Moses' miracles: signs, staff, hand, sea, Pharaoh).
- Output ONLY the search query text. No quotes, no labels, no explanation. Maximum ~25 words.`

async function groqChat(messages: Array<{ role: string; content: string }>, maxTokens = 1100, temperature = 0.2): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Groq error: ${JSON.stringify(err.error?.message ?? err)}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// Build the English search query. Includes the last couple of turns so that
// follow-up questions ("what about his brother?") resolve correctly. Falls back
// to the raw message if the rewrite call fails, retrieval still works, just
// less precisely.
async function buildSearchQuery(
  message: string,
  history: Array<{ role: string; content: string }>,
): Promise<string> {
  try {
    const recent = history.slice(-2).map(m => `${m.role}: ${m.content}`).join('\n')
    const userContent = recent
      ? `Previous turns (for context only):\n${recent}\n\nConvert this question into a search query: ${message}`
      : message
    const rewritten = await groqChat([
      { role: 'system', content: SEARCH_REWRITE_PROMPT },
      { role: 'user', content: userContent },
    ], 120, 0)
    const cleaned = rewritten.trim().replace(/^["']|["']$/g, '')
    return cleaned.length > 0 ? cleaned : message
  } catch {
    return message
  }
}

// After a grounded answer, suggest a few natural next questions. Kept short and
// in the user's language. Best-effort: any failure just yields no suggestions.
const FOLLOWUP_PROMPT = `Based on the user's question and the assistant's answer about the Qur'an, propose exactly 3 follow-up questions the user is likely to ask next. Rules: each is a full natural question between 4 and 9 words; make them specific and varied (for example ask about a concrete example, a related virtue, or practical guidance); never use vague one or two word questions like "What is patience?". Output ONLY a JSON array of 3 strings, like ["...", "...", "..."]. No other text.`

async function generateFollowUps(message: string, reply: string, language: string): Promise<string[]> {
  try {
    const langNote =
      language === 'ur' ? ' Write the questions in Urdu.'
      : language === 'ar' ? ' Write the questions in Arabic.'
      : ''
    const raw = await groqChat(
      [
        { role: 'system', content: FOLLOWUP_PROMPT + langNote },
        { role: 'user', content: `Question: ${message}\n\nAnswer: ${reply.slice(0, 1200)}` },
      ],
      200,
      0.4,
    )
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start === -1 || end === -1) return []
    const arr = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x: unknown) => typeof x === 'string' && x.trim().length > 0)
      .slice(0, 3)
      .map((s: string) => s.trim())
  } catch {
    return []
  }
}

async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: [text],
    }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Jina embed failed: ${JSON.stringify(err)}`)
  }
  const data = await res.json()
  return data.data[0].embedding
}

// A few well-known verses people ask for by name.
const NAMED_VERSES: Record<string, [number, number]> = {
  'ayat al-kursi': [2, 255],
  'ayatul kursi': [2, 255],
  'ayat ul kursi': [2, 255],
  'ayatul-kursi': [2, 255],
  'throne verse': [2, 255],
  'verse of light': [24, 35],
  'ayat an-nur': [24, 35],
}

// Detect an explicit verse reference in the question: "2:255", "surah 2 verse 255",
// or a named verse. Returns null when none is present.
function parseVerseRef(message: string): { surah: number; ayah: number } | null {
  const lower = message.toLowerCase()
  for (const name in NAMED_VERSES) {
    if (lower.includes(name)) {
      const [surah, ayah] = NAMED_VERSES[name]
      return { surah, ayah }
    }
  }
  let m = message.match(/\b(\d{1,3})\s*[:.]\s*(\d{1,3})\b/)
  if (m) return { surah: +m[1], ayah: +m[2] }
  m = lower.match(/surah\s+(\d{1,3})\D+(?:verse|ayah|ayat)\s+(\d{1,3})/)
  if (m) return { surah: +m[1], ayah: +m[2] }
  return null
}

// Fetch a single verse (plus its tafseer) directly by reference, shaped like a
// match_verses row with similarity 1 so it is treated as a confident match.
async function fetchVerseByRef(surah: number, ayah: number) {
  if (surah < 1 || surah > 114 || ayah < 1) return null
  const { data: vs } = await supabase
    .from('verses')
    .select('surah_number, ayah_number, surah_name_en, arabic_text, translation')
    .eq('surah_number', surah)
    .eq('ayah_number', ayah)
    .limit(1)
  if (!vs || vs.length === 0) return null
  const { data: tf } = await supabase
    .from('tafseer')
    .select('text')
    .eq('surah_number', surah)
    .eq('ayah_number', ayah)
    .limit(1)
  return { ...vs[0], similarity: 1, tafseer_text: tf?.[0]?.text ?? null }
}

export async function POST(req: NextRequest) {
  try {
    const { message, history = [], language = 'en' } = await req.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // 1. Rewrite the question into a clean English search query (normalises
    //    names like Musa→Moses, strips honorifics, adds thematic terms).
    const searchQuery = await buildSearchQuery(message, history)

    // 2. Embed the search query
    const queryEmbedding = await embedQuery(searchQuery)

    // 3. Retrieve the most semantically relevant verses via pgvector
    const { data: rpcVerses, error: rpcError } = await supabase.rpc('match_verses', {
      query_embedding: queryEmbedding,
      match_threshold: 0.60,
      match_count: 8,
    })
    if (rpcError) throw new Error(rpcError.message)

    // 3a. If the user named a specific ayah (e.g. "2:255" or "Ayat al-Kursi"),
    //     fetch it directly and put it first so an exact reference is never
    //     missed by semantic search.
    const ref = parseVerseRef(message)
    const exactVerse = ref ? await fetchVerseByRef(ref.surah, ref.ayah) : null
    const verses = exactVerse
      ? [
          exactVerse,
          ...(rpcVerses ?? []).filter(
            (v: any) => !(v.surah_number === exactVerse.surah_number && v.ayah_number === exactVerse.ayah_number),
          ),
        ].slice(0, 8)
      : rpcVerses ?? []

    const hasRelevantVerses = verses && verses.length > 0
    const maxSimilarity = hasRelevantVerses
      ? Math.max(...verses.map((v: any) => v.similarity))
      : 0
    const lowConfidence = maxSimilarity < 0.65

    // 4. Build grounded context, include a generous Tafseer snippet so the
    //    model has real commentary to explain (not just the translation).
    const TAFSEER_SNIPPET = 1000  // chars of Ibn Kathir to inject per verse
    const verseContext = hasRelevantVerses && !lowConfidence
      ? verses
          .map((v: any) => {
            let entry = `[${v.surah_name_en}, ${v.surah_number}:${v.ayah_number}]\nTranslation: ${v.translation}`
            if (v.tafseer_text) {
              const snippet = v.tafseer_text.length > TAFSEER_SNIPPET
                ? v.tafseer_text.slice(0, TAFSEER_SNIPPET) + '…'
                : v.tafseer_text
              entry += `\nIbn Kathir's Tafseer: ${snippet}`
            }
            return entry
          })
          .join('\n\n')
      : 'No relevant verses found.'

    const languageInstruction = LANGUAGE_INSTRUCTIONS[language] ?? ''
    const systemPrompt = [BASE_SYSTEM_PROMPT, languageInstruction, `\n--- RETRIEVED QUR'ANIC VERSES & TAFSEER (your only permitted knowledge source) ---\n${verseContext}\n---`]
      .filter(Boolean)
      .join('\n\n')

    // 5. Build chat history and call Groq for the grounded answer
    const chatHistory = history.slice(-6).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }))

    const reply = await groqChat([
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: message },
    ])

    // If the model determined the verses don't address the question, suppress
    // the cited verses too, otherwise the UI shows "8 verses cited" beneath an
    // "I couldn't find anything" message, which is contradictory and confusing.
    const refused = reply.trim().startsWith('I was unable to find verses')

    // Suggest follow-up questions only when we actually answered.
    const followUps = refused || lowConfidence ? [] : await generateFollowUps(message, reply, language)

    return NextResponse.json({
      reply,
      citedVerses: !lowConfidence && hasRelevantVerses && !refused
        ? verses.map((v: any) => ({
            surahNumber: v.surah_number,
            ayahNumber: v.ayah_number,
            surahNameEn: v.surah_name_en,
            arabicText: v.arabic_text,
            translation: v.translation,
            similarity: v.similarity,
            tafseer: v.tafseer_text ?? null,
          }))
        : [],
      lowConfidence: lowConfidence || refused,
      followUps,
    })
  } catch (err: any) {
    console.error('[/api/chat]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
