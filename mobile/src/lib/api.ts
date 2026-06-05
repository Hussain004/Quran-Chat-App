import type { AppLanguage } from '@/context/LanguageContext'

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://quran-chat-app-psi.vercel.app'

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
  followUps?: string[]
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

export type ContextVerse = {
  surahNumber: number
  ayahNumber: number
  surahNameEn: string
  arabicText: string
  translation: string
}

export async function fetchVerseContext(surah: number, ayah: number, radius = 3): Promise<ContextVerse[]> {
  const res = await fetch(`${API_BASE}/api/verses?surah=${surah}&ayah=${ayah}&radius=${radius}`)
  if (!res.ok) throw new Error(`Context request failed: ${res.status}`)
  const data = await res.json()
  return data.verses ?? []
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
