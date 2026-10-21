import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { NextFunction, Request, Response } from 'express'

const SESSION_MS = 12 * 3_600_000
const WINDOW_MS = 15 * 60_000
const MAX_FAILS = 10
export const COOKIE = 'jarvis_admin'

interface AuthFile {
  hash: string
  salt: string
  createdAt: string
}

/** The first owner chooses a password; subsequent access requires that password. */
export class Auth {
  private sessions = new Map<string, { expires: number; revision: string }>()
  private fails = new Map<string, { n: number; first: number }>()
  private authFile: string
  private codeFile: string

  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    this.authFile = path.join(dir, 'auth.json')
    this.codeFile = path.join(dir, 'setup-code')
    setInterval(() => this.cleanup(), 60_000).unref()
  }

  isConfigured() {
    return fs.existsSync(this.authFile)
  }

  /** Credential generation changes on password replacement and CLI reset. Never exposes a hash. */
  revision(): string {
    try { return createHash('sha256').update(fs.readFileSync(this.authFile)).digest('hex') }
    catch { return 'unconfigured' }
  }

  resetPassword() {
    fs.rmSync(this.authFile, { force: true })
    fs.rmSync(this.codeFile, { force: true })
    this.sessions.clear()
  }

  /** Prüft Fehlversuche. true = gesperrt. */
  locked(ip: string) {
    const f = this.fails.get(ip)
    return !!f && Date.now() - f.first < WINDOW_MS && f.n >= MAX_FAILS
  }

  private fail(ip: string) {
    const now = Date.now()
    let f = this.fails.get(ip)
    if (!f || now - f.first > WINDOW_MS) f = { n: 0, first: now }
    f.n++
    this.fails.set(ip, f)
  }

  /** Claim an unconfigured installation. The legacy code argument is ignored. */
  setup(ip: string, _code: string, password: string): { session?: string; error?: string } {
    if (this.isConfigured()) return { error: 'Der Zugang ist schon eingerichtet. Bitte anmelden.' }
    if (this.locked(ip)) return { error: 'Zu viele Fehlversuche. Bitte 15 Minuten warten.' }
    const pwErr = passwordProblem(password)
    if (pwErr) return { error: pwErr }
    const salt = randomBytes(16).toString('hex')
    const data: AuthFile = { salt, hash: hash(password, salt), createdAt: new Date().toISOString() }
    // Publish the complete credential file without replacing an existing owner.
    // This also protects simultaneous first setup in separate admin processes.
    const candidate = `${this.authFile}.claim-${randomBytes(8).toString('hex')}`
    try {
      fs.writeFileSync(candidate, JSON.stringify(data), { mode: 0o600, flag: 'wx' })
      try { fs.linkSync(candidate, this.authFile) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return { error: 'Der Zugang ist schon eingerichtet. Bitte anmelden.' }
        throw error
      }
    } finally { fs.rmSync(candidate, { force: true }) }
    fs.rmSync(this.codeFile, { force: true })
    return { session: this.newSession() }
  }

  verifyPassword(ip: string, password: string): boolean {
    if (this.locked(ip)) return false
    let data: AuthFile
    try {
      data = JSON.parse(fs.readFileSync(this.authFile, 'utf8'))
    } catch {
      return false
    }
    const ok = safeEqual(hash(String(password ?? ''), data.salt), data.hash)
    if (!ok) this.fail(ip)
    else this.fails.delete(ip)
    return ok
  }

  login(ip: string, password: string): { session?: string; error?: string } {
    if (this.locked(ip)) return { error: 'Zu viele Fehlversuche. Bitte 15 Minuten warten.' }
    if (!this.verifyPassword(ip, password)) return { error: 'Passwort falsch.' }
    return { session: this.newSession() }
  }

  changePassword(ip: string, oldPw: string, newPw: string): string | null {
    if (!this.verifyPassword(ip, oldPw)) return 'Aktuelles Passwort falsch.'
    const pwErr = passwordProblem(newPw)
    if (pwErr) return pwErr
    const salt = randomBytes(16).toString('hex')
    writeAtomic(this.authFile, JSON.stringify({ salt, hash: hash(newPw, salt), createdAt: new Date().toISOString() }))
    this.sessions.clear()
    return null
  }

  logout(id: string | undefined) {
    if (id) this.sessions.delete(id)
  }

  private newSession() {
    const id = randomBytes(32).toString('base64url')
    this.sessions.set(id, { expires: Date.now() + SESSION_MS, revision: this.revision() })
    return id
  }

  /** Gültige Sitzung? Verlängert sie gleitend. */
  check(id: string | undefined): boolean {
    // Passwort per CLI zurückgesetzt: alle Sitzungen ungültig
    if (!id || !this.isConfigured()) return false
    const exp = this.sessions.get(id)
    if (!exp || exp.expires < Date.now() || exp.revision !== this.revision()) {
      this.sessions.delete(id ?? '')
      return false
    }
    this.sessions.set(id, { expires: Date.now() + SESSION_MS, revision: this.revision() })
    return true
  }

  private cleanup() {
    const now = Date.now()
    for (const [id, exp] of this.sessions) if (exp.expires < now || exp.revision !== this.revision()) this.sessions.delete(id)
    for (const [ip, f] of this.fails) if (now - f.first > WINDOW_MS) this.fails.delete(ip)
  }
}

export function passwordProblem(pw: unknown): string | null {
  const s = String(pw ?? '')
  if (s.length < 15) return 'Das Passwort muss mindestens 15 Zeichen lang sein.'
  if (s.length > 200) return 'Das Passwort ist zu lang.'
  return null
}

const hash = (pw: string, salt: string) => scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

function writeAtomic(file: string, text: string) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

export function sessionCookie(id: string, secure: boolean) {
  return `${COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`
}

export const clearCookie = () => `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`

/**
 * Schutz gegen Cross-Site-Anfragen: schreibende Anfragen brauchen den Header X-Jarvis (löst bei fremden Seiten eine
 * CORS-Vorabprüfung aus, die nie beantwortet wird) und, falls vorhanden, einen passenden Origin.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  if (req.headers['x-jarvis'] !== '1') return void res.status(403).json({ error: 'Anfrage abgelehnt (Header fehlt).' })
  const origin = req.headers.origin
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return void res.status(403).json({ error: 'Anfrage abgelehnt (fremde Herkunft).' })
    } catch {
      return void res.status(403).json({ error: 'Anfrage abgelehnt.' })
    }
  }
  next()
}
