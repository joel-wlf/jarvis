import { FIELDS, FIELD, effective, validateField } from './schema.js'

export type Env = Record<string, string>

export interface Check {
  level: 'error' | 'warn' | 'info'
  message: string
  keys: string[]
}

/** Profile, die die Oberfläche verwaltet. Andere Profile in COMPOSE_PROFILES bleiben unangetastet. */
export const MANAGED_PROFILES = ['tunnel', 'organizer', 'local-whisper'] as const

/** Wie Sprachnachrichten tatsächlich transkribiert werden (gleiche Logik wie wa-ingest/src/transcribe.ts). */
export function transcribeMode(env: Env): 'openai' | 'off' {
  const p = effective(env, 'TRANSCRIBE_PROVIDER')
  if (p && p !== 'openai') return 'off'
  return env.OPENAI_API_KEY ? 'openai' : 'off'
}

/** Leitet COMPOSE_PROFILES aus den Einstellungen ab, damit Profil und Schalter nie auseinanderlaufen. */
export function deriveProfiles(env: Env): string {
  const keep = (env.COMPOSE_PROFILES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !(MANAGED_PROFILES as readonly string[]).includes(s))
  const p: string[] = []
  if (env.CLOUDFLARE_TUNNEL_TOKEN) p.push('tunnel')
  if (effective(env, 'ORGANIZER_ENABLED') === 'true') p.push('organizer')
  return [...new Set([...p, ...keep])].join(',')
}

/** Feldweise Fehler (nur für Schema-Schlüssel). */
export function fieldErrors(env: Env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of FIELDS) {
    if (f.managed) continue
    const err = validateField(f, env[f.key] ?? '')
    if (err) out[f.key] = err
  }
  return out
}

/** Feldübergreifende Prüfungen. prev = bisher gültige Einstellungen (für Hinweise zu Änderungen). */
export function crossChecks(env: Env, prev?: Env): Check[] {
  const c: Check[] = []
  const on = (k: string) => effective(env, k) === 'true'
  const key = !!env.OPENAI_API_KEY

  if (on('ORGANIZER_ENABLED') && !key)
    c.push({ level: 'error', message: 'Die Themen-Sortierung braucht einen OpenAI-Schlüssel.', keys: ['ORGANIZER_ENABLED', 'OPENAI_API_KEY'] })
  if (effective(env, 'TRANSCRIBE_PROVIDER') === 'openai' && !key)
    c.push({ level: 'error', message: 'Transkription per OpenAI braucht einen OpenAI-Schlüssel.', keys: ['TRANSCRIBE_PROVIDER', 'OPENAI_API_KEY'] })
  if (effective(env, 'EMBED_PROVIDER') === 'openai' && !key)
    c.push({ level: 'error', message: 'Embeddings per OpenAI brauchen einen OpenAI-Schlüssel.', keys: ['EMBED_PROVIDER', 'OPENAI_API_KEY'] })
  if (env.POSTGRES_PASSWORD && env.POSTGRES_PASSWORD === env.MCP_RO_PASSWORD)
    c.push({ level: 'error', message: 'Datenbank-Passwort und Passwort der MCP-Rollen müssen verschieden sein.', keys: ['POSTGRES_PASSWORD', 'MCP_RO_PASSWORD'] })

  if (key && !env.ORGANIZER_EXCLUDE_NAMES)
    c.push({
      level: 'warn',
      message: 'Mit OpenAI-Schlüssel gehen alle Chats an die KI. Sensible Chats (Arzt, Bank, Anwalt …) unter Datenschutz ausschließen.',
      keys: ['ORGANIZER_EXCLUDE_NAMES'],
    })
  if (key && !on('ORGANIZER_REDACT'))
    c.push({ level: 'warn', message: 'Schwärzen ist aus: Telefonnummern, IBANs und E-Mails gehen im Klartext an die KI.', keys: ['ORGANIZER_REDACT'] })
  if (on('IMAGE_DESCRIBE') && !key)
    c.push({ level: 'info', message: 'Bildbeschreibung ist an, wirkt aber erst mit OpenAI-Schlüssel.', keys: ['IMAGE_DESCRIBE'] })
  if (Number(effective(env, 'MAX_ACTIONS_PER_HOUR')) > 60)
    c.push({ level: 'warn', message: 'Mehr als 60 Aktionen pro Stunde erhöhen das Risiko einer WhatsApp-Sperre.', keys: ['MAX_ACTIONS_PER_HOUR'] })
  if (on('ENABLE_ACTIONS') && !on('REQUIRE_CONFIRM'))
    c.push({ level: 'info', message: 'Aktionen laufen ohne Vorschau sofort. Claude-Tools zum Senden in Claude möglichst mit Rückfrage erlauben.', keys: ['REQUIRE_CONFIRM'] })
  if (env.WA_PAIRING_PHONE)
    c.push({ level: 'info', message: 'Kopplung per Telefonnummer ist gesetzt; der Wert wird nach dem Verknüpfen automatisch geleert.', keys: ['WA_PAIRING_PHONE'] })
  if (!env.CLOUDFLARE_TUNNEL_TOKEN)
    c.push({ level: 'info', message: 'Kein Cloudflare-Tunnel: Claude erreicht Jarvis nur, wenn du den MCP-Server anders veröffentlichst.', keys: ['CLOUDFLARE_TUNNEL_TOKEN'] })

  if (prev) {
    const embedChanged =
      effectiveEmbed(prev) !== effectiveEmbed(env) ||
      (effectiveEmbed(env) === 'openai' && effective(prev, 'OPENAI_EMBED_MODEL') !== effective(env, 'OPENAI_EMBED_MODEL'))
    if (embedChanged)
      c.push({ level: 'warn', message: 'Embedding-Anbieter oder -Modell ändert sich: alle Vektoren werden neu berechnet (dauert, kostet bei OpenAI).', keys: ['EMBED_PROVIDER', 'OPENAI_EMBED_MODEL'] })
    if (prev.MCP_TOKEN && prev.MCP_TOKEN !== env.MCP_TOKEN)
      c.push({ level: 'warn', message: 'Neuer MCP-Token: Den Connector in Claude mit der neuen URL neu einrichten.', keys: ['MCP_TOKEN'] })
  }
  return c
}

function effectiveEmbed(env: Env) {
  const p = effective(env, 'EMBED_PROVIDER')
  return p || (env.OPENAI_API_KEY ? 'openai' : 'local')
}

export function hasErrors(env: Env, prev?: Env) {
  return Object.keys(fieldErrors(env)).length > 0 || crossChecks(env, prev).some((c) => c.level === 'error')
}

/** Schlüssel, deren Wert sich geändert hat (fehlend und leer gelten als gleich). */
export function changedKeys(a: Env, b: Env): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((k) => (a[k] ?? '') !== (b[k] ?? '')).sort()
}

/** Dienste, die eine Änderung betrifft (für die Anzeige; Compose erkennt selbst, was neu erstellt werden muss). */
export function affectedServices(keys: string[]): string[] {
  const s = new Set<string>()
  for (const k of keys) for (const svc of FIELD.get(k)?.services ?? []) s.add(svc)
  return [...s].sort()
}
