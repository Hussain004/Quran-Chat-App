import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'

// Real Qur'an recitation (Mishary Rashid Alafasy) of a single ayah, streamed
// from the EveryAyah CDN. Files are named by zero-padded surah + ayah, e.g.
// 2:255 -> 002255.mp3. We play the remote URL directly through expo-audio.
const RECITER = 'Alafasy_128kbps'

function ayahUrl(surah: number, ayah: number): string {
  const s = String(surah).padStart(3, '0')
  const a = String(ayah).padStart(3, '0')
  return `https://everyayah.com/data/${RECITER}/${s}${a}.mp3`
}

// A generation token so a recitation that becomes ready after the user moved on
// (stopped, or started another ayah) does not start playing over the new one.
let generation = 0
let activePlayer: ReturnType<typeof createAudioPlayer> | null = null
let audioModeReady = false

function teardown() {
  if (activePlayer) {
    try { activePlayer.pause() } catch {}
    try { activePlayer.remove() } catch {}
    activePlayer = null
  }
}

export function stopAyah(): void {
  generation++
  teardown()
}

export async function playAyah(
  surah: number,
  ayah: number,
  cb: { onDone: () => void; onError: () => void },
): Promise<void> {
  const myGen = ++generation
  teardown()
  try {
    if (!audioModeReady) {
      // Play through the earpiece/speaker even when the ringer is silenced.
      try { await setAudioModeAsync({ playsInSilentMode: true }) } catch {}
      audioModeReady = true
    }
    if (myGen !== generation) return

    const player = createAudioPlayer({ uri: ayahUrl(surah, ayah) })
    activePlayer = player
    let finished = false
    player.addListener('playbackStatusUpdate', (status) => {
      if (finished) return
      if (status.didJustFinish) {
        finished = true
        teardown()
        cb.onDone()
      }
    })
    player.play()
  } catch {
    if (myGen === generation) {
      teardown()
      cb.onError()
    }
  }
}
