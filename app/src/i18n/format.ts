// Date helpers for the UI, localized through Intl.
import i18n, { locale } from './index'
import { JarvisError } from '@/api/http'

export function longDate(d = new Date()): string {
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })
}

export function weekday(d: Date | string = new Date(), style: 'short' | 'long' = 'short'): string {
  return new Date(d).toLocaleDateString(locale(), { weekday: style })
}

export function clock(d: Date | string = new Date()): string {
  return new Date(d).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
}

/** "vor 5 Min." / "5 min ago" style relative time. */
export function ago(isoDate?: string | null): string {
  if (!isoDate) return ''
  const diff = (new Date(isoDate).getTime() - Date.now()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' })
  const abs = Math.abs(diff)
  if (abs < 60) return rtf.format(Math.round(diff), 'second')
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(isoDate).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })
}

export function bytes(n: number): string {
  const gb = n / 1e9
  return `${gb.toLocaleString(locale(), { maximumFractionDigits: gb < 10 ? 1 : 0 })} GB`
}

/** Plain-language message for any error thrown by the API layer. */
export function errorText(e: unknown): string {
  if (e instanceof JarvisError) {
    // Admin API errors arrive as German sentences already; app API messages are technical.
    if (e.status && e.message && !/^HTTP \d+$/.test(e.message) && e.code !== 'unauthorized' && e.code !== 'network' && e.code !== 'timeout') {
      if (i18n.language === 'de' || e.code === 'invalid' || e.code === 'forbidden') return e.message
    }
    return i18n.t(`errors.${e.code}`)
  }
  return i18n.t('common.error')
}
