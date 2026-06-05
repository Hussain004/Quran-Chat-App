import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Returns a window of verses around a target ayah, so the app can show a cited
// verse in its surrounding context. GET /api/verses?surah=2&ayah=255&radius=3
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const surah = parseInt(searchParams.get('surah') ?? '', 10)
    const ayah = parseInt(searchParams.get('ayah') ?? '', 10)
    const radius = Math.min(Math.max(parseInt(searchParams.get('radius') ?? '3', 10) || 3, 1), 10)

    if (!surah || !ayah || surah < 1 || surah > 114) {
      return NextResponse.json({ error: 'valid surah and ayah are required' }, { status: 400 })
    }

    const from = Math.max(1, ayah - radius)
    const to = ayah + radius

    const { data, error } = await supabase
      .from('verses')
      .select('surah_number, ayah_number, surah_name_en, arabic_text, translation')
      .eq('surah_number', surah)
      .gte('ayah_number', from)
      .lte('ayah_number', to)
      .order('ayah_number', { ascending: true })

    if (error) throw new Error(error.message)

    const verses = (data ?? []).map((v: any) => ({
      surahNumber: v.surah_number,
      ayahNumber: v.ayah_number,
      surahNameEn: v.surah_name_en,
      arabicText: v.arabic_text,
      translation: v.translation,
    }))

    return NextResponse.json({ verses })
  } catch (err: any) {
    console.error('[/api/verses]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'failed' }, { status: 500 })
  }
}
