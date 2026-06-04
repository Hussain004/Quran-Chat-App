import { supabase } from '@/lib/supabase'
import type { CitedVerse } from '@/lib/api'

// A saved answer. cited_verses holds the same camelCase CitedVerse shape that
// the messages table and the chat API use, so it renders directly.
export type Bookmark = {
  id: string
  message_id: string | null
  content: string
  cited_verses: CitedVerse[] | null
  created_at: string
}

export async function addBookmark(
  messageId: string,
  content: string,
  citedVerses?: CitedVerse[],
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('bookmarks').insert({
    user_id: user.id,
    message_id: messageId,
    content,
    cited_verses: citedVerses ?? [],
  })
}

export async function removeBookmark(messageId: string): Promise<void> {
  await supabase.from('bookmarks').delete().eq('message_id', messageId)
}

export async function deleteBookmark(id: string): Promise<void> {
  await supabase.from('bookmarks').delete().eq('id', id)
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const { data } = await supabase
    .from('bookmarks')
    .select('*')
    .order('created_at', { ascending: false })
  return (data ?? []) as Bookmark[]
}

// Which of the given message ids are already bookmarked, so the chat can show
// the correct filled/outline icon.
export async function getBookmarkedMessageIds(messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set()
  const { data } = await supabase
    .from('bookmarks')
    .select('message_id')
    .in('message_id', messageIds)
  return new Set((data ?? []).map((b: { message_id: string | null }) => b.message_id).filter(Boolean) as string[])
}
