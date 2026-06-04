import type { AppLanguage } from '@/context/LanguageContext'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://quran-chat-app-psi.vercel.app'

export type Message = {
  role: 'user' | 'assistant'
  content: string
}

export type CitedVerse = {
  surahNumber: number
  ayahNumber: number
  surahNameEn: string
  arabicText: string
  translation: string
  similarity: number
  tafseer: string | null
}

export type ChatResponse = {
  reply: string
  citedVerses: CitedVerse[]
  lowConfidence: boolean
}

export async function sendMessage(
  message: string,
  history: Message[],
  language: AppLanguage = 'en',
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, language }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function generateTitle(firstMessage: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: firstMessage }),
    })
    if (!res.ok) return 'New Conversation'
    const data = await res.json()
    return data.title ?? 'New Conversation'
  } catch {
    return 'New Conversation'
  }
}
