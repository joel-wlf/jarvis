import fs from 'node:fs'
import QRCode from 'qrcode'

export interface LinkStatus {
  state: 'starting' | 'qr' | 'pairing' | 'open' | 'closed' | 'logged_out'
  qr?: string
  pairingCode?: string
  user?: string
  error?: string
  at?: string
}

/** Liest den Verknüpfungsstatus, den wa-ingest schreibt (wa-ingest/src/index.ts, writeLinkStatus). */
export function readLinkStatus(file: string): LinkStatus | null {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8')) as LinkStatus
    return s && typeof s.state === 'string' ? s : null
  } catch {
    return null
  }
}

/** QR-Codes von WhatsApp gelten ca. 20 bis 60 Sekunden; ältere nicht mehr anzeigen. */
const QR_MAX_AGE_MS = 70_000

export async function linkView(file: string) {
  const s = readLinkStatus(file)
  if (!s) return { state: 'unknown' as const }
  const age = s.at ? Date.now() - Date.parse(s.at) : Infinity
  const view: Record<string, unknown> = { state: s.state, at: s.at, user: s.user ? maskPhone(s.user) : undefined, error: s.error }
  if (s.state === 'qr' && s.qr) {
    if (age < QR_MAX_AGE_MS) view.qrSvg = await QRCode.toString(s.qr, { type: 'svg', margin: 1, errorCorrectionLevel: 'L' })
    else view.expired = true
  }
  if (s.state === 'pairing' && s.pairingCode) view.pairingCode = s.pairingCode
  return view
}

const maskPhone = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}…${p.slice(-3)}` : p)
