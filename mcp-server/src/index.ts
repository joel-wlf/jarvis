import { createHash, timingSafeEqual } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildServer } from './tools.js'

const TOKEN = process.env.MCP_TOKEN
if (!TOKEN || TOKEN.length < 32) {
  console.error('MCP_TOKEN fehlt oder ist zu kurz (mind. 32 Zeichen, z.B. openssl rand -hex 24).')
  process.exit(1)
}

const digest = (s: string) => createHash('sha256').update(s).digest()
const tokenOk = (candidate: string | undefined) =>
  !!candidate && timingSafeEqual(digest(candidate), digest(TOKEN))

// Fehlversuche pro Client-IP (Cloudflare setzt cf-connecting-ip; der Server ist nur über den Tunnel erreichbar).
// Wer zu oft einen falschen Token schickt, bekommt eine Weile nur noch 429. Gültige Tokens werden nie ausgesperrt,
// damit niemand mit gleicher IP (z.B. geteilte Anbieter-Adressen) den echten Zugriff blockieren kann.
const WINDOW_MS = 15 * 60_000
const MAX_FAILS = 10
const fails = new Map<string, { n: number; first: number }>()
setInterval(() => {
  const now = Date.now()
  for (const [ip, f] of fails) if (now - f.first > WINDOW_MS) fails.delete(ip)
}, 60_000).unref()

const clientIp = (req: Request) => String(req.headers['cf-connecting-ip'] ?? req.ip ?? 'unknown')

/**
 * Zwei Wege zur Authentifizierung:
 *  - Header "Authorization: Bearer <token>" (für Clients mit Header-Support)
 *  - Token im Pfad /t/<token>/mcp (für Connector-UIs, die nur eine URL erlauben)
 */
function auth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (tokenOk(bearer) || tokenOk(req.params.token)) return next()

  const ip = clientIp(req)
  const now = Date.now()
  let f = fails.get(ip)
  if (!f || now - f.first > WINDOW_MS) f = { n: 0, first: now }
  f.n++
  fails.set(ip, f)
  if (f.n === MAX_FAILS) console.warn(`Zu viele ungültige Token-Versuche von ${ip}`)
  if (f.n > MAX_FAILS) return void res.status(429).json({ jsonrpc: '2.0', error: { code: -32002, message: 'Too many attempts' }, id: null })
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
}

async function handle(req: Request, res: Response) {
  // Stateless: pro Request ein frischer Server + Transport
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
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null })
    }
  }
}

const notAllowed = (_req: Request, res: Response) =>
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })

const app = express()
app.disable('x-powered-by')
app.get('/healthz', (_req, res) => void res.send('ok'))

for (const path of ['/mcp', '/t/:token/mcp']) {
  // erst authentifizieren, dann den Body parsen
  app.post(path, auth, express.json({ limit: '1mb' }), handle)
  app.get(path, auth, notAllowed)
  app.delete(path, auth, notAllowed)
}

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => console.log(`MCP-Server läuft auf :${port}`))
