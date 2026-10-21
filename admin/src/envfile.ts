import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { FIELDS, GROUPS } from './schema.js'

export type Env = Record<string, string>

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Liest .env so, wie Docker Compose sie liest: KEY=wert, optional "export ", Kommentare, '…' (wörtlich),
 * "…" (mit \" \\ \n), unquotierte Werte mit Inline-Kommentar nach Leerzeichen + #.
 */
export function parseEnv(text: string): Env {
  const env: Env = {}
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('export ')) line = line.slice(7).trimStart()
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!KEY_RE.test(key)) continue
    let v = line.slice(eq + 1).trim()
    if (v.startsWith("'")) {
      const end = v.indexOf("'", 1)
      v = end > 0 ? v.slice(1, end) : v.slice(1)
    } else if (v.startsWith('"')) {
      let out = ''
      let i = 1
      for (; i < v.length; i++) {
        const ch = v[i]
        if (ch === '\\' && i + 1 < v.length) {
          const n = v[++i]
          out += n === 'n' ? '\n' : n
        } else if (ch === '"') break
        else out += ch
      }
      v = out
    } else {
      const hash = v.search(/\s#/)
      if (hash >= 0) v = v.slice(0, hash)
      v = v.trim()
    }
    env[key] = v
  }
  return env
}

/** Nur dann in Anführungszeichen, wenn nötig (damit grep/cut in den Skripten weiter funktioniert). */
export function quote(v: string): string {
  if (/^[A-Za-z0-9_.,:/@+=%-]*$/.test(v)) return v
  if (!v.includes("'")) return `'${v}'`
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Schreibt die Einstellungen in Schema-Reihenfolge mit Gruppen-Überschriften.
 * Leere Werte werden weggelassen (dann gilt der Standard). Unbekannte Schlüssel bleiben am Ende erhalten.
 */
export function serializeEnv(env: Env): string {
  const lines: string[] = [
    '# Jarvis-Einstellungen. Verwaltet über die Admin-Oberfläche (docker compose up -d admin app-web, dann http://<server>:8081).',
    '# Von Hand ändern geht auch; die Oberfläche übernimmt alles, was hier steht. Leere Werte = Standard.',
  ]
  const known = new Set(FIELDS.map((f) => f.key))
  for (const g of GROUPS) {
    const fields = FIELDS.filter((f) => f.group === g.id && env[f.key] !== undefined && env[f.key] !== '')
    if (!fields.length) continue
    lines.push('', `# --- ${g.label} ---`)
    for (const f of fields) lines.push(`${f.key}=${quote(env[f.key])}`)
  }
  const extra = Object.keys(env).filter((k) => !known.has(k) && KEY_RE.test(k) && env[k] !== '').sort()
  if (extra.length) {
    lines.push('', '# --- Weitere Einstellungen (nicht von der Oberfläche verwaltet) ---')
    for (const k of extra) lines.push(`${k}=${quote(env[k])}`)
  }
  return lines.join('\n') + '\n'
}

export class EnvLinkError extends Error {
  constructor(public target: string) {
    super(
      `.env ist ein Verweis auf ${target}, das im Admin-Container nicht erreichbar ist. ` +
        `Trage JARVIS_SECRETS_DIR=${path.dirname(target)} in .env ein und starte die Oberfläche neu: docker compose up -d admin`,
    )
  }
}

/** Echter Speicherort der .env (Verweise aufgelöst). Fehlt die Datei, ihr künftiger Ort. */
export function resolveEnvPath(envPath: string): string {
  let st: fs.Stats | undefined
  try {
    st = fs.lstatSync(envPath)
  } catch {
    return envPath
  }
  if (!st.isSymbolicLink()) return envPath
  const target = path.resolve(path.dirname(envPath), fs.readlinkSync(envPath))
  try {
    return fs.realpathSync(envPath)
  } catch {
    throw new EnvLinkError(target)
  }
}

export function readEnvFile(envPath: string): { exists: boolean; text: string; env: Env } {
  const real = resolveEnvPath(envPath)
  try {
    const text = fs.readFileSync(real, 'utf8')
    return { exists: true, text, env: parseEnv(text) }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, text: '', env: {} }
    throw e
  }
}

export interface WriteOptions {
  backupDir?: string
  keepBackups?: number
  /** Besitzer für eine neu angelegte Datei (z.B. Besitzer des Projektordners statt root) */
  fallbackOwner?: { uid: number; gid: number }
}

/** Atomar schreiben: Temp-Datei im selben Ordner, fsync, rename. Rechte 600, Besitzer bleibt erhalten. Gibt den Pfad der Sicherung zurück. */
export function writeEnvAtomic(envPath: string, text: string, opt: WriteOptions = {}): string | null {
  const real = resolveEnvPath(envPath)
  const dir = path.dirname(real)
  let owner = opt.fallbackOwner
  let backup: string | null = null
  try {
    const st = fs.statSync(real)
    owner = { uid: st.uid, gid: st.gid }
    if (opt.backupDir !== undefined) backup = backupEnv(real, opt.backupDir, opt.keepBackups ?? 30, owner)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const tmp = path.join(dir, `.env.tmp-${process.pid}-${randomBytes(4).toString('hex')}`)
  const fd = fs.openSync(tmp, 'wx', 0o600)
  try {
    fs.writeSync(fd, text)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  try {
    if (owner) chownQuiet(tmp, owner)
    fs.renameSync(tmp, real)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
  fsyncDir(dir)
  return backup
}

function chownQuiet(p: string, o: { uid: number; gid: number }) {
  try {
    fs.chownSync(p, o.uid, o.gid)
  } catch {
    // ohne Root-Rechte (z.B. Tests) nicht möglich: Besitzer bleibt der aktuelle Benutzer
  }
}

function fsyncDir(dir: string) {
  try {
    const fd = fs.openSync(dir, 'r')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
  } catch {
    // nicht auf allen Dateisystemen möglich
  }
}

const BACKUP_RE = /^env-(\d{8}-\d{6}-\d{3})(?:-\d+)?\.env$/

export function backupEnv(real: string, backupDir: string, keep: number, owner?: { uid: number; gid: number }): string {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  if (owner) chownQuiet(backupDir, owner)
  const d = new Date()
  const p2 = (n: number, l = 2) => String(n).padStart(l, '0')
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}-${p2(d.getMilliseconds(), 3)}`
  let name = `env-${stamp}.env`
  for (let i = 1; fs.existsSync(path.join(backupDir, name)); i++) name = `env-${stamp}-${i}.env`
  const dest = path.join(backupDir, name)
  fs.copyFileSync(real, dest, fs.constants.COPYFILE_EXCL)
  fs.chmodSync(dest, 0o600)
  if (owner) chownQuiet(dest, owner)
  pruneBackups(backupDir, keep)
  return dest
}

export function listBackups(backupDir: string): { name: string; at: Date; size: number }[] {
  let names: string[]
  try {
    names = fs.readdirSync(backupDir)
  } catch {
    return []
  }
  return names
    .filter((n) => BACKUP_RE.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(backupDir, name))
      return { name, at: st.mtime, size: st.size }
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1))
}

export function readBackup(backupDir: string, name: string): string {
  if (!BACKUP_RE.test(name)) throw new Error('Ungültiger Name.')
  return fs.readFileSync(path.join(backupDir, name), 'utf8')
}

function pruneBackups(backupDir: string, keep: number) {
  for (const b of listBackups(backupDir).slice(keep)) fs.rmSync(path.join(backupDir, b.name), { force: true })
}

export function randomSecret(kind: 'hex24' | 'hex32'): string {
  return randomBytes(kind === 'hex24' ? 24 : 32).toString('hex')
}
