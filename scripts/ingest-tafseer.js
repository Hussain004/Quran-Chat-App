/**
 * Ingest Ibn Kathir tafseer (English) for all 6,236 ayahs into Supabase.
 *
 * Data source: quran.com public API v4, tafseer ID 169 (Ibn Kathir)
 * Resumable: existing rows are skipped via ON CONFLICT DO NOTHING.
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
} catch { /* env not found — vars must be set in environment */ }

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})

const TAFSEER_ID = 169     // Ibn Kathir English (simplified) on quran.com
const DELAY_MS = 300       // polite delay between chapter requests
const SURAH_COUNT = 114

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

/** Strip HTML tags and normalise whitespace from quran.com text fields */
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchChapterTafseer(surahNumber, retries = 4) {
  const url = `https://api.quran.com/api/v4/tafsirs/${TAFSEER_ID}/by_chapter/${surahNumber}?fields=text`
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return data.tafsirs ?? []
    } catch (err) {
      if (attempt === retries) throw err
      const wait = attempt * 1500
      console.error(`    Retry ${attempt} for surah ${surahNumber} (${err.message}) — waiting ${wait}ms`)
      await sleep(wait)
    }
  }
}

async function ingest() {
  console.log('=== Qur\'an Tafseer (Ibn Kathir) Ingestion ===\n')

  // Count existing rows so we know if this is a fresh run or resume
  const { count: existingCount } = await supabase
    .from('tafseer')
    .select('*', { count: 'exact', head: true })
  console.log(`Existing tafseer rows: ${existingCount ?? 0}\n`)

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    process.stdout.write(`Surah ${surah}/${SURAH_COUNT}… `)

    let tafsirs
    try {
      tafsirs = await fetchChapterTafseer(surah)
    } catch (err) {
      console.error(`FAILED (${err.message})`)
      totalErrors++
      continue
    }

    if (!tafsirs.length) {
      console.log('(empty — skipping)')
      continue
    }

    // Build rows from verse_key "surah:ayah"
    const rows = tafsirs
      .map(t => {
        const [s, a] = (t.verse_key ?? '').split(':').map(Number)
        if (!s || !a) return null
        const text = stripHtml(t.text ?? '')
        if (!text) return null
        return { surah_number: s, ayah_number: a, text, source: 'ibn-kathir' }
      })
      .filter(Boolean)

    if (!rows.length) {
      console.log('(no valid rows)')
      continue
    }

    const { error, count } = await supabase
      .from('tafseer')
      .upsert(rows, { onConflict: 'surah_number,ayah_number,source', ignoreDuplicates: true })
      .select('id', { count: 'exact', head: true })

    if (error) {
      console.error(`ERROR: ${error.message}`)
      totalErrors += rows.length
    } else {
      const inserted = count ?? rows.length
      const skipped = rows.length - inserted
      totalInserted += inserted
      totalSkipped += skipped
      console.log(`✓ ${rows.length} ayahs (${inserted} new, ${skipped} already existed)`)
    }

    if (surah < SURAH_COUNT) await sleep(DELAY_MS)
  }

  console.log('\n=== Ingestion complete ===')
  console.log(`✓ Inserted: ${totalInserted}`)
  console.log(`  Skipped:  ${totalSkipped}`)
  if (totalErrors > 0) console.log(`✗ Errors:   ${totalErrors} chapters (re-run to retry)`)
  console.log('\nVerify: Supabase Table Editor → tafseer → should have ~6,236 rows.')
}

ingest().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
