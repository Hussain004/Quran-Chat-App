/**
 * Lists all Gemini models available for your API key and shows which ones
 * support embedContent. Run: node list-models.js
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
try {
  const lines = readFileSync(resolve(__dir, '../.env'), 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
} catch {}

const KEY = process.env.GEMINI_API_KEY

async function list(label, url, headers) {
  const res = await fetch(url, { headers })
  const data = await res.json()
  if (!res.ok) {
    console.log(`[${label}] Error ${res.status}: ${JSON.stringify(data.error?.message)}`)
    return
  }
  const all = data.models ?? []
  const embed = all.filter(m => m.supportedGenerationMethods?.includes('embedContent'))
  console.log(`\n[${label}] ${all.length} total models, ${embed.length} support embedContent:`)
  embed.forEach(m => console.log(`  ${m.name}  (${m.displayName})`))
}

// Try both auth styles
await list(
  'header auth (AQ. style)',
  'https://generativelanguage.googleapis.com/v1/models',
  { 'x-goog-api-key': KEY }
)
await list(
  'query param auth (AIzaSy style)',
  `https://generativelanguage.googleapis.com/v1/models?key=${KEY}`,
  {}
)
await list(
  'v1beta + header',
  'https://generativelanguage.googleapis.com/v1beta/models',
  { 'x-goog-api-key': KEY }
)
