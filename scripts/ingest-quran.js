/**
 * Ingest all 6,236 Qur'anic verses into Supabase with Jina AI embeddings.
 *
 * Resumable: already-embedded verses are skipped on re-run.
 * Embedding model: jina-embeddings-v2-base-en (768-dim, 1M free tokens/month)
 *
 * Usage:
 *   cd scripts && node ingest-quran.js
 *
 * Required env vars (in .env at project root):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, JINA_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { readFileSync, writeFileSync, existsSync } from 'fs'
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

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, JINA_API_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !JINA_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, JINA_API_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})

const BATCH_SIZE = 100   // Jina supports up to 2048 inputs per call
const DELAY_MS = 500     // Jina free tier is generous — 500ms between batches is safe

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Jina AI batch embedding — up to 2048 texts per call, 768-dim output
async function embedBatchWithRetry(texts, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${JINA_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'jina-embeddings-v2-base-en',
          input: texts,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(`${res.status}: ${JSON.stringify(err.detail ?? err)}`)
      }
      const data = await res.json()
      // data.data is sorted by index — map back to original order
      const sorted = data.data.sort((a, b) => a.index - b.index)
      return sorted.map(item => item.embedding)  // array of 768-dim float arrays
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`  Batch embed failed (attempt ${attempt}/${retries}), retrying in 5s…`)
      await sleep(5000)
    }
  }
}

async function fetchWithRetry(url, label, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    } catch (err) {
      if (attempt === retries) throw new Error(`${label} failed after ${retries} attempts: ${err.message}`)
      console.warn(`  ${label}: attempt ${attempt}/${retries} failed (${err.message}), retrying in 5s…`)
      await sleep(5000)
    }
  }
}

async function fetchQuranData() {
  const cacheFile = resolve(__dir, 'quran-cache.json')

  if (existsSync(cacheFile)) {
    console.log('Using cached Quran data (quran-cache.json)…')
    return JSON.parse(readFileSync(cacheFile, 'utf8'))
  }

  console.log('Fetching Arabic text from alquran.cloud…')
  const arData = await fetchWithRetry(
    'https://api.alquran.cloud/v1/quran/quran-uthmani',
    'Arabic text'
  )

  console.log('Fetching Sahih International translation…')
  const enData = await fetchWithRetry(
    'https://api.alquran.cloud/v1/quran/en.sahih',
    'English translation'
  )

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

  // Cache locally so re-runs don't need network
  writeFileSync(cacheFile, JSON.stringify(rows))
  console.log(`Loaded and cached ${rows.length} verses.`)
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

    // Embed entire batch in ONE API call
    const texts = batch.map(r => `${r.surah_name_en} ${r.surah_number}:${r.ayah_number} — ${r.translation}`)
    let embeddings
    try {
      embeddings = await embedBatchWithRetry(texts)
    } catch (err) {
      console.error(`\n  Batch embed failed: ${err.message}`)
      errorCount += batch.length
      continue
    }

    const embedded = []
    for (let k = 0; k < batch.length; k++) {
      if (embeddings[k]) {
        batch[k].embedding = embeddings[k]
        embedded.push(batch[k])
      } else {
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
