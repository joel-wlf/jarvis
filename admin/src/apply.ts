import fs from 'node:fs'
import path from 'node:path'
import { affectedServices, changedKeys, crossChecks, deriveProfiles, fieldErrors, type Check } from './checks.js'
import { backupDir, readCurrent, type Ctx } from './context.js'
import { activeServices, composePs, validateCompose, FakeDocker, type ServiceState } from './docker.js'
import { randomSecret, serializeEnv, writeEnvAtomic, type Env } from './envfile.js'
import type { JobLog, JobStatus } from './jobs.js'
import { FIELD, FIELDS, normalizeInput } from './schema.js'
import { readLinkStatus } from './wa.js'

/** Profil-Dienste und ihr Profil (aus docker-compose.yml). */
export const PROFILE_SERVICES: Record<string, string> = FakeDocker.PROFILED
const SELF = 'admin'
const SELF_KEYS = ['ADMIN_PORT', 'ADMIN_BIND', 'JARVIS_SECRETS_DIR']

export interface Prepared {
  next: Env
  errors: Record<string, string>
  checks: Check[]
  changed: string[]
  services: string[]
}

export class ApplyError extends Error {}

/**
 * Baut aus den aktuellen Einstellungen und den Änderungen der Oberfläche die neue .env.
 * changes: Wert = neuer Wert, null = auf Standard zurücksetzen. Unbekannte Schlüssel werden abgelehnt.
 */
export function prepare(current: Env, changes: Record<string, string | null>, opts: { initial?: boolean } = {}): Prepared {
  const next: Env = { ...current }
  const errors: Record<string, string> = {}
  for (const [key, raw] of Object.entries(changes)) {
    const f = FIELD.get(key)
    if (!f || f.managed) {
      errors[key] = 'Diese Einstellung kann hier nicht geändert werden.'
      continue
    }
    if (f.initOnly && !opts.initial && current[key] && raw !== current[key]) {
      errors[key] = 'Nur über „Wechseln" änderbar, weil die Datenbank mit umgestellt werden muss.'
      continue
    }
    if (raw === null || raw === '') delete next[key]
    else next[key] = normalizeInput(key, String(raw))
  }
  if (opts.initial) for (const f of FIELDS) if (f.generate && !next[f.key]) next[f.key] = randomSecret(f.generate)
  const profiles = deriveProfiles(next)
  if (profiles) next.COMPOSE_PROFILES = profiles
  else delete next.COMPOSE_PROFILES
  Object.assign(errors, fieldErrors(next))
  const checks = crossChecks(next, Object.keys(current).length ? current : undefined)
  const changed = changedKeys(current, next)
  return { next, errors, checks, changed, services: affectedServices(changed) }
}

export interface ApplyOptions {
  title?: string
  initial?: boolean
  build?: boolean
  /** Wird nach einem Rollback aufgerufen (z.B. Datenbank-Passwort zurücksetzen) */
  onRollback?: (log: JobLog) => Promise<void>
}

const bad = (s: ServiceState) => s.state === 'restarting' || s.state === 'exited' || s.state === 'dead' || s.health === 'unhealthy'

/** Wendet eine neue .env an: prüfen, sichern, schreiben, starten, Gesundheit prüfen, bei Fehler zurück. */
export async function applyEnv(ctx: Ctx, log: JobLog, next: Env, opts: ApplyOptions = {}): Promise<{ status: JobStatus; result?: Record<string, unknown> }> {
  const cur = readCurrent(ctx)
  const prevText = cur.exists ? cur.text : null

  // 1) Inhaltlich prüfen
  const errs = fieldErrors(next)
  const blocking = crossChecks(next).filter((c) => c.level === 'error')
  if (Object.keys(errs).length || blocking.length) {
    for (const [k, e] of Object.entries(errs)) log('error', `${FIELD.get(k)?.label ?? k}: ${e}`)
    for (const c of blocking) log('error', c.message)
    throw new ApplyError('Einstellungen sind ungültig, nichts wurde geändert.')
  }
  const text = serializeEnv(next)

  // 2) Docker Compose mit der neuen Datei prüfen, bevor irgendetwas geändert wird
  const candidate = path.join(ctx.dataDir, 'candidate.env')
  fs.writeFileSync(candidate, text, { mode: 0o600 })
  try {
    log('info', 'Prüfe die Konfiguration mit Docker Compose …')
    const err = await validateCompose(ctx.docker, candidate)
    if (err) {
      log('error', err)
      throw new ApplyError('Docker Compose lehnt die Konfiguration ab, nichts wurde geändert.')
    }
  } finally {
    fs.rmSync(candidate, { force: true })
  }

  // 3) Zustand vorher merken: Dienste, die schon vorher kaputt waren, lösen keinen Rollback aus
  const before = await composePs(ctx.docker).catch(() => [] as ServiceState[])
  const brokenBefore = new Set(before.filter(bad).map((s) => s.service))
  if (brokenBefore.size) log('warn', `Schon vorher gestört: ${[...brokenBefore].join(', ')}`)

  // 4) Sichern und atomar schreiben
  if (prevText === text) log('info', '.env ist unverändert.')
  else {
    const b = writeEnvAtomic(ctx.envPath, text, { backupDir: backupDir(ctx), fallbackOwner: ctx.fallbackOwner })
    log('ok', b ? `.env gespeichert (Sicherung: ${path.basename(b)})` : '.env angelegt')
  }

  // 5) Starten und prüfen
  const outcome = await deployAndVerify(ctx, log, next, { build: opts.build, initial: opts.initial, brokenBefore })
  if (outcome === null) {
    const selfChanged = SELF_KEYS.some((k) => (cur.env[k] ?? '') !== (next[k] ?? ''))
    if (selfChanged) await recreateSelf(ctx, log)
    log('ok', 'Fertig. Alle Dienste laufen.')
    return { status: 'ok' }
  }

  // 6) Fehler: zurück auf den alten Stand
  log('error', outcome)
  if (prevText === null || prevText === text) {
    log('warn', 'Kein früherer Stand vorhanden, auf den zurückgesetzt werden kann. Einstellungen korrigieren und erneut anwenden.')
    return { status: 'failed' }
  }
  log('warn', 'Setze auf den vorherigen Stand zurück …')
  writeEnvAtomic(ctx.envPath, prevText, { fallbackOwner: ctx.fallbackOwner })
  if (opts.onRollback) await opts.onRollback(log).catch((e) => log('error', `Zurücksetzen fehlgeschlagen: ${(e as Error).message}`))
  const { env: prevEnv } = readCurrent(ctx)
  const again = await deployAndVerify(ctx, log, prevEnv, { brokenBefore, rollback: true })
  if (again === null) log('ok', 'Vorheriger Stand ist wiederhergestellt und läuft.')
  else log('error', `Auch der vorherige Stand läuft nicht sauber: ${again}`)
  return { status: 'rolled_back' }
}

/** Startet die aktiven Dienste (außer admin), entfernt abgeschaltete Profil-Dienste und wartet auf Gesundheit. null = alles gut. */
async function deployAndVerify(
  ctx: Ctx,
  log: JobLog,
  env: Env,
  o: { build?: boolean; initial?: boolean; brokenBefore: Set<string>; rollback?: boolean },
): Promise<string | null> {
  const profiles = env.COMPOSE_PROFILES ?? ''
  let active: string[]
  try {
    active = await activeServices(ctx.docker, undefined, profiles)
  } catch (e) {
    return (e as Error).message
  }
  // Abgeschaltete Profil-Dienste stoppen und entfernen (compose up allein lässt sie weiterlaufen)
  const inactive = Object.keys(PROFILE_SERVICES).filter((s) => !active.includes(s))
  if (inactive.length) {
    const ps = await composePs(ctx.docker).catch(() => [] as ServiceState[])
    const present = inactive.filter((s) => ps.some((p) => p.service === s))
    if (present.length) {
      log('info', `Stoppe abgeschaltete Dienste: ${present.join(', ')}`)
      const all = [...new Set([...profiles.split(','), ...Object.values(PROFILE_SERVICES)])].filter(Boolean).join(',')
      const r = await ctx.docker.compose(['rm', '--stop', '--force', ...present], { profiles: all, timeoutMs: 120_000, onLine: (l) => log('out', l) })
      if (r.code !== 0) log('warn', `Konnte ${present.join(', ')} nicht entfernen: ${r.out.slice(-300)}`)
    }
  }
  const targets = active.filter((s) => s !== SELF)
  log('info', `${o.rollback ? 'Starte vorherigen Stand' : 'Starte Dienste'}: ${targets.join(', ')}${o.build ? ' (mit Neubau)' : ''}`)
  if (o.initial) {
    // Prebuilt images first (instant); only what cannot be pulled is built by `up` below
    log('info', 'Lade vorgebaute Images …')
    const pulled = await ctx.docker.compose(['pull', '--ignore-pull-failures', ...targets], { profiles, timeoutMs: 30 * 60_000, onLine: (l) => log('out', l) })
    if (pulled.code !== 0) log('warn', 'Images konnten nicht geladen werden; fehlende werden gebaut. Auf einem Raspberry Pi kann das 10 bis 30 Minuten dauern.')
  }
  const args = ['up', '-d', ...(o.build ? ['--build'] : []), ...targets]
  const up = await ctx.docker.compose(args, { profiles, timeoutMs: o.initial || o.build ? 90 * 60_000 : 20 * 60_000, onLine: (l) => log('out', l) })
  if (up.code !== 0) return `docker compose up fehlgeschlagen (Code ${up.code}).`

  const skip = new Set(o.brokenBefore)
  if (readLinkStatus(ctx.waStatusFile)?.state === 'logged_out') {
    skip.add('wa-ingest')
    log('warn', 'WhatsApp ist abgemeldet; wa-ingest wird bei der Prüfung nicht berücksichtigt (unter WhatsApp neu verknüpfen).')
  }
  const health = await waitHealthy(ctx, log, targets.filter((s) => !skip.has(s)), o.initial ? Math.max(ctx.healthTimeoutMs, 10 * 60_000) : ctx.healthTimeoutMs)
  if (health) return health

  if (targets.includes('postgres')) {
    log('info', 'Prüfe die Datenbank-Anmeldungen …')
    const err = await ctx.db.checkLogins(env)
    if (err) {
      return /password authentication failed/i.test(err)
        ? `${err}. Die Datenbank wurde mit anderen Passwörtern angelegt als in .env stehen.`
        : err
    }
    log('ok', 'Datenbank-Anmeldungen funktionieren.')
  }
  return null
}

/** Wartet, bis alle Dienste laufen (und, wo vorhanden, healthy sind) und das für stableMs bleiben. Fehlertext oder null. */
export async function waitHealthy(ctx: Ctx, log: JobLog, targets: string[], timeoutMs: number): Promise<string | null> {
  const end = Date.now() + timeoutMs
  const badSince = new Map<string, number>()
  let goodSince: number | null = null
  let lastReport = ''
  log('info', 'Warte, bis alle Dienste stabil laufen …')
  for (;;) {
    let ps: ServiceState[] = []
    try {
      ps = await composePs(ctx.docker)
    } catch (e) {
      log('warn', (e as Error).message)
    }
    const now = Date.now()
    const pending: string[] = []
    for (const svc of targets) {
      const s = ps.find((p) => p.service === svc)
      if (!s) {
        pending.push(`${svc} (fehlt)`)
        continue
      }
      if (bad(s)) {
        if (!badSince.has(svc)) badSince.set(svc, now)
        // Kurze Aussetzer beim Start tolerieren, dauerhafte Störung ist ein Fehler
        if (now - badSince.get(svc)! >= Math.min(15_000, ctx.stableMs)) {
          const logs = await ctx.docker.compose(['logs', '--no-color', '--tail', '25', svc], { timeoutMs: 20_000 }).catch(() => null)
          if (logs?.out) log('out', logs.out)
          return `${svc} startet nicht sauber (${s.health === 'unhealthy' ? 'unhealthy' : s.state}${s.exitCode ? `, Code ${s.exitCode}` : ''}).`
        }
        pending.push(`${svc} (${s.state})`)
        continue
      }
      badSince.delete(svc)
      if (s.state !== 'running' || (s.health && s.health !== 'healthy')) pending.push(`${svc} (${s.health || s.state})`)
    }
    if (!pending.length) {
      goodSince ??= now
      if (now - goodSince >= ctx.stableMs) {
        log('ok', `Alle Dienste laufen stabil: ${targets.join(', ')}`)
        return null
      }
    } else {
      goodSince = null
      const report = pending.join(', ')
      if (report !== lastReport) log('info', `Warte auf: ${report}`)
      lastReport = report
    }
    if (now > end) return `Zeitüberschreitung: ${pending.join(', ') || 'Dienste nicht stabil'}.`
    await new Promise((r) => setTimeout(r, ctx.pollMs))
  }
}

/**
 * Erstellt den admin-Container neu (Port/Adresse geändert). Läuft in einem kurzlebigen Geschwister-Container aus dem
 * eigenen Image, damit der Vorgang nicht mit dem eigenen Neustart abbricht.
 */
export async function recreateSelf(ctx: Ctx, log: JobLog) {
  if (!ctx.self) {
    log('warn', 'Die Oberfläche muss selbst neu gestartet werden: docker compose up -d admin')
    return
  }
  const { image, projectHost, secretsHost } = ctx.self
  const args = ['run', '-d', '--rm', '--name', `jarvis-admin-updater-${Date.now()}`, '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${projectHost}:${projectHost}`]
  if (secretsHost) args.push('-v', `${secretsHost}:${secretsHost}`)
  args.push('-w', projectHost, '--entrypoint', 'sh', image, '-c', 'sleep 3 && docker compose up -d --no-deps admin')
  const r = await ctx.docker.docker(args, { timeoutMs: 60_000 })
  if (r.code === 0) log('ok', 'Die Oberfläche startet in wenigen Sekunden unter der neuen Adresse neu.')
  else log('warn', `Neustart der Oberfläche fehlgeschlagen, bitte von Hand: docker compose up -d admin (${r.out.slice(-200)})`)
}
