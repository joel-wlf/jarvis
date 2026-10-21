// HTTP assembly: MCP endpoint, OAuth authorization server, app API and the internal admin API.
import express, { type NextFunction, type Request, type Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getOAuthProtectedResourceMetadataUrl, mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { buildServer } from './tools.js'
import { safeEqual } from './app/crypto.js'
import { bearerOf, apiErrorHandler, sendError } from './app/http.js'
import { clientIp, FailLimiter } from './app/limiter.js'
import { PgOAuthProvider, SCOPES } from './app/oauth.js'
import { authRoutes, internalRoutes, requireAppAuth } from './app/auth-routes.js'
import { appRoutes } from './app/routes.js'

export interface AppOptions {
  /** public URL of this server (Cloudflare tunnel), e.g. https://jarvis.example.com */
  publicUrl: URL
  /** legacy static token (MCP_TOKEN), accepted on /mcp and /t/<token>/mcp when legacy is on */
  mcpToken?: string
  legacyToken: boolean
  /** shared secret for the internal admin API */
  adminSecret?: string
  /** rate limits of the SDK's OAuth endpoints (false in tests) */
  oauthRateLimit?: boolean
}

export interface Apps {
  /** public app: everything the tunnel may reach */
  app: express.Express
  /** internal app for the admin service (separate port, not published) */
  internal: express.Express
  provider: PgOAuthProvider
  limiters: { mcp: FailLimiter; token: FailLimiter; login: FailLimiter }
}

export function createApps(o: AppOptions): Apps {
  const publicUrl = new URL(o.publicUrl.origin)
  const mcpUrl = new URL('/mcp', publicUrl)
  const limiters = { mcp: new FailLimiter('MCP token'), token: new FailLimiter('app token'), login: new FailLimiter('login') }
  const provider = new PgOAuthProvider(publicUrl, limiters.login)
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(mcpUrl)

  const app = express()
  app.disable('x-powered-by')
  // The tunnel is the only proxy in front of the server; trust it for req.ip and the original protocol
  app.set('trust proxy', 'loopback, uniquelocal')
  app.get('/healthz', (_req, res) => void res.send('ok'))

  // --- OAuth: discovery, registration, authorize, token, revoke ---
  const rl = o.oauthRateLimit === false ? { rateLimit: false as const } : {}
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: publicUrl,
      resourceServerUrl: mcpUrl,
      resourceName: 'Jarvis',
      scopesSupported: SCOPES,
      authorizationOptions: rl,
      clientRegistrationOptions: { ...rl, clientSecretExpirySeconds: 0 },
      tokenOptions: rl,
      revocationOptions: rl,
    }),
  )
  // Some clients look for the resource metadata at the root as well
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({ resource: mcpUrl.href, authorization_servers: [publicUrl.href], scopes_supported: SCOPES, resource_name: 'Jarvis' })
  })
  app.use(provider.decisionRouter())

  // --- MCP ---
  const bearerAuth = requireBearerAuth({ verifier: provider, resourceMetadataUrl })
  const legacyOk = (c: string | undefined) => o.legacyToken && !!o.mcpToken && safeEqual(c, o.mcpToken)
  async function mcpAuth(req: Request, res: Response, next: NextFunction) {
    const bearer = bearerOf(req)
    const pathToken = req.params.token as string | undefined
    if (legacyOk(bearer) || legacyOk(pathToken)) return next()
    if (bearer && !pathToken) {
      const info = await provider.verifyAccessToken(bearer).catch(() => null)
      if (info) return ((req.auth = info), next())
    }
    // Failed credentials count against the IP; a request without any (discovery probe) does not
    if ((bearer || pathToken) && limiters.mcp.recordFail(clientIp(req)))
      return void res.status(429).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Too many attempts' }, id: null })
    if (pathToken) return void res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
    bearerAuth(req, res, next) // standard 401 with WWW-Authenticate and the resource metadata URL
  }

  async function handleMcp(req: Request, res: Response) {
    // Stateless: a fresh server and transport per request
    const server = await buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close().catch(() => {})
      server.close().catch(() => {})
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (e) {
      console.error(e)
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  }
  const notAllowed = (_req: Request, res: Response) =>
    void res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })

  for (const path of ['/mcp', '/t/:token/mcp']) {
    // authenticate first, then parse the body
    app.post(path, mcpAuth, express.json({ limit: '1mb' }), handleMcp)
    app.get(path, mcpAuth, notAllowed)
    app.delete(path, mcpAuth, notAllowed)
  }

  // --- app API ---
  const deps = { publicUrl, provider, tokenLimiter: limiters.token, loginLimiter: limiters.login }
  const api = express.Router()
  api.use(express.json({ limit: '256kb' }))
  api.use(authRoutes(deps))
  api.use(requireAppAuth(deps), appRoutes())
  api.use((_req: Request, res: Response) => sendError(res, 'not_found', 'Unknown endpoint'))
  api.use(apiErrorHandler)
  app.use('/api/v1', api)

  const internal = express()
  internal.disable('x-powered-by')
  internal.get('/healthz', (_req, res) => void res.send('ok'))
  internal.use(internalRoutes({ secret: o.adminSecret, publicUrl }))
  internal.use(apiErrorHandler)

  return { app, internal, provider, limiters }
}
