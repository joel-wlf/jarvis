// OAuth 2.1 authorization server for MCP clients (Claude connectors) and the app, backed by Postgres.
// The MCP SDK (mcpAuthRouter) handles discovery, registration, PKCE checks and request validation;
// this provider stores clients, codes and tokens (hashed) and renders the owner's consent page.
import { randomUUID } from 'node:crypto'
import express, { type Response } from 'express'
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js'
import { InvalidGrantError, InvalidTargetError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { memDb } from '../db.js'
import { randomToken, sha256 } from './crypto.js'
import { clientIp, FailLimiter } from './limiter.js'
import { lang } from './http.js'
import { checkOwnerPassword, hasOwnerPassword } from './store.js'
import { renderAuthorizePage } from './authorize-page.js'

export const ACCESS_TTL_S = 3600
export const REFRESH_TTL_S = 30 * 24 * 3600
const CODE_TTL_MS = 5 * 60_000
const PENDING_TTL_MS = 10 * 60_000
export const SCOPES = ['jarvis']

interface Pending {
  clientId: string
  clientName: string
  params: AuthorizationParams
  expires: number
}

interface TokenRow {
  id: string
  client_id: string
  scopes: string[]
  resource: string | null
  access_expires_at: Date
  refresh_expires_at: Date | null
}

export class PgOAuthProvider implements OAuthServerProvider {
  /** Authorization requests waiting for the owner's decision. In memory: a restart only means "log in again". */
  private pending = new Map<string, Pending>()
  readonly limiter: FailLimiter

  constructor(
    readonly publicUrl: URL,
    limiter?: FailLimiter,
  ) {
    this.limiter = limiter ?? new FailLimiter('authorize password')
    setInterval(() => {
      const now = Date.now()
      for (const [id, p] of this.pending) if (p.expires < now) this.pending.delete(id)
    }, 60_000).unref()
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId) => {
        const r = await memDb.query<{ metadata: OAuthClientInformationFull }>(
          `SELECT metadata FROM oauth_clients WHERE client_id = $1 AND revoked_at IS NULL`,
          [clientId],
        )
        return r.rows[0]?.metadata
      },
      registerClient: async (client) => {
        const full = { ...client, client_id: (client as OAuthClientInformationFull).client_id ?? randomUUID() } as OAuthClientInformationFull
        await memDb.query(`INSERT INTO oauth_clients (client_id, metadata) VALUES ($1, $2)`, [full.client_id, JSON.stringify(full)])
        return full
      },
    }
  }

  /** Tokens are only for this server: a requested resource must be on the public URL's origin. */
  private checkResource(resource?: URL) {
    if (resource && resource.origin !== this.publicUrl.origin) throw new InvalidTargetError(`Unknown resource ${resource.href}`)
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    this.checkResource(params.resource)
    const id = randomToken('', 18)
    this.pending.set(id, { clientId: client.client_id, clientName: client.client_name || client.client_uri || 'MCP client', params, expires: Date.now() + PENDING_TTL_MS })
    const req = res.req
    res.setHeader('Cache-Control', 'no-store')
    // No form-action: browsers apply it to the redirect after the POST, which goes to the client's own URI
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    res.type('html').send(renderAuthorizePage({ lang: lang(req), requestId: id, clientName: this.pending.get(id)!.clientName, hasPassword: await hasOwnerPassword() }))
  }

  /** POST /oauth/decision: the owner's answer from the consent page. */
  decisionRouter() {
    const router = express.Router()
    router.post('/oauth/decision', express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
      const p = this.pending.get(String(req.body?.request_id ?? ''))
      const l = lang(req)
      res.setHeader('Cache-Control', 'no-store')
      if (!p || p.expires < Date.now()) {
        return void res.status(400).type('html').send(renderAuthorizePage({ lang: l, expired: true }))
      }
      const back = new URL(p.params.redirectUri)
      if (p.params.state) back.searchParams.set('state', p.params.state)
      if (req.body?.decision !== 'allow') {
        this.pending.delete(String(req.body.request_id))
        back.searchParams.set('error', 'access_denied')
        return void res.redirect(302, back.href)
      }
      const ip = clientIp(req)
      const page = (error: 'password' | 'blocked') =>
        res.status(error === 'blocked' ? 429 : 401).type('html').send(renderAuthorizePage({ lang: l, requestId: String(req.body.request_id), clientName: p.clientName, hasPassword: true, error }))
      if (this.limiter.isBlocked(ip)) return void page('blocked')
      if (!(await checkOwnerPassword(String(req.body?.password ?? '')))) {
        this.limiter.recordFail(ip)
        return void page(this.limiter.isBlocked(ip) ? 'blocked' : 'password')
      }
      this.limiter.reset(ip)
      this.pending.delete(String(req.body.request_id))
      const code = randomToken('jac_')
      await memDb.query(
        `INSERT INTO oauth_codes (code_hash, client_id, redirect_uri, code_challenge, scopes, resource, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [sha256(code), p.clientId, p.params.redirectUri, p.params.codeChallenge, p.params.scopes?.length ? p.params.scopes : SCOPES, p.params.resource?.href ?? null, new Date(Date.now() + CODE_TTL_MS)],
      )
      back.searchParams.set('code', code)
      res.redirect(302, back.href)
    })
    return router
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    const r = await memDb.query<{ code_challenge: string }>(
      `SELECT code_challenge FROM oauth_codes WHERE code_hash = $1 AND client_id = $2 AND used_at IS NULL AND expires_at > now()`,
      [sha256(code), client.client_id],
    )
    if (!r.rows[0]) throw new InvalidGrantError('Invalid or expired authorization code')
    return r.rows[0].code_challenge
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, _verifier?: string, redirectUri?: string, resource?: URL): Promise<OAuthTokens> {
    this.checkResource(resource)
    const r = await memDb.query<{ redirect_uri: string; scopes: string[]; resource: string | null }>(
      `UPDATE oauth_codes SET used_at = now() WHERE code_hash = $1 AND client_id = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING redirect_uri, scopes, resource`,
      [sha256(code), client.client_id],
    )
    const row = r.rows[0]
    if (!row) throw new InvalidGrantError('Invalid or expired authorization code')
    if (redirectUri && redirectUri !== row.redirect_uri) throw new InvalidGrantError('redirect_uri does not match')
    return this.issue(client.client_id, row.scopes, resource?.href ?? row.resource)
  }

  private async issue(clientId: string, scopes: string[], resource: string | null, rotateId?: string): Promise<OAuthTokens> {
    const access = randomToken('jat_')
    const refresh = randomToken('jrt_')
    const accessExp = new Date(Date.now() + ACCESS_TTL_S * 1000)
    const refreshExp = new Date(Date.now() + REFRESH_TTL_S * 1000)
    if (rotateId) {
      await memDb.query(
        `UPDATE oauth_tokens SET access_hash = $2, refresh_hash = $3, access_expires_at = $4, refresh_expires_at = $5, scopes = $6 WHERE id = $1`,
        [rotateId, sha256(access), sha256(refresh), accessExp, refreshExp, scopes],
      )
    } else {
      await memDb.query(
        `INSERT INTO oauth_tokens (client_id, access_hash, refresh_hash, scopes, resource, access_expires_at, refresh_expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [clientId, sha256(access), sha256(refresh), scopes, resource, accessExp, refreshExp],
      )
    }
    return { access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes.join(' ') }
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[], resource?: URL): Promise<OAuthTokens> {
    this.checkResource(resource)
    const r = await memDb.query<TokenRow>(
      `SELECT t.id, t.client_id, t.scopes, t.resource, t.access_expires_at, t.refresh_expires_at FROM oauth_tokens t
       JOIN oauth_clients c ON c.client_id = t.client_id AND c.revoked_at IS NULL
       WHERE t.refresh_hash = $1 AND t.client_id = $2 AND t.revoked_at IS NULL AND t.refresh_expires_at > now()`,
      [sha256(refreshToken), client.client_id],
    )
    const row = r.rows[0]
    if (!row) throw new InvalidGrantError('Invalid or expired refresh token')
    const granted = scopes?.length ? scopes : row.scopes
    if (granted.some((s) => !row.scopes.includes(s))) throw new InvalidGrantError('Requested scope exceeds the original grant')
    // Rotation: the old refresh token stops working with this exchange
    return this.issue(row.client_id, granted, row.resource, row.id)
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const r = await memDb.query<TokenRow>(
      `SELECT t.id, t.client_id, t.scopes, t.resource, t.access_expires_at FROM oauth_tokens t
       JOIN oauth_clients c ON c.client_id = t.client_id AND c.revoked_at IS NULL
       WHERE t.access_hash = $1 AND t.revoked_at IS NULL AND t.access_expires_at > now()`,
      [sha256(token)],
    )
    const row = r.rows[0]
    if (!row) throw new InvalidTokenError('Invalid or expired access token')
    memDb
      .query(`UPDATE oauth_tokens SET last_used_at = now() WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')`, [row.id])
      .catch(() => {})
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes,
      expiresAt: Math.floor(new Date(row.access_expires_at).getTime() / 1000),
      ...(row.resource ? { resource: new URL(row.resource) } : {}),
    }
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const h = sha256(request.token)
    await memDb.query(
      `UPDATE oauth_tokens SET revoked_at = now() WHERE client_id = $2 AND revoked_at IS NULL AND (access_hash = $1 OR refresh_hash = $1)`,
      [h, client.client_id],
    )
  }
}
