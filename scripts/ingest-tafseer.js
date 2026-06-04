/**
 * Ingest Ibn Kathir tafseer (English) for all 6,236 ayahs into Supabase.
 *
 * Data source: spa5k/tafsir_api (jsdelivr CDN) — per-ayah Ibn Kathir entries
 * URL: https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/en-tafsir-ibn-kathir/{surah}.json
 *
 * Resumable: existing rows are skipped via ON CONFLICT DO NOTHING.
 * Run `DELETE FROM tafseer;` in Supabase SQL Editor first if re-ingesting from scratch.
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

// Ayah counts per surah (114 entries) — used to validate array lengths
const AYAH_COUNTS = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,
  98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,
  75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
  14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,45,33,27,26,30,
  20,18,32,21,18,33,16,15,27,14,27,15,21,17,18,49,33,31,13,19,17,27,
  44,30,23,54,20,83,36,24,46,33,4,24,36,21,33,13,
]

const DELAY_MS = 200
const SURAH_COUNT = 114

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function stripHtml(html) {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchSurahTafseer(surahNumber, retries = 4) {
  const url = `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/en-tafsir-ibn-kathir/${surahNumber}.json`
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt === retries) throw err
      const wait = attempt * 1500
      console.error(`    Retry ${attempt} for surah ${surahNumber} (${err.message}) — waiting ${wait}ms`)
      await sleep(wait)
    }
  }
}

async function ingest() {
  console.log('=== Qur\'an Tafseer (Ibn Kathir, spa5k/tafsir_api) Ingestion ===\n')

  const { count: existingCount } = await supabase
    .from('tafseer')
    .select('*', { count: 'exact', head: true })
  console.log(`Existing tafseer rows: ${existingCount ?? 0}`)
  if ((existingCount ?? 0) > 0) {
    console.log('  Tip: run DELETE FROM tafseer; in Supabase SQL Editor to start fresh.\n')
  } else {
    console.log()
  }

  let totalInserted = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (let surah = 1; surah <= SURAH_COUNT; surah++) {
    process.stdout.write(`Surah ${String(surah).padStart(3)}/${SURAH_COUNT}… `)

    let data
    try {
      data = await fetchSurahTafseer(surah)
    } catch (err) {
      console.error(`FAILED (${err.message})`)
      totalErrors++
      continue
    }

    // The spa5k dataset has { tafsir: [{id, text}, ...] }
    // id is the GLOBAL ayah index (1-6236), not the within-surah ayah number.
    // We use the array position (0-indexed) as the ayah number instead,
    // which is reliable since items are ordered by ayah within the chapter.
    const tafsirItems = data?.tafsir ?? data?.tafsirs ?? []

    if (!tafsirItems.length) {
      console.log('(empty — skipping)')
      totalErrors++
      continue
    }

    const expectedAyahs = AYAH_COUNTS[surah - 1]
    const rows = tafsirItems
      .map((item, index) => {
        const ayahNumber = index + 1   // 1-indexed within surah
        const text = stripHtml(item?.text ?? '')
        if (!text || ayahNumber > expectedAyahs) return null
        return {
          surah_number: surah,
          ayah_number: ayahNumber,
          text,
          source: 'ibn-kathir',
        }
      })
      .filter(Boolean)

    if (!rows.length) {
      console.log('(no valid rows)')
      continue
    }

    const { error } = await supabase
      .from('tafseer')
      .upsert(rows, { onConflict: 'surah_number,ayah_number,source', ignoreDuplicates: true })

    if (error) {
      console.error(`ERROR: ${error.message}`)
      totalErrors += rows.length
    } else {
      totalInserted += rows.length
      console.log(`✓ ${rows.length} ayahs`)
    }

    if (surah < SURAH_COUNT) await sleep(DELAY_MS)
  }

  console.log('\n=== Ingestion complete ===')
  console.log(`✓ Inserted: ${totalInserted}`)
  if (totalSkipped > 0) console.log(`  Skipped:  ${totalSkipped}`)
  if (totalErrors > 0)  console.log(`✗ Errors:   ${totalErrors} chapters (re-run to retry)`)
  console.log('\nVerify: Supabase Table Editor → tafseer → should have ~6,236 rows.')
}

ingest().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
