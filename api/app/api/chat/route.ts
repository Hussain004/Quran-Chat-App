import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const SYSTEM_PROMPT = `You are a respectful Islamic assistant. Your sole purpose is to help users understand the Qur'an.

STRICT RULES — follow these absolutely:
1. Answer ONLY using the Qur'anic verses provided in the context below. Do not use any other knowledge.
2. Every factual claim MUST cite a verse as [Surah Name, Surah:Ayah] — e.g., [Al-Baqarah, 2:286].
3. If the provided verses do not contain a clear answer, say exactly: "I was unable to find verses that directly address this question. Here are the closest relevant verses I found. For a more complete answer, please consult a qualified Islamic scholar."
4. Never speculate, extrapolate, or add interpretation beyond what the provided verses explicitly state.
5. Maintain a tone that is respectful, humble, and reverent.
6. Never say anything disrespectful to the Qur'an, the Prophet ﷺ, or Islam.`

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
    const { message, history = [] } = await req.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    // 1. Embed the user query
    const queryEmbedding = await embedQuery(message)

    // 2. Retrieve the most semantically relevant verses via pgvector
    const { data: verses, error: rpcError } = await supabase.rpc('match_verses', {
      query_embedding: queryEmbedding,
      match_threshold: 0.60,
      match_count: 8,
    })
    if (rpcError) throw new Error(rpcError.message)

    // 3. Build the grounded context from retrieved verses
    const hasRelevantVerses = verses && verses.length > 0
    const verseContext = hasRelevantVerses
      ? verses
          .map((v: any) => `[${v.surah_name_en}, ${v.surah_number}:${v.ayah_number}]\n${v.translation}`)
          .join('\n\n')
      : 'No relevant verses found.'

    const maxSimilarity = hasRelevantVerses
      ? Math.max(...verses.map((v: any) => v.similarity))
      : 0

    const contextualSystemPrompt = `${SYSTEM_PROMPT}

--- RETRIEVED QUR'ANIC VERSES (your only permitted knowledge source) ---
${verseContext}
---`

    // 4. Build chat history in OpenAI format (OpenRouter is OpenAI-compatible)
    const chatHistory = history.slice(-6).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }))

    // 5. Call Groq (free — llama-3.3-70b-versatile, 14,400 req/day free tier)
    const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: contextualSystemPrompt },
          ...chatHistory,
          { role: 'user', content: message },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    })

    if (!chatRes.ok) {
      const err = await chatRes.json()
      throw new Error(`Groq error: ${JSON.stringify(err.error?.message ?? err)}`)
    }

    const chatData = await chatRes.json()
    const reply = chatData.choices?.[0]?.message?.content ?? ''

    return NextResponse.json({
      reply,
      citedVerses: hasRelevantVerses
        ? verses.map((v: any) => ({
            surahNumber: v.surah_number,
            ayahNumber: v.ayah_number,
            surahNameEn: v.surah_name_en,
            arabicText: v.arabic_text,
            translation: v.translation,
            similarity: v.similarity,
          }))
        : [],
      lowConfidence: maxSimilarity < 0.65,
    })
  } catch (err: any) {
    console.error('[/api/chat]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
