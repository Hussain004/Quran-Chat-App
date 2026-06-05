import { NextRequest, NextResponse } from 'next/server'
import WebSocket from 'ws'
import { createHash, randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 60

// --- Microsoft Edge "read aloud" neural TTS -------------------------------
// Free, no API key. Same backend that powers Edge's Read Aloud feature.
// Protocol: open an authenticated websocket, send a config + SSML message,
// receive MP3 audio chunks. The auth is a Sec-MS-GEC token derived from the
// current 5-minute time window + a fixed trusted-client token.
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const GEC_VERSION = '1-143.0.3650.75'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'

// A lively male neural voice per supported language. Brian (multilingual) is the
// most expressive, animated English Edge voice, noticeably warmer and less flat
// than Andrew (swap for en-US-AndrewMultilingualNeural for a calmer tone, or
// en-US-GuyNeural for a news read). Asad and Hamed are the standard male voices
// for Urdu and Arabic.
const VOICES: Record<string, { voice: string; lang: string }> = {
  en: { voice: 'en-US-BrianMultilingualNeural', lang: 'en-US' },
  ur: { voice: 'ur-PK-AsadNeural', lang: 'ur-PK' },
  ar: { voice: 'ar-SA-HamedNeural', lang: 'ar-SA' },
}

const MAX_CHARS = 5000

function secMsGec(): string {
  // Current time → Windows file-time (100ns ticks), floored to a 5-minute window.
  // secs is a multiple of 300, and ticks = secs * 1e7 is a multiple of 128, which
  // is exactly representable in float64, so .toFixed(0) gives the exact integer
  // string the server expects (matching the reference edge-tts implementation).
  let secs = Math.floor(Date.now() / 1000) + 11644473600
  secs -= secs % 300
  const ticks = (secs * 1e7).toFixed(0)
  return createHash('sha256').update(ticks + TRUSTED_TOKEN, 'ascii').digest('hex').toUpperCase()
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function synthesize(text: string, voice: string, lang: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=${TRUSTED_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${GEC_VERSION}`

    const ws = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    const chunks: Buffer[] = []
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('Edge TTS timeout'))
    }, 45000)

    ws.on('open', () => {
      ws.send(
        `X-Timestamp:${new Date().toString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      )
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
        `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeSsml(text)}</prosody></voice></speak>`
      ws.send(
        `X-RequestId:${randomUUID().replace(/-/g, '')}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toString()}\r\n` +
        `Path:ssml\r\n\r\n${ssml}`
      )
    })

    ws.on('message', (raw, isBinary) => {
      const data = raw as Buffer
      if (isBinary) {
        // Each binary frame: [2-byte big-endian header length][header][audio]
        const headerLen = (data[0] << 8) | data[1]
        const header = data.slice(2, 2 + headerLen).toString('utf8')
        if (header.includes('Path:audio')) chunks.push(data.slice(2 + headerLen))
      } else if (data.toString().includes('Path:turn.end')) {
        clearTimeout(timer)
        ws.close()
        resolve(Buffer.concat(chunks))
      }
    })

    ws.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function POST(req: NextRequest) {
  try {
    const { text, language = 'en' } = await req.json()
    const clean = typeof text === 'string' ? text.trim().slice(0, MAX_CHARS) : ''
    if (!clean) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const { voice, lang } = VOICES[language] ?? VOICES.en

    // One retry, the websocket occasionally drops on a cold connection.
    let audio: Buffer
    try {
      audio = await synthesize(clean, voice, lang)
    } catch {
      audio = await synthesize(clean, voice, lang)
    }

    if (!audio || audio.length < 200) {
      return NextResponse.json({ error: 'synthesis produced no audio' }, { status: 502 })
    }

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err: any) {
    console.error('[/api/tts]', err?.message)
    return NextResponse.json({ error: err?.message ?? 'tts failed' }, { status: 500 })
  }
}
