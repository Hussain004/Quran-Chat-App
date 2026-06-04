/**
 * Ingest Ibn Kathir tafseer (English) for all 6,236 ayahs into Supabase.
 *
 * Uses the quran.com v4 verses endpoint with tafsirs param — this maps each
 * individual verse to the Ibn Kathir section that covers it, giving per-ayah
 * rows even though Ibn Kathir groups some verses into one section.
 *
 * ~125 paginated requests total (50 verses/page), finishes in ~1 minute.
 * Resumable: existing rows are skipped (ignoreDuplicates).
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

const TAFSEER_ID = 169   // Ibn Kathir (English) on quran.com
const PER_PAGE   = 50
const DELAY_MS   = 300
const SURAH_COUNT = 114

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function stripHtml(html) {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPage(surah, page, retries = 4) {
  const url =
    `https://api.quran.com/api/v4/verses/by_chapter/${surah}` +
    `?tafsirs=${TAFSEER_ID}&per_page=${PER_PAGE}&page=${page}&fields=verse_key`
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt === retries) throw err
      await sleep(attempt * 1000)
    }
  }
}

async function ingest() {
  console.log('=== Qur\'an Tafseer (Ibn Kathir) Ingestion ===\n')
  console.log('Source: api.quran.com verses endpoint (per-ayah tafseer mapping)\n')

  const { count: existing } = await supabase
    .from('tafseer').select('*', { count: 'exact', head: true })
  console.log(`Existing rows: ${existing ?? 0}`)
  if ((existing ?? 0) > 0) {
    console.log('Tip: run  DELETE FROM tafseer;  in Supabase SQL Editor to start fresh.\n')
  } else {
    console.log()
  }

  let totalInserted = 0
  let totalSkipped  = 0
  let totalErrors   = 0

  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    process.stdout.write(`Surah ${String(surah).padStart(3)}/${SURAH_COUNT}… `)

    let page = 1
    let totalPages = 1
    const surahRows = []

    try {
      while (page <= totalPages) {
        const data = await fetchPage(surah, page)
        totalPages = data?.pagination?.total_pages ?? 1

        for (const verse of data?.verses ?? []) {
          const [s, a] = (verse.verse_key ?? '').split(':').map(Number)
          if (!s || !a) continue
          const tafseerObj = verse.tafsirs?.[0]
          const text = stripHtml(tafseerObj?.text ?? tafseerObj?.body ?? '')
          if (!text) continue
          surahRows.push({ surah_number: s, ayah_number: a, text, source: 'ibn-kathir' })
        }

        page++
        if (page <= totalPages) await sleep(DELAY_MS)
      }
    } catch (err) {
      console.error(`FAILED (${err.message})`)
      totalErrors++
      continue
    }

    if (!surahRows.length) {
      console.log('(no tafseer returned)')
      continue
    }

    const { error } = await supabase
      .from('tafseer')
      .upsert(surahRows, { onConflict: 'surah_number,ayah_number,source', ignoreDuplicates: true })

    if (error) {
      console.error(`DB ERROR: ${error.message}`)
      totalErrors += surahRows.length
    } else {
      totalInserted += surahRows.length
      console.log(`✓ ${surahRows.length} ayahs`)
    }

    if (surah < SURAH_COUNT) await sleep(DELAY_MS)
  }

  console.log('\n=== Ingestion complete ===')
  console.log(`✓ Inserted: ${totalInserted}`)
  if (totalSkipped > 0) console.log(`  Skipped:  ${totalSkipped}`)
  if (totalErrors > 0)  console.log(`✗ Errors:   ${totalErrors} surahs (re-run to retry)`)
  console.log('\nVerify: Supabase Table Editor → tafseer → should have ~6,236 rows.')
}

ingest().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
