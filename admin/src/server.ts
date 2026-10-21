import fs from 'node:fs'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import { connectionAddress } from './connection.js'
import { SetupStore } from './setup.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import { ApplyError, prepare } from './apply.js'
import { Auth, clearCookie, COOKIE, csrfGuard, readCookie, sessionCookie } from './auth.js'
import { crossChecks, transcribeMode } from './checks.js'
import { backupDir, makeRedactor, readCurrent, secretValues, type Ctx } from './context.js'
import { composePs } from './docker.js'
import { EnvLinkError, listBackups, parseEnv, readBackup } from './envfile.js'
import { BusyError, type Job } from './jobs.js'
import {
  RELINK_WORD, ROTATABLE, SERVICES, startApply, startEstimate, startRebuild, startRelink, startRestart, startRestore, startRotate, type Rotatable,
} from './ops.js'
import { FIELDS, GROUPS } from './schema.js'
import { linkView } from './wa.js'
import { appProxy, fakePairing, InternalApi } from './appbridge.js'

// The Expo web build (app/, exported in the Docker image). ADMIN_WEB_DIR overrides it for development.
const WEB = process.env.ADMIN_WEB_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web')
const APP_API_URL = process.env.APP_API_URL ?? 'http://mcp-server:3000'
const APP_INTERNAL_URL = process.env.APP_INTERNAL_URL ?? 'http://mcp-server:3001'
const NO_WEB = '<!doctype html><meta charset="utf-8"><title>Jarvis</title><p style="font-family:system-ui;padding:2rem">The web app is not built. Run <code>npm run export:web</code> in <code>app/</code> and set <code>ADMIN_WEB_DIR</code>, or use the Docker image.</p>'
const SECRET_KEYS = new Set(FIELDS.filter((f) => f.type === 'secret').map((f) => f.key))

const hint = (v: string) => (v.length > 12 ? `…${v.slice(-4)}` : '••••')

/** Einstellungen für den Browser: Geheimnisse nie im Klartext. */
function publicValues(env: Record<string, string>) {
  const values: Record<string, string> = {}
  const secrets: Record<string, { set: boolean; hint?: string }> = {}
  for (const f of FIELDS) {
    const v = env[f.key] ?? ''
    if (SECRET_KEYS.has(f.key)) secrets[f.key] = v ? { set: true, hint: hint(v) } : { set: false }
    else values[f.key] = v
  }
  const known = new Set(FIELDS.map((f) => f.key))
  const unknown = Object.keys(env).filter((k) => !known.has(k)).sort()
  return { values, secrets, unknown }
}

function jobView(j: Job | undefined | null) {
  return j ? { id: j.id, kind: j.kind, title: j.title, status: j.status, startedAt: j.startedAt, endedAt: j.endedAt, lines: j.lines, result: j.result } : null
}

export function createApp(ctx: Ctx, auth: Auth) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback, uniquelocal')
  const setup = new SetupStore(ctx.dataDir)
  const redact = makeRedactor(() => secretValues(ctx))

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.get('/healthz', (_req, res) => void res.send('ok'))
  // App API and OAuth live in mcp-server; the web app reaches them on this origin
  app.use(appProxy(APP_API_URL))
  app.use(express.static(WEB, { index: 'index.html', maxAge: 0 }))
  app.use('/api', express.json({ limit: '256kb' }), csrfGuard)

  const ip = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown'
  const secure = (req: Request) => {
    if (req.secure) return true
    const publicUrl = readCurrent(ctx).env.APP_PUBLIC_URL
    if (!publicUrl) return false
    try { const u = new URL(publicUrl); return u.protocol === 'https:' && u.host === req.get('host') }
    catch { return false }
  }
  const session = (req: Request) => readCookie(req, COOKIE)
  // Only app device tokens may authorize administration. OAuth and static MCP tokens never do.
  const loggedIn = async (req: Request) => {
    if (auth.check(session(req))) return true
    const token = /^Bearer (jd_[A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? '')?.[1]
    if (!token || !auth.isConfigured()) return false
    const secret = readCurrent(ctx).env.ADMIN_INTERNAL_SECRET
    if (!secret) return false
    try {
      const r = await fetch(`${process.env.MCP_INTERNAL_URL ?? 'http://mcp-server:3001'}/internal/device-auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jarvis-Internal-Secret': secret },
        body: JSON.stringify({ token }), signal: AbortSignal.timeout(5000),
      })
      return r.ok && (await r.json() as { valid: boolean }).valid === true
    } catch { return false }
  }
  const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (await loggedIn(req)) return next()
      res.status(401).json({ error: 'Bitte anmelden.' })
    } catch (e) { next(e) }
  }
  /** Für heikle Aktionen: Passwort erneut eingeben. */
  const confirmPassword = (req: Request, res: Response) => {
    if (auth.verifyPassword(ip(req), String(req.body?.password ?? ''))) return true
    res.status(403).json({ error: auth.locked(ip(req)) ? 'Zu viele Fehlversuche. Bitte 15 Minuten warten.' : 'Passwort falsch.' })
    return false
  }
  const fail = (res: Response, e: unknown) => {
    if (e instanceof BusyError) return void res.status(409).json({ error: e.message, job: jobView(e.job) })
    if (e instanceof ApplyError || e instanceof EnvLinkError) return void res.status(400).json({ error: e.message })
    console.error(e)
    res.status(500).json({ error: redact((e as Error).message ?? 'Interner Fehler') })
  }
  const wrap = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
    try {
      await fn(req, res)
    } catch (e) {
      fail(res, e)
    }
  }

  // --- Zustand und Anmeldung -------------------------------------------------------------------
  app.get('/api/state', wrap(async (req, res) => {
    let envExists = false
    let envProblem: string | null = null
    let initialized = false
    let assistantName = 'Jarvis'
    try {
      const cur = readCurrent(ctx)
      assistantName = cur.env.ASSISTANT_NAME || 'Jarvis'
      envExists = cur.exists
      initialized = !!(cur.env.POSTGRES_PASSWORD && cur.env.MCP_RO_PASSWORD && cur.env.MCP_TOKEN)
    } catch (e) {
      envProblem = (e as Error).message
    }
    const authenticated = await loggedIn(req)
    const pendingJobId = authenticated ? setup.read(initialized).draft.pendingJobId : undefined
    res.json({
      configured: auth.isConfigured(),
      loggedIn: authenticated,
      assistantName,
      setupComplete: auth.isConfigured() && setup.read(initialized).complete,
      envExists,
      initialized,
      envProblem,
      fake: ctx.fake,
      job: jobView(ctx.jobs.current() ?? (pendingJobId ? ctx.jobs.get(pendingJobId) ?? null : null)),
    })
  }))

  app.post('/api/auth/setup', wrap((req, res) => {
    const r = auth.setup(ip(req), String(req.body?.code ?? ''), String(req.body?.password ?? ''))
    if (r.error) return void res.status(400).json({ error: r.error })
    res.setHeader('Set-Cookie', sessionCookie(r.session!, secure(req)))
    res.json({ ok: true })
  }))

  app.post('/api/auth/login', wrap((req, res) => {
    const r = auth.login(ip(req), String(req.body?.password ?? ''))
    if (r.error) return void res.status(auth.locked(ip(req)) ? 429 : 401).json({ error: r.error })
    res.setHeader('Set-Cookie', sessionCookie(r.session!, secure(req)))
    res.json({ ok: true })
  }))

  app.post('/api/auth/logout', (req, res) => {
    auth.logout(session(req))
    res.setHeader('Set-Cookie', clearCookie())
    res.json({ ok: true })
  })

  app.post('/api/auth/password', requireAuth, wrap((req, res) => {
    const err = auth.changePassword(ip(req), String(req.body?.old ?? ''), String(req.body?.new ?? ''))
    if (err) return void res.status(400).json({ error: err })
    const r = auth.login(ip(req), String(req.body?.new))
    res.setHeader('Set-Cookie', sessionCookie(r.session!, secure(req)))
    res.json({ ok: true })
  }))

  /** Für den Assistenten: gibt es schon eine Datenbank oder WhatsApp-Sitzung (z.B. nach verlorener .env)? */
  app.get('/api/setup/info', requireAuth, wrap(async (_req, res) => {
    const exists = async (v: string) => (await ctx.docker.docker(['volume', 'inspect', v], { timeoutMs: 15_000 })).code === 0
    const [pgdata, waAuth] = await Promise.all([exists('jarvis_pgdata'), exists('jarvis_wa-auth')])
    res.json({ pgdataExists: pgdata, waAuthExists: waAuth })
  }))

  app.get('/api/setup/progress', requireAuth, wrap((_req, res) => {
    const env = readCurrent(ctx).env
    res.json(setup.read(!!env.POSTGRES_PASSWORD))
  }))
  app.post('/api/setup/progress', requireAuth, wrap(async (req, res) => {
    if (ctx.jobs.current()) throw new BusyError(ctx.jobs.current()!)
    const env = readCurrent(ctx).env
    if (req.body?.complete) {
      const services = await composePs(ctx.docker)
      const required = ['postgres', 'mcp-server', 'embedder']
      if (required.some((name) => !services.some((s) => s.service === name && s.state === 'running' && (!s.health || s.health === 'healthy'))))
        throw new ApplyError('Die Basisdienste sind noch nicht bereit. Bitte zuerst die Einrichtung der Dienste wiederholen.')
    }
    const saved = setup.save(req.body, !!env.POSTGRES_PASSWORD)
    if (!saved) return void res.status(409).json({ error: 'Die Einrichtung wurde in einem anderen Fenster geändert. Bitte neu laden.' })
    res.json(saved)
  }))
  app.get('/api/setup/connection', requireAuth, wrap(async (req, res) => {
    const { url, localOnly } = await connectionAddress(ctx, `${req.protocol}://${req.get('host')}`)
    res.json({ url, localOnly, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 2 }) })
  }))
  app.post('/api/setup/check-remote', requireAuth, wrap(async (req, res) => {
    const env = readCurrent(ctx).env
    const base = env.APP_PUBLIC_URL
    if (!base || !base.startsWith('https://')) throw new ApplyError('Bitte zuerst eine öffentliche HTTPS-Adresse speichern.')
    // The health probe must reach this installation, not another Jarvis server.
    const challenge = randomBytes(32).toString('hex')
    const expected = createHmac('sha256', env.ADMIN_INTERNAL_SECRET).update(challenge).digest('hex')
    const r = await fetch(new URL('/api/setup/identity', base), { headers: { 'X-Jarvis-Probe': challenge }, redirect: 'error', signal: AbortSignal.timeout(10000) })
    const data = r.ok ? await r.json() as { identity?: string } : null
    if (!data?.identity || !constantEqual(data.identity, expected)) throw new ApplyError('Unter dieser Adresse ist dieser Jarvis-Server noch nicht erreichbar. Tunnel und Ziel prüfen.')
    res.json({ ok: true })
  }))
  app.get('/api/setup/identity', (req, res) => {
    const probe = String(req.headers['x-jarvis-probe'] ?? '')
    const secret = readCurrent(ctx).env.ADMIN_INTERNAL_SECRET
    if (!secret || !auth.isConfigured() || !/^[a-f0-9]{64}$/.test(probe)) return void res.sendStatus(404)
    res.json({ identity: createHmac('sha256', secret).update(probe).digest('hex') })
  })

  // --- Einstellungen ---------------------------------------------------------------------------
  app.get('/api/settings', requireAuth, wrap((_req, res) => {
    const cur = readCurrent(ctx)
    res.json({
      groups: GROUPS,
      fields: FIELDS.filter((f) => !f.managed),
      exists: cur.exists,
      ...publicValues(cur.env),
      profiles: cur.env.COMPOSE_PROFILES ?? '',
      transcribeMode: transcribeMode(cur.env),
      checks: cur.exists ? crossChecks(cur.env) : [],
    })
  }))

  /** Vorschau: Fehler, Hinweise, Unterschiede und betroffene Dienste, ohne etwas zu ändern. */
  app.post('/api/settings/preview', requireAuth, wrap((req, res) => {
    const cur = readCurrent(ctx)
    const p = prepare(cur.env, req.body?.changes ?? {}, { initial: !!req.body?.initial })
    const diff = p.changed.map((k) => ({
      key: k,
      from: SECRET_KEYS.has(k) ? (cur.env[k] ? hint(cur.env[k]) : '') : (cur.env[k] ?? ''),
      to: SECRET_KEYS.has(k) ? (p.next[k] ? (cur.env[k] && cur.env[k] !== p.next[k] ? 'neu' : hint(p.next[k])) : '') : (p.next[k] ?? ''),
    }))
    res.json({ errors: p.errors, checks: p.checks, diff, services: p.services, profiles: p.next.COMPOSE_PROFILES ?? '' })
  }))

  app.post('/api/apply', requireAuth, wrap((req, res) => {
    const initial = !!req.body?.initial
    if (initial) {
      const cur = readCurrent(ctx)
      if (cur.exists && cur.env.POSTGRES_PASSWORD) throw new ApplyError('Jarvis ist schon eingerichtet. Änderungen bitte unter Einstellungen.')
    }
    const wizard = setup.read(!!readCurrent(ctx).env.POSTGRES_PASSWORD)
    const r = startApply(ctx, req.body?.changes ?? {}, { initial, verifyAll: !wizard.complete })
    if (!r.job) return void res.status(422).json({ error: 'Bitte die markierten Einstellungen korrigieren.', errors: r.prepared.errors, checks: r.prepared.checks })
    if (!wizard.complete) setup.save({ ...wizard, draft: { ...wizard.draft, pendingJobId: r.job.id } }, !!readCurrent(ctx).env.POSTGRES_PASSWORD)
    res.json({ job: jobView(r.job) })
  }))

  // --- Vorgänge -------------------------------------------------------------------------------
  app.get('/api/jobs', requireAuth, (_req, res) => void res.json({ jobs: ctx.jobs.list().map((j) => ({ ...jobView(j), lines: undefined })) }))
  app.get('/api/jobs/:id', requireAuth, (req, res) => {
    const j = ctx.jobs.get(req.params.id)
    if (!j) return void res.status(404).json({ error: 'Unbekannter Vorgang.' })
    const since = Number(req.query.since ?? 0)
    res.json({ job: { ...jobView(j), lines: j.lines.slice(Number.isFinite(since) ? since : 0) }, total: j.lines.length })
  })

  // --- Status ---------------------------------------------------------------------------------
  let statsCache: { at: number; v: unknown } | null = null
  app.get('/api/status', requireAuth, wrap(async (_req, res) => {
    const cur = readCurrent(ctx)
    const [ps, wa] = await Promise.all([composePs(ctx.docker).catch((e) => ({ error: redact((e as Error).message) })), linkView(ctx.waStatusFile)])
    if (!statsCache || Date.now() - statsCache.at > 30_000) {
      statsCache = { at: Date.now(), v: cur.exists ? await ctx.db.stats(cur.env).catch(() => null) : null }
    }
    let disk: { free: number; total: number } | null = null
    try {
      const s = fs.statfsSync(path.dirname(ctx.envPath))
      disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }
    } catch {
      disk = null
    }
    res.json({
      services: Array.isArray(ps) ? ps : [],
      servicesError: Array.isArray(ps) ? null : ps.error,
      wa,
      db: statsCache.v,
      disk,
      checks: cur.exists ? crossChecks(cur.env) : [],
      profiles: cur.env.COMPOSE_PROFILES ?? '',
      tunnel: !!cur.env.CLOUDFLARE_TUNNEL_TOKEN,
      job: jobView(ctx.jobs.current()),
    })
  }))

  app.get('/api/logs/:svc', requireAuth, wrap(async (req, res) => {
    const svc = req.params.svc
    if (![...SERVICES, 'admin'].includes(svc)) return void res.status(400).json({ error: 'Unbekannter Dienst.' })
    const tail = Math.min(Math.max(Number(req.query.tail ?? 300) || 300, 10), 2000)
    const cur = readCurrent(ctx)
    const profiles = [...new Set([...(cur.env.COMPOSE_PROFILES ?? '').split(','), 'organizer', 'tunnel'])].filter(Boolean).join(',')
    const r = await ctx.docker.compose(['logs', '--no-color', '--timestamps', '--tail', String(tail), svc], { profiles, timeoutMs: 20_000 })
    res.json({ service: svc, text: redact(r.out) })
  }))

  // --- WhatsApp -------------------------------------------------------------------------------
  app.get('/api/wa', requireAuth, wrap(async (_req, res) => void res.json(await linkView(ctx.waStatusFile))))
  app.post('/api/wa/relink', requireAuth, wrap((req, res) => {
    if (String(req.body?.confirm ?? '').trim().toUpperCase() !== RELINK_WORD) throw new ApplyError(`Zur Bestätigung „${RELINK_WORD}" eintippen.`)
    const phone = String(req.body?.phone ?? '').trim()
    res.json({ job: jobView(startRelink(ctx, phone || undefined)) })
  }))

  // --- Geheimnisse ----------------------------------------------------------------------------
  app.post('/api/reveal', requireAuth, wrap((req, res) => {
    if (!confirmPassword(req, res)) return
    const key = String(req.body?.key ?? '')
    if (!SECRET_KEYS.has(key)) throw new ApplyError('Unbekannter Schlüssel.')
    const v = readCurrent(ctx).env[key] ?? ''
    console.log(`Geheimnis angezeigt: ${key} (von ${ip(req)})`)
    res.json({ key, value: v })
  }))

  app.post('/api/rotate', requireAuth, wrap((req, res) => {
    if (!confirmPassword(req, res)) return
    const key = String(req.body?.key ?? '') as Rotatable
    if (!ROTATABLE.includes(key)) throw new ApplyError('Dieser Schlüssel kann nicht gewechselt werden.')
    res.json({ job: jobView(startRotate(ctx, key)) })
  }))

  /** OpenAI-Schlüssel live prüfen (ohne ihn zu speichern). Ohne key wird der gespeicherte geprüft. */
  app.post('/api/test/openai', requireAuth, wrap(async (req, res) => {
    const cur = readCurrent(ctx)
    const key = String(req.body?.key || cur.env.OPENAI_API_KEY || '').trim()
    const base = String(req.body?.baseUrl || cur.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
    if (!key) throw new ApplyError('Kein Schlüssel angegeben.')
    if (!/^https?:\/\//.test(base)) throw new ApplyError('Ungültige API-Adresse.')
    try {
      const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) })
      if (r.ok) return void res.json({ ok: true, message: 'Schlüssel funktioniert.' })
      res.json({ ok: false, message: r.status === 401 ? 'Der Anbieter lehnt den Schlüssel ab (401).' : `Antwort ${r.status} vom Anbieter.` })
    } catch (e) {
      res.json({ ok: false, message: `Keine Verbindung zum Anbieter: ${(e as Error).message}` })
    }
  }))

  // --- Sicherungen ----------------------------------------------------------------------------
  app.get('/api/backups', requireAuth, wrap((_req, res) => {
    const dir = backupDir(ctx)
    const cur = readCurrent(ctx).env
    const items = listBackups(dir).map((b) => {
      let changed: string[] = []
      try {
        const env = parseEnv(readBackup(dir, b.name))
        changed = [...new Set([...Object.keys(env), ...Object.keys(cur)])].filter((k) => (env[k] ?? '') !== (cur[k] ?? '') && k !== 'COMPOSE_PROFILES').sort()
      } catch {
        changed = []
      }
      return { name: b.name, at: b.at.toISOString(), changed }
    })
    res.json({ backups: items })
  }))

  app.get('/api/backups/:name', requireAuth, wrap((req, res) => {
    const env = parseEnv(readBackup(backupDir(ctx), req.params.name))
    const cur = readCurrent(ctx).env
    const keys = [...new Set([...Object.keys(env), ...Object.keys(cur)])].filter((k) => (env[k] ?? '') !== (cur[k] ?? '')).sort()
    const show = (k: string, v: string | undefined) => (v ? (SECRET_KEYS.has(k) ? hint(v) : v) : '')
    res.json({ name: req.params.name, diff: keys.map((k) => ({ key: k, backup: show(k, env[k]), current: show(k, cur[k]) })) })
  }))

  app.post('/api/backups/:name/restore', requireAuth, wrap((req, res) => void res.json({ job: jobView(startRestore(ctx, req.params.name)) })))

  // --- Wartung --------------------------------------------------------------------------------
  app.post('/api/maintenance/restart', requireAuth, wrap((req, res) => void res.json({ job: jobView(startRestart(ctx, String(req.body?.service ?? ''))) })))
  app.post('/api/maintenance/rebuild', requireAuth, wrap((_req, res) => void res.json({ job: jobView(startRebuild(ctx)) })))
  app.post('/api/maintenance/estimate', requireAuth, wrap((_req, res) => void res.json({ job: jobView(startEstimate(ctx)) })))

  // --- App: pairing and owner password (via mcp-server's internal API) -------------------------
  const internalApi = new InternalApi(APP_INTERNAL_URL, () => readCurrent(ctx).env.ADMIN_INTERNAL_SECRET || undefined)
  const homeUrl = (req: Request) => `${req.secure ? 'https' : 'http'}://${req.headers.host}`

  /** New pairing code with QR for a phone or another browser (10 minutes, single use). */
  app.post('/api/pairing', requireAuth, wrap(async (req, res) => {
    res.json(ctx.fake ? await fakePairing(homeUrl(req)) : await internalApi.createPairing(homeUrl(req)))
  }))

  /** Owner password for the app login and the OAuth consent page (separate from the admin password). */
  app.post('/api/owner-password', requireAuth, wrap(async (req, res) => {
    if (!confirmPassword(req, res)) return
    const pw = String(req.body?.newPassword ?? '')
    if (pw.length < 10) throw new ApplyError('Das Passwort braucht mindestens 10 Zeichen.')
    if (!ctx.fake) await internalApi.setOwnerPassword(pw)
    res.json({ ok: true })
  }))

  app.use('/api', (_req, res) => void res.status(404).json({ error: 'Unbekannter Endpunkt.' }))
  // Single-page app: every other path serves the web app
  app.get('*', (_req, res) => {
    const index = path.join(WEB, 'index.html')
    if (fs.existsSync(index)) res.sendFile(index)
    else res.status(503).type('html').send(NO_WEB)
  })
  return app
}

function constantEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return !!a && x.length === y.length && timingSafeEqual(x, y)
}

/** Separate Docker-only listener; never mounted on the public web server. */
export function createInternalApp(ctx: Ctx, auth: Auth) {
  const app = express()
  app.use(express.json({ limit: '16kb' }))
  app.use((req, res, next) => {
    const secret = readCurrent(ctx).env.ADMIN_INTERNAL_SECRET
    if (!secret || !constantEqual(String(req.headers['x-jarvis-internal-secret'] ?? ''), secret)) return void res.sendStatus(401)
    next()
  })
  const state = () => ({ configured: auth.isConfigured(), revision: auth.revision(), setupComplete: new SetupStore(ctx.dataDir).read(!!readCurrent(ctx).env.POSTGRES_PASSWORD).complete, assistantName: readCurrent(ctx).env.ASSISTANT_NAME || 'Jarvis' })
  app.get('/internal/auth', (_req, res) => res.json(state()))
  app.post('/internal/auth/verify', (req, res) => {
    const source = String(req.body?.ip ?? 'internal').slice(0, 100)
    if (auth.locked(source)) return void res.status(429).json({ error: 'Zu viele Fehlversuche.' })
    const valid = auth.verifyPassword(source, String(req.body?.password ?? ''))
    res.json({ ...state(), valid })
  })
  return app
}
