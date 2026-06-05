import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

// Speech to text for voice input. Receives an audio file and forwards it to
// Groq's Whisper model (reusing GROQ_API_KEY), keeping the key server-side.
export async function POST(req: NextRequest) {
  try {
    const inForm = await req.formData()
    const file = inForm.get('file')
    const language = (inForm.get('language') as string) || 'en'
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 })
    }

    const groqForm = new FormData()
    groqForm.append('file', file, 'speech.m4a')
    groqForm.append('model', 'whisper-large-v3')
    groqForm.append('language', language)
    groqForm.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: groqForm,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Groq transcription failed: ${res.status} ${err.slice(0, 200)}`)
    }
    const data = await res.json()
    return NextResponse.json({ text: (data.text ?? '').trim() })
  } catch (err: any) {
    console.error('[/api/transcribe]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'transcription failed' }, { status: 500 })
  }
}
