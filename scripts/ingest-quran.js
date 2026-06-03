/**
 * Ingest all 6,236 Qur'anic verses into Supabase with Gemini embeddings.
 *
 * Resumable: already-embedded verses are skipped, so you can re-run safely
 * if the script is interrupted.
 *
 * Usage:
 *   cd scripts && npm install && node ingest-quran.js
 *
 * Required env vars (in scripts/.env or exported in shell):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env from the project root (one level up from scripts/)
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
} catch {
  // .env not found — expect vars to be set in environment
}

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GEMINI_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const genai = new GoogleGenerativeAI(GEMINI_API_KEY)
const embedModel = genai.getGenerativeModel({ model: 'text-embedding-004' })

const BATCH_SIZE = 50
const DELAY_MS = 1200  // ~50 req/min safely under free tier (1,500 req/min limit)

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function embedWithRetry(text, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await embedModel.embedContent(text)
      return result.embedding.values
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`  Embed failed (attempt ${attempt}/${retries}), retrying in 3s…`)
      await sleep(3000)
    }
  }
}

async function fetchQuranData() {
  console.log('Fetching Arabic text from alquran.cloud…')
  const arRes = await fetch('https://api.alquran.cloud/v1/quran/quran-uthmani')
  if (!arRes.ok) throw new Error(`Arabic fetch failed: ${arRes.status}`)
  const arData = await arRes.json()

  console.log('Fetching Sahih International translation…')
  const enRes = await fetch('https://api.alquran.cloud/v1/quran/en.sahih')
  if (!enRes.ok) throw new Error(`English fetch failed: ${enRes.status}`)
  const enData = await enRes.json()

  const rows = []
  arData.data.surahs.forEach((surah, i) => {
    const enSurah = enData.data.surahs[i]
    surah.ayahs.forEach((ayah, j) => {
      rows.push({
        surah_number:  surah.number,
        ayah_number:   ayah.numberInSurah,
        arabic_text:   ayah.text,
        translation:   enSurah.ayahs[j].text,
        surah_name_en: surah.englishName,
        surah_name_ar: surah.name,
        juz_number:    ayah.juz,
      })
    })
  })

  console.log(`Loaded ${rows.length} verses from API.`)
  return rows
}

async function getAlreadyEmbedded() {
  // Fetch all (surah_number, ayah_number) pairs that already have embeddings
  const { data, error } = await supabase
    .from('verses')
    .select('surah_number, ayah_number')
    .not('embedding', 'is', null)

  if (error) throw error
  const set = new Set(data.map(r => `${r.surah_number}:${r.ayah_number}`))
  console.log(`${set.size} verses already embedded in Supabase.`)
  return set
}

async function ingest() {
  console.log('\n=== Qur\'an Chat — Data Ingestion ===\n')

  const [rows, alreadyDone] = await Promise.all([
    fetchQuranData(),
    getAlreadyEmbedded(),
  ])

  const pending = rows.filter(r => !alreadyDone.has(`${r.surah_number}:${r.ayah_number}`))
  console.log(`${pending.length} verses to embed and insert.\n`)

  if (pending.length === 0) {
    console.log('All verses already ingested! ✓')
    return
  }

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(pending.length / BATCH_SIZE)

    process.stdout.write(`Batch ${batchNum}/${totalBatches} (verses ${i + 1}–${i + batch.length})… `)

    // Embed each verse in the batch
    const embedded = []
    for (const row of batch) {
      try {
        const text = `${row.surah_name_en} ${row.surah_number}:${row.ayah_number} — ${row.translation}`
        row.embedding = await embedWithRetry(text)
        embedded.push(row)
      } catch (err) {
        console.error(`\n  Failed to embed ${row.surah_number}:${row.ayah_number}: ${err.message}`)
        errorCount++
      }
    }

    // Upsert the batch
    if (embedded.length > 0) {
      const { error } = await supabase.from('verses').upsert(embedded, {
        onConflict: 'surah_number,ayah_number',
      })
      if (error) {
        console.error(`\n  Upsert error: ${error.message}`)
        errorCount += embedded.length
      } else {
        successCount += embedded.length
        console.log(`✓ (${successCount} total)`)
      }
    }

    // Rate limit: stay well under Gemini free tier
    if (i + BATCH_SIZE < pending.length) {
      await sleep(DELAY_MS)
    }
  }

  console.log('\n=== Ingestion complete ===')
  console.log(`✓ Success: ${successCount} verses`)
  if (errorCount > 0) {
    console.log(`✗ Errors:  ${errorCount} verses (re-run the script to retry)`)
  }
  console.log('\nVerify in Supabase: Table Editor → verses → confirm 6,236 rows with non-null embeddings.')
}

ingest().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
