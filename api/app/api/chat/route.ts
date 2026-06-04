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
    const { data: verses, error: rpcError } = await supabase.rpc('match_verses', {
      query_embedding: queryEmbedding,
      match_threshold: 0.60,
      match_count: 8,
    })
    if (rpcError) throw new Error(rpcError.message)

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
    })
  } catch (err: any) {
    console.error('[/api/chat]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
