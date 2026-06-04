import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const BASE_SYSTEM_PROMPT = `You are a respectful Islamic assistant. Your sole purpose is to help users understand the Qur'an.

STRICT RULES — follow these absolutely:
1. Answer ONLY using the Qur'anic verses and their Tafseer (Ibn Kathir's commentary) provided in the context below. Do not use any other knowledge.
2. Every factual claim MUST cite the verse as [Surah Name, Surah:Ayah] — e.g., [Al-Baqarah, 2:286].
3. You MAY draw on the Tafseer to give deeper context and interpretation, but you must still cite the verse reference.
4. If the provided verses do not contain a clear answer, say exactly: "I was unable to find verses that directly address this question. For a more complete answer, please consult a qualified Islamic scholar."
5. Never speculate, extrapolate, or add interpretation beyond what the provided verses and Tafseer explicitly state.
6. Maintain a tone that is respectful, humble, and reverent.
7. Never say anything disrespectful to the Qur'an, the Prophet ﷺ, or Islam.`

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  ur: 'IMPORTANT: Write your entire response in Urdu script (اردو). All text including citations must be in Urdu.',
  ar: 'IMPORTANT: Write your entire response in Modern Standard Arabic (فصحى العربية). All text including citations must be in Arabic.',
}

async function groqChat(messages: Array<{ role: string; content: string }>, maxTokens = 800): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.2,
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

    // 1. For non-English queries, translate to English before embedding
    //    so the English-only vector index is searched with correct semantics
    let queryForEmbedding = message
    if (language !== 'en') {
      queryForEmbedding = await groqChat([
        { role: 'system', content: 'Translate the following message to English. Output only the translation, nothing else.' },
        { role: 'user', content: message },
      ], 200)
    }

    // 2. Embed the (English) query
    const queryEmbedding = await embedQuery(queryForEmbedding)

    // 3. Retrieve most semantically relevant verses via pgvector
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

    // 4. Build grounded context — include tafseer snippet when available
    const TAFSEER_SNIPPET = 500  // chars of Ibn Kathir to inject per verse
    const verseContext = hasRelevantVerses && !lowConfidence
      ? verses
          .map((v: any) => {
            let entry = `[${v.surah_name_en}, ${v.surah_number}:${v.ayah_number}]\n${v.translation}`
            if (v.tafseer_text) {
              const snippet = v.tafseer_text.length > TAFSEER_SNIPPET
                ? v.tafseer_text.slice(0, TAFSEER_SNIPPET) + '…'
                : v.tafseer_text
              entry += `\nTafseer (Ibn Kathir): ${snippet}`
            }
            return entry
          })
          .join('\n\n')
      : 'No relevant verses found.'

    const languageInstruction = LANGUAGE_INSTRUCTIONS[language] ?? ''
    const systemPrompt = [BASE_SYSTEM_PROMPT, languageInstruction, `\n--- RETRIEVED QUR'ANIC VERSES (your only permitted knowledge source) ---\n${verseContext}\n---`]
      .filter(Boolean)
      .join('\n\n')

    // 5. Build chat history and call Groq
    const chatHistory = history.slice(-6).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }))

    const reply = await groqChat([
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: message },
    ])

    return NextResponse.json({
      reply,
      // Only return cited verses when confidence is high enough — low-confidence
      // results would show irrelevant verses that confuse the user
      citedVerses: !lowConfidence && hasRelevantVerses
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
      lowConfidence,
    })
  } catch (err: any) {
    console.error('[/api/chat]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
