// Localized, human readable times for the app (Europe/Berlin).
import type { Lang } from './http.js'

const TZ = 'Europe/Berlin'
const loc = (l: Lang) => (l === 'de' ? 'de-DE' : 'en-GB')

export function berlinParts(d: Date, l: Lang) {
  const get = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc(l), { timeZone: TZ, ...o }).format(d)
  return {
    day: get({ day: 'numeric' }),
    weekday: get({ weekday: 'short' }).replace('.', ''),
    month: get({ month: 'short' }).replace('.', ''),
    time: get({ hour: '2-digit', minute: '2-digit', hour12: false }),
    date: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d), // YYYY-MM-DD
    hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(d)) % 24,
    minute: Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, minute: '2-digit' }).format(d)),
  }
}

/** "vor 2 Std." / "2 h ago" for the past, "Sa 18:00" / "Sat 18:00" for the future, "heute 18:00" for today. */
export function when(d: Date, l: Lang, now = new Date()): string {
  const diff = now.getTime() - d.getTime()
  const de = l === 'de'
  if (diff >= 0) {
    const m = Math.round(diff / 60_000)
    if (m < 1) return de ? 'gerade eben' : 'just now'
    if (m < 60) return de ? `vor ${m} Min.` : `${m} min ago`
    const h = Math.round(m / 60)
    if (h < 24) return de ? `vor ${h} Std.` : `${h} h ago`
    const days = Math.round(h / 24)
    return de ? `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}` : `${days} ${days === 1 ? 'day' : 'days'} ago`
  }
  const p = berlinParts(d, l)
  const today = berlinParts(now, l).date
  const tomorrow = berlinParts(new Date(now.getTime() + 86400_000), l).date
  if (p.date === today) return de ? `heute ${p.time}` : `today ${p.time}`
  if (p.date === tomorrow) return de ? `morgen ${p.time}` : `tomorrow ${p.time}`
  return `${p.weekday} ${p.time}`
}

/** Next local 09:00 after now. */
export function tomorrowMorning(now = new Date()): Date {
  const p = berlinParts(now, 'en')
  const hoursToMidnight = 24 - p.hour - p.minute / 60
  return new Date(now.getTime() + (hoursToMidnight + 9) * 3600_000 - (now.getSeconds() * 1000 + now.getMilliseconds()))
}

export const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => [...w.replace(/[^\p{L}]/gu, '')][0]?.toUpperCase() ?? '')
    .join('') || '?'
