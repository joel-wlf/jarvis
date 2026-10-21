// Bridge between the admin interface and the app API in mcp-server:
// - a streaming reverse proxy, so the web app served here talks to /api/v1 and OAuth on the same origin
// - typed calls to mcp-server's internal admin API (pairing codes, owner password)
import http from 'node:http'
import type { NextFunction, Request, Response } from 'express'
import QRCode from 'qrcode'

/** Paths answered by mcp-server. Everything else stays with the admin service. */
const PROXIED = [/^\/api\/v1(\/|$)/, /^\/\.well-known\/oauth-/, /^\/(authorize|token|register|revoke)(\/|$|\?)/, /^\/oauth\//]

export const isProxied = (url: string) => PROXIED.some((re) => re.test(url))

/** Express middleware: pipes matching requests to mcp-server, including SSE streams. */
export function appProxy(target: string) {
  const base = new URL(target)
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isProxied(req.originalUrl)) return next()
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: base.host, 'x-forwarded-host': req.headers.host ?? '', 'x-forwarded-proto': req.secure ? 'https' : 'http' }
    // The internal secret header must never be forwarded from outside
    delete headers['x-jarvis-internal-secret']
    const up = http.request({ protocol: base.protocol, hostname: base.hostname, port: base.port, method: req.method, path: req.originalUrl, headers }, (r) => {
      res.status(r.statusCode ?? 502)
      for (const [k, v] of Object.entries(r.headers)) if (v !== undefined && k !== 'content-security-policy') res.setHeader(k, v)
      // SSE: let events through immediately
      if (String(r.headers['content-type'] ?? '').startsWith('text/event-stream')) res.flushHeaders()
      r.pipe(res)
    })
    up.on('error', () => {
      if (!res.headersSent) res.status(502).json({ error: { code: 'unavailable', message: 'App API not reachable (is mcp-server running?)' } })
      else res.end()
    })
    req.on('aborted', () => up.destroy())
    req.pipe(up)
  }
}

export interface PairingResult {
  code: string
  expiresAt: string
  /** "jarvis:{...}" string encoded in the QR code */
  qr: string
  /** the same, rendered as SVG for the browser */
  qrSvg: string
  payload: { v: 1; url: string; homeUrl?: string; code: string }
}

export class InternalApi {
  constructor(private base: string, private secret: () => string | undefined) {}

  private async call(method: string, path: string, body?: unknown) {
    const secret = this.secret()
    if (!secret) throw new Error('ADMIN_INTERNAL_SECRET is not set. Apply the settings once so it gets generated.')
    let res: globalThis.Response
    try {
      res = await fetch(new URL(path, this.base), {
        method,
        headers: { 'content-type': 'application/json', 'x-jarvis-internal-secret': secret },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      })
    } catch {
      throw new Error('The app API (mcp-server) is not reachable.')
    }
    if (res.status === 204) return null
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    if (!res.ok) throw new Error(data?.error?.message ?? `App API error ${res.status}`)
    return data
  }

  async createPairing(homeUrl: string): Promise<PairingResult> {
    const r = (await this.call('POST', '/internal/pairing-codes', { homeUrl })) as Omit<PairingResult, 'qrSvg'>
    return { ...r, qrSvg: await QRCode.toString(r.qr, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) }
  }

  async setOwnerPassword(password: string) {
    await this.call('PUT', '/internal/owner-password', { password })
  }
}

/** Development without docker: a pairing payload that points at the local server. */
export async function fakePairing(homeUrl: string): Promise<PairingResult> {
  const code = 'DEMO-1234'
  const payload = { v: 1 as const, url: homeUrl, homeUrl, code }
  const qr = `jarvis:${JSON.stringify(payload)}`
  return { code, expiresAt: new Date(Date.now() + 600_000).toISOString(), qr, payload, qrSvg: await QRCode.toString(qr, { type: 'svg', margin: 1 }) }
}
