import * as Speech from 'expo-speech'
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import type { AppLanguage } from '@/context/LanguageContext'
import { API_BASE } from '@/lib/api'

// Map the app language to a full BCP-47 tag so the OS picks a matching voice.
const LANG_MAP: Record<AppLanguage, string> = {
  en: 'en-US',
  ur: 'ur-PK',
  ar: 'ar-SA',
}

type SpeakCallbacks = { onDone: () => void; onError: () => void }

// A monotonically increasing token. stop() bumps it to invalidate any in-flight
// playback or synthesis so a request that resolves *after* the user hit stop
// does not start playing.
let generation = 0
let currentAbort: AbortController | null = null

// =========================================================================
// Primary: neural cloud voice (Microsoft Edge TTS via our /api/tts route).
// Far more natural and lively than the on-device engine, and consistent
// across devices. Requires the network, falls back to on-device when offline.
// =========================================================================
let activePlayer: ReturnType<typeof createAudioPlayer> | null = null
let audioModeReady = false

function teardownPlayer() {
  if (activePlayer) {
    try { activePlayer.pause() } catch {}
    try { activePlayer.remove() } catch {}
    activePlayer = null
  }
}

// Minimal base64 encoder, Hermes has no btoa/Buffer, and we need to write the
// fetched MP3 bytes to a cache file before expo-audio can play them.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}

async function speakNeural(
  text: string,
  language: AppLanguage,
  cb: SpeakCallbacks,
  isCancelled: () => boolean,
): Promise<void> {
  const controller = new AbortController()
  currentAbort = controller
  const timeout = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (isCancelled()) return
  if (!res.ok) throw new Error(`tts http ${res.status}`)
  const buf = await res.arrayBuffer()
  if (isCancelled()) return
  if (buf.byteLength < 256) throw new Error('tts returned no audio')

  const uri = `${FileSystem.cacheDirectory}tts-${Date.now()}.mp3`
  await FileSystem.writeAsStringAsync(uri, bytesToBase64(new Uint8Array(buf)), { encoding: 'base64' })
  if (isCancelled()) return

  if (!audioModeReady) {
    try { await setAudioModeAsync({ playsInSilentMode: true }) } catch {}
    audioModeReady = true
  }

  teardownPlayer()
  const player = createAudioPlayer({ uri })
  activePlayer = player
  let finished = false
  player.addListener('playbackStatusUpdate', (status) => {
    if (finished) return
    if (status.didJustFinish) {
      finished = true
      teardownPlayer()
      cb.onDone()
    }
  })
  player.play()
}

// =========================================================================
// Fallback: on-device voice (expo-speech). Picks the most natural installed
// voice and tunes the tone so it is as lively as the device allows.
// =========================================================================
let voicesPromise: Promise<Speech.Voice[]> | null = null
function loadVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync().catch(() => [] as Speech.Voice[])
  }
  return voicesPromise
}

const norm = (s: string) => (s ?? '').toLowerCase().replace(/_/g, '-')

function scoreVoice(v: Speech.Voice): number {
  let s = 0
  if (v.quality === Speech.VoiceQuality.Enhanced) s += 100
  const id = norm(v.identifier)
  if (id.includes('neural')) s += 80
  if (id.includes('network')) s += 60
  if (id.includes('enhanced') || id.includes('premium')) s += 40
  if (id.includes('compact')) s -= 40
  if (id.includes('eloquence')) s -= 80 // legacy, very robotic
  return s
}

async function bestVoiceFor(langFull: string): Promise<string | undefined> {
  const voices = await loadVoices()
  if (!voices.length) return undefined
  const prefix = langFull.slice(0, 2)
  const matching = voices.filter(v => norm(v.language).startsWith(prefix))
  const pool = matching.length ? matching : voices
  return [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0]?.identifier
}

// Android caps a single utterance (~4000 chars) and silently truncates longer
// ones. Split on sentence boundaries and queue the chunks.
function chunkText(text: string, max = 3500): string[] {
  if (text.length <= max) return [text]
  const sentences = text.match(/[^.!?؟\n]+[.!?؟\n]*/g) ?? [text]
  const chunks: string[] = []
  let cur = ''
  for (const sentence of sentences) {
    if (cur && (cur + sentence).length > max) {
      chunks.push(cur)
      cur = ''
    }
    cur += sentence
  }
  if (cur.trim()) chunks.push(cur)
  return chunks
}

async function speakOnDevice(
  text: string,
  language: AppLanguage,
  cb: SpeakCallbacks,
  isCancelled: () => boolean,
): Promise<void> {
  const langFull = LANG_MAP[language] ?? 'en-US'
  const voice = await bestVoiceFor(langFull)
  if (isCancelled()) return
  const chunks = chunkText(text)
  chunks.forEach((chunk, i) => {
    const isLast = i === chunks.length - 1
    Speech.speak(chunk, {
      language: langFull,
      voice,
      pitch: 1.05,
      rate: 0.97,
      onDone: isLast ? cb.onDone : undefined,
      onStopped: isLast ? cb.onDone : undefined,
      onError: () => cb.onError(),
    })
  })
}

// =========================================================================
// Public API, single entry point. Tries neural first, falls back to device.
// =========================================================================
export async function speak(
  text: string,
  language: AppLanguage,
  callbacks: SpeakCallbacks,
): Promise<void> {
  const myGen = ++generation
  let settled = false
  const onDone = () => { if (!settled) { settled = true; callbacks.onDone() } }
  const onError = () => { if (!settled) { settled = true; callbacks.onError() } }
  const isCancelled = () => myGen !== generation

  try {
    await speakNeural(text, language, { onDone, onError }, isCancelled)
  } catch {
    if (isCancelled()) return
    // Offline or TTS service unavailable, use the on-device voice instead.
    try {
      await speakOnDevice(text, language, { onDone, onError }, isCancelled)
    } catch {
      onError()
    }
  }
}

export function stop(): void {
  generation++
  if (currentAbort) {
    try { currentAbort.abort() } catch {}
    currentAbort = null
  }
  teardownPlayer()
  Speech.stop()
}
