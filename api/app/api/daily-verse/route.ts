import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const maxDuration = 15

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// A curated rotation of well-known, uplifting single ayat so the verse of the
// day is always meaningful (rather than a random, possibly obscure verse).
const DAILY_VERSES: [number, number][] = [
  [94, 5], [94, 6], [2, 286], [13, 28], [39, 53], [3, 139],
  [2, 153], [65, 3], [16, 97], [49, 13], [2, 152], [14, 7],
  [93, 5], [2, 45], [3, 159], [64, 11], [3, 200], [8, 46],
  [24, 35], [55, 13], [2, 255], [40, 60], [29, 69], [6, 162],
]

export async function GET() {
  try {
    // Deterministic per UTC day so everyone sees the same verse that day.
    const dayNumber = Math.floor(Date.now() / 86400000)
    const [surah, ayah] = DAILY_VERSES[dayNumber % DAILY_VERSES.length]

    const { data, error } = await supabase
      .from('verses')
      .select('surah_number, ayah_number, surah_name_en, arabic_text, translation')
      .eq('surah_number', surah)
      .eq('ayah_number', ayah)
      .limit(1)

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'verse not found' }, { status: 404 })
    }

    const v = data[0]
    return NextResponse.json({
      verse: {
        surahNumber: v.surah_number,
        ayahNumber: v.ayah_number,
        surahNameEn: v.surah_name_en,
        arabicText: v.arabic_text,
        translation: v.translation,
      },
    }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
  } catch (err: any) {
    console.error('[/api/daily-verse]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'failed' }, { status: 500 })
  }
}
