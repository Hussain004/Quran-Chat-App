/**
 * Ingest Ibn Kathir tafseer (English) for all 6,236 ayahs into Supabase.
 *
 * Strategy: fetch tafseer SECTIONS from quran.com (by_chapter, ID 169),
 * then EXPAND each section to cover every verse in its range.
 * e.g. Al-Baqarah has 9 sections → expanded to 286 per-ayah rows.
 *
 * Verses within the same section share the same commentary text — this is
 * correct; Ibn Kathir commented on groups of related verses together.
 *
 * 114 HTTP requests total. Resumable (ignoreDuplicates on upsert).
 *
 * Usage:
 *   cd scripts && node ingest-tafseer.js
 *
 * Required env vars (in .env at project root):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dir, '../.env')
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
} catch { /* vars must be in environment */ }

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})

const TAFSEER_ID  = 169   // Ibn Kathir (English, condensed) on quran.com
const DELAY_MS    = 400
const SURAH_COUNT = 114

// Ayah counts for all 114 surahs
const AYAH_COUNTS = [
   7,286,200,176,120,165,206, 75,129,109,
 123,111, 43, 52, 99,128,111,110, 98,135,
 112, 78,118, 64, 77,227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83,182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 45, 33, 27,
  26, 30, 20, 18, 32, 21, 18, 33, 16, 15,
  27, 14, 27, 15, 21, 17, 18, 49, 33, 31,
  13, 19, 17, 27, 44, 30, 23, 54, 20, 83,
  36, 24, 46, 33,
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function stripHtml(html) {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}

async function fetchSections(surah, retries = 4) {
  const url = `https://api.quran.com/api/v4/tafsirs/${TAFSEER_ID}/by_chapter/${surah}?fields=text`
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.tafsirs ?? []
    } catch (err) {
      if (attempt === retries) throw err
      await sleep(attempt * 1500)
    }
  }
}

async function ingest() {
  console.log("=== Qur'an Tafseer (Ibn Kathir) Ingestion ===\n")
  console.log('Strategy: fetch sections → expand each section to cover all verses in its range\n')

  const { count: existing } = await supabase
    .from('tafseer').select('*', { count: 'exact', head: true })
  console.log(`Existing rows: ${existing ?? 0}`)
  if ((existing ?? 0) > 0) {
    console.log('Tip: run  DELETE FROM tafseer;  in Supabase SQL Editor to start fresh.\n')
  } else {
    console.log()
  }

  let totalInserted = 0
  let totalErrors   = 0

  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    process.stdout.write(`Surah ${String(surah).padStart(3)}/${SURAH_COUNT}… `)

    let rawSections
    try {
      rawSections = await fetchSections(surah)
    } catch (err) {
      console.error(`FAILED (${err.message})`)
      totalErrors++
      continue
    }

    if (!rawSections.length) {
      console.log('(no sections — skipping)')
      continue
    }

    // Parse sections into [{ayah, text}] sorted by ayah number
    const sections = rawSections
      .map(s => {
        const [, a] = (s.verse_key ?? '').split(':').map(Number)
        const text = stripHtml(s.text ?? '')
        if (!a || !text) return null
        return { ayah: a, text }
      })
      .filter(Boolean)
      .sort((a, b) => a.ayah - b.ayah)

    if (!sections.length) {
      console.log('(no valid sections)')
      continue
    }

    const maxAyah = AYAH_COUNTS[surah - 1]
    const rows = []

    // Expand each section to cover every verse up to the next section start
    for (let i = 0; i < sections.length; i++) {
      const startAyah = sections[i].ayah
      const endAyah   = i + 1 < sections.length
        ? sections[i + 1].ayah - 1
        : maxAyah

      for (let ayah = startAyah; ayah <= endAyah; ayah++) {
        rows.push({
          surah_number: surah,
          ayah_number:  ayah,
          text:         sections[i].text,
          source:       'ibn-kathir',
        })
      }
    }

    const { error } = await supabase
      .from('tafseer')
      .upsert(rows, { onConflict: 'surah_number,ayah_number,source', ignoreDuplicates: true })

    if (error) {
      console.error(`DB ERROR: ${error.message}`)
      totalErrors += rows.length
    } else {
      totalInserted += rows.length
      const sectionCount = sections.length
      console.log(`✓ ${rows.length} ayahs (from ${sectionCount} section${sectionCount > 1 ? 's' : ''})`)
    }

    if (surah < SURAH_COUNT) await sleep(DELAY_MS)
  }

  console.log('\n=== Ingestion complete ===')
  console.log(`✓ Inserted: ${totalInserted}`)
  if (totalErrors > 0) console.log(`✗ Errors:   ${totalErrors} surahs (re-run to retry)`)
  console.log('\nVerify: Supabase Table Editor → tafseer → should have ~6,000+ rows.')
}

ingest().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
