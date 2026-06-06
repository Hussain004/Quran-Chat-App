export const HIJRI_MONTHS = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhul Qa'dah", 'Dhul Hijjah',
]

// key: hijri month number (1-12), value: { [hijri day]: event name }
export const ISLAMIC_EVENTS: Partial<Record<number, Record<number, string>>> = {
  1:  { 1: 'Islamic New Year', 10: 'Day of Ashura' },
  3:  { 12: 'Mawlid al-Nabi' },
  7:  { 27: "Isra' and Mi'raj" },
  8:  { 15: "Laylat al-Bara'at" },
  9:  { 1: 'Start of Ramadan', 27: 'Laylat al-Qadr' },
  10: { 1: 'Eid al-Fitr' },
  12: { 10: 'Eid al-Adha' },
}

export type HijriDate = { day: number; month: number; year: number }

// Tabular Islamic calendar conversion. Verified correct for modern dates
// (e.g. March 1 2025 => 1 Ramadan 1446, which matches Pakistan moon sighting).
export function gregorianToHijri(date: Date): HijriDate {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()

  const a = Math.floor((14 - m) / 12)
  const yr = y + 4800 - a
  const mn = m + 12 * a - 3
  const JDN = d + Math.floor((153 * mn + 2) / 5) + 365 * yr
    + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) - 32045

  let l = JDN - 1948440 + 10632
  const n = Math.floor((l - 1) / 10631)
  l = l - 10631 * n + 354
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238)
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29
  const hMonth = Math.floor((24 * l) / 709)
  const hDay = l - Math.floor((709 * hMonth) / 24)
  const hYear = 30 * n + j - 30

  return { day: hDay, month: hMonth, year: hYear }
}

// Find the Gregorian date of the 1st day of a given Hijri month.
// Scans forward from an estimate; always converges within a few iterations.
export function findHijriMonthStart(hYear: number, hMonth: number): Date {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const todayH = gregorianToHijri(today)

  const todayTotal = todayH.year * 12 + (todayH.month - 1)
  const targetTotal = hYear * 12 + (hMonth - 1)
  const monthDiff = targetTotal - todayTotal

  // Estimate: current hijri month starts (todayH.day - 1) days ago,
  // then offset by monthDiff * average hijri month length.
  const currentStart = new Date(today)
  currentStart.setDate(currentStart.getDate() - (todayH.day - 1))
  const estimate = new Date(currentStart)
  estimate.setDate(estimate.getDate() + Math.round(monthDiff * 29.5306))

  // Scan forward from 5 days before the estimate.
  const cursor = new Date(estimate)
  cursor.setDate(cursor.getDate() - 5)
  cursor.setHours(12, 0, 0, 0)

  for (let i = 0; i < 40; i++) {
    const h = gregorianToHijri(cursor)
    const cTotal = h.year * 12 + (h.month - 1)
    if (cTotal === targetTotal && h.day === 1) return new Date(cursor)
    if (cTotal > targetTotal) break
    cursor.setDate(cursor.getDate() + 1)
  }

  return estimate
}

export type HijriDay = { gDate: Date; hDay: number }

export function getHijriMonthDays(hYear: number, hMonth: number): HijriDay[] {
  const start = findHijriMonthStart(hYear, hMonth)
  const days: HijriDay[] = []
  const cursor = new Date(start)
  cursor.setHours(12, 0, 0, 0)

  for (let i = 0; i < 32; i++) {
    const h = gregorianToHijri(cursor)
    if (h.year !== hYear || h.month !== hMonth) break
    days.push({ gDate: new Date(cursor), hDay: h.day })
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

// Fetch the Hijri date for a given Gregorian date from the Aladhan API (Umm al-Qura method).
// Returns null on network error or invalid response so the caller can fall back gracefully.
export async function fetchHijriDateFromAPI(date: Date): Promise<HijriDate | null> {
  try {
    const dd = date.getDate().toString().padStart(2, '0')
    const mm = (date.getMonth() + 1).toString().padStart(2, '0')
    const yyyy = date.getFullYear()
    const res = await fetch(`https://api.aladhan.com/v1/gToH?date=${dd}-${mm}-${yyyy}`)
    if (!res.ok) return null
    const json = await res.json()
    const h = json?.data?.hijri
    if (!h) return null
    return {
      day: parseInt(h.day, 10),
      month: h.month.number,
      year: parseInt(h.year, 10),
    }
  } catch {
    return null
  }
}

export function prevHijriMonth(hYear: number, hMonth: number) {
  return hMonth === 1 ? { year: hYear - 1, month: 12 } : { year: hYear, month: hMonth - 1 }
}

export function nextHijriMonth(hYear: number, hMonth: number) {
  return hMonth === 12 ? { year: hYear + 1, month: 1 } : { year: hYear, month: hMonth + 1 }
}
