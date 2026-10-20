// App authentication: server info, QR pairing, password login, device list and revoke,
// plus the internal endpoints for the admin service (pairing codes, owner password).
import { readFileSync } from 'node:fs'
import express, { type NextFunction, type Request, type Response } from 'express'
import { API_VERSION, type AuthResponse, type DevicesResponse, type PairingPayload, type ServerInfo } from '@jarvis/contract'
import { bearerOf, fail, platform, sendError, str } from './http.js'
import { clientIp, FailLimiter } from './limiter.js'
import { safeEqual } from './crypto.js'
import type { PgOAuthProvider } from './oauth.js'
import {
  checkOwnerPassword, createDevice, createPairingCode, deviceByToken, hasOwnerPassword, listDevices, redeemPairingCode, revokeDevice, setOwnerPassword,
} from './store.js'

const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string
  } catch {
    return '0.0.0'
  }
})()

/** Owner's name as set (no fallback to "dich"), for the app's greeting. */
export const OWNER_NAME = (process.env.OWNER_NAME ?? '').replace(/[^\p{L}\p{N} .-]/gu, '').trim() || undefined

export type Principal = { kind: 'device'; id: string } | { kind: 'oauth'; id: string; scopes: string[] }

declare module 'express-serve-static-core' {
  interface Request {
    principal?: Principal
  }
}

export interface AuthDeps {
  publicUrl: URL
  provider: PgOAuthProvider
  /** failed bearer tokens on /api/v1 */
  tokenLimiter: FailLimiter
  /** failed passwords and pairing codes */
  loginLimiter: FailLimiter
}

/** Bearer auth for /api/v1: a device token ("jd_...") or an OAuth access token. */
export function requireAppAuth(deps: AuthDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerOf(req)
    if (token) {
      if (token.startsWith('jd_')) {
        const d = await deviceByToken(token)
        if (d) return ((req.principal = { kind: 'device', id: d.id }), next())
      } else {
        const info = await deps.provider.verifyAccessToken(token).catch(() => null)
        if (info) return ((req.principal = { kind: 'oauth', id: info.clientId, scopes: info.scopes }), next())
      }
      const ip = clientIp(req)
      if (deps.tokenLimiter.recordFail(ip)) return sendError(res, 'rate_limited', 'Too many attempts')
    }
    res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource', deps.publicUrl).href}"`)
    sendError(res, 'unauthorized', token ? 'Invalid or revoked token' : 'Missing bearer token')
  }
}

/** Public part: /info, /pair, /login (no auth), /devices (auth). Mounted at /api/v1. */
export function authRoutes(deps: AuthDeps) {
  const r = express.Router()
  const auth = requireAppAuth(deps)

  r.get('/info', async (_req, res) => {
    const info: ServerInfo = {
      name: 'jarvis',
      apiVersion: API_VERSION,
      version: VERSION,
      ...(OWNER_NAME ? { ownerName: OWNER_NAME } : {}),
      passwordLogin: await hasOwnerPassword(),
      oauthMetadata: new URL('/.well-known/oauth-authorization-server', deps.publicUrl).href,
    }
    res.json(info)
  })

  const guard = (req: Request) => {
    if (deps.loginLimiter.isBlocked(clientIp(req))) throw fail('rate_limited', 'Too many failed attempts, try again later')
  }
  const failed = (req: Request, message: string) => {
    deps.loginLimiter.recordFail(clientIp(req))
    return deps.loginLimiter.isBlocked(clientIp(req)) ? fail('rate_limited', 'Too many failed attempts, try again later') : fail('unauthorized', message)
  }

  r.post('/pair', async (req, res) => {
    guard(req)
    const code = str(req.body?.code, 'code', { max: 20 })
    const deviceName = str(req.body?.deviceName, 'deviceName', { max: 80 })
    const plat = platform(req.body?.platform)
    const dev = await redeemPairingCode(code, deviceName, plat)
    if (!dev) throw failed(req, 'Pairing code is invalid, used or expired')
    deps.loginLimiter.reset(clientIp(req))
    const out: AuthResponse = { token: dev.token, deviceId: dev.id, ...(OWNER_NAME ? { ownerName: OWNER_NAME } : {}) }
    res.status(201).json(out)
  })

  r.post('/login', async (req, res) => {
    guard(req)
    const password = str(req.body?.password, 'password', { max: 200 })
    const deviceName = str(req.body?.deviceName, 'deviceName', { max: 80 })
    const plat = platform(req.body?.platform)
    if (!(await checkOwnerPassword(password))) throw failed(req, 'Wrong password')
    deps.loginLimiter.reset(clientIp(req))
    const dev = await createDevice(deviceName, plat)
    const out: AuthResponse = { token: dev.token, deviceId: dev.id, ...(OWNER_NAME ? { ownerName: OWNER_NAME } : {}) }
    res.status(201).json(out)
  })

  r.get('/devices', auth, async (req, res) => {
    const out: DevicesResponse = { devices: await listDevices(req.principal) }
    res.json(out)
  })

  r.delete('/devices/:id', auth, async (req, res) => {
    if (!(await revokeDevice(String(req.params.id)))) throw fail('not_found', 'No such device')
    res.status(204).end()
  })

  return r
}

/**
 * Internal endpoints for the admin service. Served on a separate port that is not published to the host
 * (the tunnel only reaches :3000), and additionally guarded by ADMIN_INTERNAL_SECRET and refused for tunnel traffic.
 */
export function internalRoutes(opts: { secret?: string; publicUrl: URL }) {
  const r = express.Router()
  r.use((req, res, next) => {
    if (!opts.secret) return sendError(res, 'not_found', 'Internal API disabled (ADMIN_INTERNAL_SECRET not set)')
    if (req.headers['cf-connecting-ip'] || req.headers['cf-ray']) return sendError(res, 'forbidden', 'Not available through the tunnel')
    if (!safeEqual(String(req.headers['x-jarvis-internal-secret'] ?? ''), opts.secret)) return sendError(res, 'unauthorized', 'Bad internal secret')
    next()
  })
  r.use(express.json({ limit: '16kb' }))

  /** -> { code, expiresAt, payload: PairingPayload }; the admin renders "jarvis:" + JSON(payload) as QR. */
  r.post('/internal/pairing-codes', async (req, res) => {
    const homeUrl = typeof req.body?.homeUrl === 'string' && /^https?:\/\//.test(req.body.homeUrl) ? req.body.homeUrl : undefined
    const { code, expiresAt } = await createPairingCode()
    const payload: PairingPayload = { v: 1, url: opts.publicUrl.origin, ...(homeUrl ? { homeUrl } : {}), code }
    res.status(201).json({ code, expiresAt: expiresAt.toISOString(), payload, qr: `jarvis:${JSON.stringify(payload)}` })
  })

  r.put('/internal/owner-password', async (req, res) => {
    const pw = typeof req.body?.password === 'string' ? req.body.password : ''
    if (pw.length < 10 || pw.length > 200) return sendError(res, 'invalid', 'Password must have 10 to 200 characters', { password: '10-200 characters' })
    await setOwnerPassword(pw)
    res.status(204).end()
  })
  return r
}
