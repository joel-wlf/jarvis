import type { PairingPayload } from '@jarvis/contract'
import { normalizeUrl } from './http'

/** Parses "jarvis:{...}" from the pairing QR code. */
export function parsePairing(data: string): PairingPayload | null {
  if (!data.startsWith('jarvis:')) return null
  try {
    const p = JSON.parse(data.slice(7)) as Partial<PairingPayload>
    if (p.v !== 1 || typeof p.url !== 'string' || typeof p.code !== 'string') return null
    return { v: 1, url: normalizeUrl(p.url), code: p.code, homeUrl: typeof p.homeUrl === 'string' ? normalizeUrl(p.homeUrl) : undefined }
  } catch {
    return null
  }
}
