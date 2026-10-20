import type { Request } from 'express'

// Failed attempts per client IP (Cloudflare sets cf-connecting-ip; the server is only reachable through the tunnel).
// Same pattern as the original MCP token check: whoever sends too many wrong credentials only gets 429 for a while.
// High-entropy tokens are checked before the block, so a valid token is never locked out. Low-entropy secrets
// (password, pairing code) are refused while blocked, otherwise the block would not slow down guessing.
export class FailLimiter {
  private fails = new Map<string, { n: number; first: number }>()

  constructor(
    readonly label: string,
    readonly max = 10,
    readonly windowMs = 15 * 60_000,
  ) {
    setInterval(() => {
      const now = Date.now()
      for (const [ip, f] of this.fails) if (now - f.first > this.windowMs) this.fails.delete(ip)
    }, 60_000).unref()
  }

  isBlocked(ip: string): boolean {
    const f = this.fails.get(ip)
    return !!f && Date.now() - f.first <= this.windowMs && f.n >= this.max
  }

  /** Count a failure; returns true when the IP is now over the limit. */
  recordFail(ip: string): boolean {
    const now = Date.now()
    let f = this.fails.get(ip)
    if (!f || now - f.first > this.windowMs) f = { n: 0, first: now }
    f.n++
    this.fails.set(ip, f)
    if (f.n === this.max) console.warn(`Too many failed ${this.label} attempts from ${ip}`)
    return f.n > this.max
  }

  reset(ip: string) {
    this.fails.delete(ip)
  }
}

export const clientIp = (req: Request) => String(req.headers['cf-connecting-ip'] ?? req.ip ?? 'unknown')
