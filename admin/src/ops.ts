import { applyEnv, ApplyError, prepare, recreateSelf, waitHealthy } from './apply.js'
import { backupDir, readCurrent, type Ctx } from './context.js'
import { activeServices } from './docker.js'
import { parseEnv, randomSecret, readBackup, type Env } from './envfile.js'
import type { JobLog } from './jobs.js'
import { readLinkStatus } from './wa.js'

export const SERVICES = ['postgres', 'embedder', 'wa-ingest', 'mcp-server', 'organizer', 'whisper', 'cloudflared'] as const
export const ROTATABLE = ['MCP_TOKEN', 'POSTGRES_PASSWORD', 'MCP_RO_PASSWORD'] as const
export type Rotatable = (typeof ROTATABLE)[number]

function needEnv(ctx: Ctx): Env {
  const cur = readCurrent(ctx)
  if (!cur.exists) throw new ApplyError('Es gibt noch keine Einstellungen. Bitte zuerst die Einrichtung abschließen.')
  return cur.env
}

/** Änderungen aus der Oberfläche anwenden. */
export function startApply(ctx: Ctx, changes: Record<string, string | null>, opts: { initial?: boolean } = {}) {
  const cur = readCurrent(ctx)
  const p = prepare(cur.env, changes, { initial: opts.initial })
  const errs = Object.entries(p.errors)
  const blocking = p.checks.filter((c) => c.level === 'error')
  if (errs.length || blocking.length) return { prepared: p }
  const job = ctx.jobs.start(opts.initial ? 'setup' : 'apply', opts.initial ? 'Jarvis einrichten und starten' : 'Einstellungen anwenden', async (log) => {
    if (p.changed.length) log('info', `Geändert: ${p.changed.join(', ')}`)
    // Das Whisper-Modell ist ein Build-Argument: ohne Neubau bliebe das alte Modell im Image
    const build = p.changed.includes('WHISPER_MODEL')
    return applyEnv(ctx, log, p.next, { initial: opts.initial || !cur.exists, build })
  })
  return { job, prepared: p }
}

/** Geheimnis wechseln. Für Datenbank-Passwörter wird die Datenbank mit umgestellt und bei Fehler zurückgesetzt. */
export function startRotate(ctx: Ctx, key: Rotatable) {
  const env = needEnv(ctx)
  const label = { MCP_TOKEN: 'MCP-Token', POSTGRES_PASSWORD: 'Datenbank-Passwort', MCP_RO_PASSWORD: 'Passwort der MCP-Rollen' }[key]
  return ctx.jobs.start('rotate', `${label} wechseln`, async (log) => {
    const fresh = randomSecret(key === 'MCP_TOKEN' ? 'hex32' : 'hex24')
    const next = { ...env, [key]: fresh }
    if (key === 'MCP_TOKEN') {
      const r = await applyEnv(ctx, log, next)
      if (r.status === 'ok') log('warn', 'Den Connector in Claude jetzt mit der neuen URL neu einrichten (Übersicht → Connector).')
      return r
    }
    const roles = key === 'POSTGRES_PASSWORD' ? ['jarvis'] : ['mcp_ro', 'mcp_act', 'mcp_mem']
    const old = env[key]
    log('info', `Stelle in der Datenbank um: ${roles.join(', ')}`)
    await ctx.db.setRolePasswords(env.POSTGRES_PASSWORD, roles, fresh)
    log('ok', 'Datenbank umgestellt.')
    // Zurück: als jarvis mit dem jeweils gültigen Passwort anmelden
    const revert = async (l: JobLog) => {
      const login = key === 'POSTGRES_PASSWORD' ? fresh : env.POSTGRES_PASSWORD
      await ctx.db.setRolePasswords(login, roles, old)
      l('ok', 'Datenbank-Passwort wieder auf den alten Stand gesetzt.')
    }
    try {
      return await applyEnv(ctx, log, next, { onRollback: revert })
    } catch (e) {
      // .env wurde nicht geschrieben (Prüfung fehlgeschlagen): Datenbank zurückstellen
      await revert(log).catch((err) => log('error', `Zurücksetzen fehlgeschlagen: ${(err as Error).message}`))
      throw e
    }
  })
}

/** Gesicherten Stand wiederherstellen (läuft durch dieselbe Prüfung und Gesundheitskontrolle). */
export function startRestore(ctx: Ctx, name: string) {
  const env = needEnv(ctx)
  const text = readBackup(backupDir(ctx), name)
  const restored = parseEnv(text)
  for (const k of ['POSTGRES_PASSWORD', 'MCP_RO_PASSWORD'])
    if (restored[k] !== env[k]) throw new ApplyError('Diese Sicherung hat andere Datenbank-Passwörter als die Datenbank. Wiederherstellen würde den Zugriff trennen.')
  return ctx.jobs.start('restore', `Sicherung ${name} wiederherstellen`, (log) => applyEnv(ctx, log, restored))
}

export function startRestart(ctx: Ctx, service: string) {
  if (!(SERVICES as readonly string[]).includes(service)) throw new ApplyError('Unbekannter Dienst.')
  needEnv(ctx)
  return ctx.jobs.start('restart', `${service} neu starten`, async (log) => {
    const r = await ctx.docker.compose(['restart', service], { timeoutMs: 180_000, onLine: (l) => log('out', l) })
    if (r.code !== 0) throw new Error(`Neustart fehlgeschlagen: ${r.out.slice(-400)}`)
    const err = await waitHealthy(ctx, log, [service], ctx.healthTimeoutMs)
    if (err) throw new Error(err)
    return 'ok'
  })
}

/** Image ID and reference each running container was started from, so a failed update can put the old images back. */
async function snapshotImages(ctx: Ctx, services: string[]) {
  const snap: { service: string; id: string; ref: string }[] = []
  for (const service of services) {
    const q = await ctx.docker.compose(['ps', '-q', service], { timeoutMs: 30_000 })
    const cid = q.out.trim().split('\n')[0]?.trim()
    if (q.code !== 0 || !cid) continue
    const i = await ctx.docker.docker(['inspect', '--format', '{{.Image}} {{.Config.Image}}', cid], { timeoutMs: 30_000 })
    const [id, ref] = i.out.trim().split(/\s+/)
    if (i.code === 0 && id && ref) snap.push({ service, id, ref })
  }
  return snap
}

/**
 * Update to the current images and restart. Prefers the prebuilt images (`compose pull`), builds from source when
 * they cannot be pulled. The running services stay up until the new images are there; if the new state does not come
 * up healthy, the previous images are tagged back and started again.
 */
export function startRebuild(ctx: Ctx) {
  const env = needEnv(ctx)
  return ctx.jobs.start('rebuild', 'Alle Dienste aktualisieren', async (log) => {
    const all = await activeServices(ctx.docker)
    const targets = all.filter((s) => s !== 'admin')
    const ref = `${env.JARVIS_REGISTRY || 'Standard-Registry'}, Version ${env.JARVIS_VERSION || 'latest'}`
    const before = await snapshotImages(ctx, targets)

    log('info', `Lade vorgebaute Images (${ref}); die laufenden Dienste bleiben so lange aktiv …`)
    const pull = await ctx.docker.compose(['pull', ...all], { timeoutMs: 30 * 60_000, onLine: (l) => log('out', l) })
    if (pull.code === 0) {
      log('ok', 'Images geladen.')
    } else {
      log('warn', 'Die vorgebauten Images sind nicht erreichbar; baue stattdessen aus dem Quellcode (das kann auf einem Raspberry Pi lange dauern) …')
      const b = await ctx.docker.compose(['build', ...targets], { timeoutMs: 90 * 60_000, onLine: (l) => log('out', l) })
      if (b.code !== 0) throw new Error('Aktualisierung fehlgeschlagen (weder Laden noch Bauen); es läuft weiter der bisherige Stand.')
    }

    const r = await applyEnv(ctx, log, env)
    if (r.status === 'ok') {
      if (pull.code === 0) await recreateSelf(ctx, log)
      return r
    }
    if (!before.length) {
      log('warn', 'Der vorherige Image-Stand ist nicht bekannt, ein automatisches Zurücksetzen ist nicht möglich.')
      return r
    }
    log('warn', 'Setze die Dienste auf die vorherigen Images zurück …')
    for (const b of before) await ctx.docker.docker(['tag', b.id, b.ref], { timeoutMs: 30_000 })
    const up = await ctx.docker.compose(['up', '-d', '--no-build', '--pull', 'never', ...before.map((b) => b.service)], { timeoutMs: 20 * 60_000, onLine: (l) => log('out', l) })
    const err = up.code !== 0 ? 'docker compose up fehlgeschlagen' : await waitHealthy(ctx, log, before.map((b) => b.service), ctx.healthTimeoutMs)
    if (err) log('error', `Auch der vorherige Stand läuft nicht sauber: ${err}`)
    else log('ok', 'Vorheriger Stand ist wiederhergestellt und läuft.')
    return { status: 'rolled_back' as const }
  })
}

export function startEstimate(ctx: Ctx) {
  const env = needEnv(ctx)
  if (!env.OPENAI_API_KEY) throw new ApplyError('Für die Kostenschätzung wird ein OpenAI-Schlüssel gebraucht.')
  return ctx.jobs.start('estimate', 'Kostenschätzung Themen-Sortierung', async (log) => {
    const profiles = [...new Set([...(env.COMPOSE_PROFILES ?? '').split(','), 'organizer'])].filter(Boolean).join(',')
    const r = await ctx.docker.compose(['run', '--rm', '--no-deps', 'organizer', 'node', 'dist/index.js', '--estimate'], {
      profiles,
      timeoutMs: 30 * 60_000,
      onLine: (l) => log('out', l),
    })
    if (r.code !== 0) throw new Error('Schätzung fehlgeschlagen (siehe Ausgabe).')
    return 'ok'
  })
}

export const RELINK_WORD = 'NEU VERKNÜPFEN'

/** WhatsApp-Sitzung löschen und neu verknüpfen (optional per Kopplungscode). Die Datenbank bleibt erhalten. */
export function startRelink(ctx: Ctx, phone?: string) {
  const env = needEnv(ctx)
  const changes: Record<string, string | null> = { WA_PAIRING_PHONE: phone ? phone : null }
  const p = prepare(env, changes)
  if (p.errors.WA_PAIRING_PHONE) throw new ApplyError(p.errors.WA_PAIRING_PHONE)
  return ctx.jobs.start('relink', 'WhatsApp neu verknüpfen', async (log) => {
    log('info', 'Stoppe wa-ingest …')
    await ctx.docker.compose(['rm', '--stop', '--force', 'wa-ingest'], { timeoutMs: 120_000, onLine: (l) => log('out', l) })
    const v = await ctx.docker.docker(['volume', 'rm', 'jarvis_wa-auth'], { timeoutMs: 60_000 })
    if (v.code === 0) log('ok', 'Alte WhatsApp-Sitzung gelöscht.')
    else if (/no such volume/i.test(v.out)) log('info', 'Es gab keine gespeicherte Sitzung.')
    else throw new Error(`Sitzung konnte nicht gelöscht werden: ${v.out.slice(-300)}`)
    const r = await applyEnv(ctx, log, p.next)
    if (r.status === 'ok') log('ok', 'wa-ingest läuft. Jetzt unter WhatsApp den QR-Code scannen bzw. den Kopplungscode eingeben.')
    return r
  })
}

/**
 * Nach erfolgreicher Verknüpfung per Kopplungscode die Telefonnummer wieder aus .env entfernen (README: "Nach dem
 * Verknüpfen wieder leeren"). Läuft im Hintergrund, nur wenn gerade kein anderer Vorgang läuft.
 */
export function autoClearPairing(ctx: Ctx) {
  try {
    const cur = readCurrent(ctx)
    if (!cur.exists || !cur.env.WA_PAIRING_PHONE || ctx.jobs.current()) return
    if (readLinkStatus(ctx.waStatusFile)?.state !== 'open') return
    const p = prepare(cur.env, { WA_PAIRING_PHONE: null })
    ctx.jobs.start('apply', 'Kopplungsnummer nach Verknüpfung entfernen', (log) => applyEnv(ctx, log, p.next))
  } catch {
    // beim nächsten Durchlauf erneut
  }
}
