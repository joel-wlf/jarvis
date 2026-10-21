import { normalizeUrl } from './server-url'

/** Server discovery only. A QR code never authenticates a device. Legacy codes lose their secret. */
export function parsePairing(data: string): { url: string } | null {
  try {
    let input = data.trim()
    if (input.startsWith('jarvis:')) {
      const p = JSON.parse(input.slice(7)) as { v?: number; url?: string }
      if (p.v !== 1 || typeof p.url !== 'string') return null
      input = p.url
    }
    const u = new URL(normalizeUrl(input))
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || u.pathname !== '/') return null
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const local = host === 'localhost' || host === '::1' || (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) || (host.includes(':') && /^(fc|fd|fe80:)/.test(host)) || /\.(local|lan|home\.arpa)$/.test(host) || !host.includes('.') && !host.includes(':')
    if (u.protocol === 'http:' && !local) return null
    return { url: u.origin }
  } catch { return null }
}
