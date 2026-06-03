import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 10

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    if (!message?.trim()) {
      return NextResponse.json({ title: 'New Conversation' })
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'user',
            content: `Generate a short, descriptive title (4-6 words max) for a Qur'an conversation that starts with this question: "${message}"\n\nRespond with ONLY the title, no quotes, no punctuation at the end.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 20,
      }),
    })

    if (!res.ok) return NextResponse.json({ title: 'New Conversation' })

    const data = await res.json()
    const title = data.choices?.[0]?.message?.content?.trim() ?? 'New Conversation'
    return NextResponse.json({ title })
  } catch {
    return NextResponse.json({ title: 'New Conversation' })
  }
}
