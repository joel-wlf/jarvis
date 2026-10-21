// What Jarvis learns from the owner's choices, and the owner's own rules. Stored in watch_state under keys that never
// cover a card key: "rule:chat:<jid>" / "rule:type:<type>" (priority 1-3, dismissed = hide), "learn:<same>" (counters as
// JSON in note) and "rule:learning" (dismissed = learning off). Nothing here deletes messages or cards: every rule can be
// changed or removed in the app, and the cards come back.
import type { Card, LearnedRule, PreferencesResponse, Urgency } from '@jarvis/contract'
import { memDb, pool } from '../db.js'
import type { StateRow } from '../watch.js'
import type { Lang } from './http.js'

export type RuleKind = 'chat' | 'type'
interface Counts { down: number; up: number }

const DOWN_CHAT = 3 // "unimportant" or "later" this often in one chat, never "important": show the chat as "later"
const UP_CHAT = 2 // "important" this often in one chat, never "unimportant": show the chat as "important"
const DOWN_TYPE = 5 // same for a card type across all chats

export const ruleKey = (kind: RuleKind, target: string) => `rule:${kind}:${target}`
const learnKey = (kind: RuleKind, target: string) => `learn:${kind}:${target}`
const LEARNING = 'rule:learning'

export function learningEnabled(rows: StateRow[]) {
  return !rows.find((r) => r.key === LEARNING)?.dismissed
}

/** Rule rows by key, for applying them to cards. */
export function rulesOf(rows: StateRow[]) {
  return new Map(rows.filter((r) => r.key.startsWith('rule:') && r.key !== LEARNING).map((r) => [r.key, r]))
}

/** The rule that applies to a card: its chat first, then its type. */
export function ruleFor(card: Card, chatJid: string | undefined, rules: Map<string, StateRow>): StateRow | undefined {
  return (chatJid ? rules.get(ruleKey('chat', chatJid)) : undefined) ?? rules.get(ruleKey('type', card.type))
}

const parse = (note: string | null): Counts => {
  try {
    const j = JSON.parse(note ?? '{}')
    return { down: Number(j.down) || 0, up: Number(j.up) || 0 }
  } catch {
    return { down: 0, up: 0 }
  }
}

async function bump(kind: RuleKind, target: string, dir: 'down' | 'up'): Promise<Counts> {
  const key = learnKey(kind, target)
  const r = await memDb.query<{ note: string | null }>(`SELECT note FROM watch_state WHERE key = $1`, [key])
  const c = parse(r.rows[0]?.note ?? null)
  c[dir]++
  await memDb.query(
    `INSERT INTO watch_state (key, note) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET note = excluded.note, updated_at = now()`,
    [key, JSON.stringify(c)],
  )
  return c
}

/** Creates or changes a learned rule unless the owner set that rule themself. Returns true when something changed. */
async function learnRule(kind: RuleKind, target: string, priority: Urgency, reason: string): Promise<boolean> {
  const key = ruleKey(kind, target)
  const cur = await memDb.query<{ priority: number | null; note: string | null; dismissed: boolean }>(`SELECT priority, note, dismissed FROM watch_state WHERE key = $1`, [key])
  const row = cur.rows[0]
  if (row && (row.note ?? '').startsWith('user')) return false
  if (row?.priority === priority) return false
  await memDb.query(
    `INSERT INTO watch_state (key, priority, note) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET priority = excluded.priority, note = excluded.note, updated_at = now()`,
    [key, priority, `learned:${reason}`],
  )
  return true
}

const T = {
  de: {
    later: (n: string) => `Ich habe gelernt: ${n} ist dir meist nicht so wichtig. Neue Karten von dort zeige ich als „Später“. Ändern kannst du das unter System → Lernen.`,
    important: (n: string) => `Ich habe gelernt: ${n} ist dir wichtig. Neue Karten von dort zeige ich als „Wichtig“. Ändern kannst du das unter System → Lernen.`,
    typeLater: (n: string) => `Ich habe gelernt: Karten der Art „${n}“ sind dir meist nicht wichtig. Ich zeige sie ab jetzt als „Später“.`,
  },
  en: {
    later: (n: string) => `I learned that ${n} is usually not that important to you. New cards from there will show as "Later". Change it under System → Learning.`,
    important: (n: string) => `I learned that ${n} matters to you. New cards from there will show as "Important". Change it under System → Learning.`,
    typeLater: (n: string) => `I learned that "${n}" cards are usually not important to you. They will show as "Later" from now on.`,
  },
}

/**
 * Records one choice of the owner. "down" = unimportant or later, "up" = important. Returns a sentence when a new rule was
 * learned, so the app can say so right away.
 */
export async function learnFrom(card: Card, chatJid: string | undefined, dir: 'down' | 'up', l: Lang): Promise<string | null> {
  const rows = await pool.query<StateRow>(`SELECT key, last_notified_at, snoozed_until, dismissed, note, priority FROM watch_state WHERE key = $1`, [LEARNING]).catch(() => ({ rows: [] as StateRow[] }))
  if (!learningEnabled(rows.rows)) return null
  const t = T[l]
  if (chatJid) {
    const c = await bump('chat', chatJid, dir)
    if (dir === 'down' && c.down >= DOWN_CHAT && c.up === 0 && (await learnRule('chat', chatJid, 1, `${c.down}x`))) return t.later(card.source.chat)
    if (dir === 'up' && c.up >= UP_CHAT && c.down === 0 && (await learnRule('chat', chatJid, 3, `${c.up}x`))) return t.important(card.source.chat)
  }
  const c = await bump('type', card.type, dir)
  if (dir === 'down' && c.down >= DOWN_TYPE && c.up === 0 && (await learnRule('type', card.type, 1, `${c.down}x`))) return t.typeLater(typeLabel(card.type, l))
  return null
}

const TYPES: Record<string, [string, string]> = {
  question: ['Frage', 'Question'], voice: ['Sprachnachricht', 'Voice message'], event: ['Termin', 'Event'], task: ['Aufgabe', 'Task'],
  poll: ['Umfrage', 'Poll'], link: ['Link', 'Link'], photos: ['Fotos', 'Photos'], digest: ['Gruppen-Überblick', 'Group digest'],
  person: ['Kontakt halten', 'Keep in touch'], followup: ['Versprechen', 'Promise'], insight: ['Hinweis', 'Insight'], reminder: ['Erinnerung', 'Reminder'],
  shopping: ['Einkauf', 'Shopping'], parcel: ['Paket', 'Parcel'], money: ['Geld', 'Money'], trip: ['Reise', 'Trip'], place: ['Ort', 'Place'],
  address: ['Adresse', 'Address'], birthday: ['Geburtstag', 'Birthday'], conflict: ['Überschneidung', 'Conflict'],
}
export const typeLabel = (type: string, l: Lang) => TYPES[type]?.[l === 'de' ? 0 : 1] ?? type

// --- settings ------------------------------------------------------------------------------------

export async function preferences(l: Lang): Promise<PreferencesResponse> {
  const rows = await pool.query<{ key: string; priority: number | null; dismissed: boolean; note: string | null; updated_at: Date; name: string | null }>(
    `SELECT w.key, w.priority, w.dismissed, w.note, w.updated_at, c.name
     FROM watch_state w LEFT JOIN v_chats c ON w.key LIKE 'rule:chat:%' AND c.jid = substr(w.key, 11)
     WHERE w.key LIKE 'rule:%' ORDER BY w.updated_at DESC`,
  )
  const learning = !rows.rows.find((r) => r.key === LEARNING)?.dismissed
  const rules: LearnedRule[] = []
  for (const r of rows.rows) {
    if (r.key === LEARNING) continue
    const m = /^rule:(chat|type):(.+)$/.exec(r.key)
    if (!m) continue
    const kind = m[1] as RuleKind
    const target = m[2]
    const learned = (r.note ?? '').startsWith('learned')
    rules.push({
      key: r.key, kind, target,
      label: kind === 'type' ? typeLabel(target, l) : r.name ?? target,
      ...(r.priority ? { priority: r.priority as Urgency } : {}),
      hidden: !!r.dismissed,
      source: learned ? 'learned' : 'user',
      updatedAt: new Date(r.updated_at).toISOString(),
    })
  }
  return { learning, rules }
}

export async function setRule(kind: RuleKind, target: string, priority: Urgency | null, hidden: boolean) {
  const key = ruleKey(kind, target)
  if (priority === null && !hidden) return removeRule(key)
  await memDb.query(
    `INSERT INTO watch_state (key, priority, dismissed, note) VALUES ($1,$2,$3,'user') ON CONFLICT (key) DO UPDATE SET priority = excluded.priority, dismissed = excluded.dismissed, note = 'user', updated_at = now()`,
    [key, priority, hidden],
  )
}

/** Removes a rule and what was learned for it, so learning starts over for that chat or type. */
export async function removeRule(key: string) {
  if (!/^rule:(chat|type):.+$/.test(key)) return
  await memDb.query(`DELETE FROM watch_state WHERE key = $1 OR key = $2`, [key, key.replace(/^rule:/, 'learn:')])
}

export async function setLearning(enabled: boolean) {
  if (enabled) await memDb.query(`DELETE FROM watch_state WHERE key = $1`, [LEARNING])
  else await memDb.query(`INSERT INTO watch_state (key, dismissed, note) VALUES ($1, true, 'user') ON CONFLICT (key) DO UPDATE SET dismissed = true, updated_at = now()`, [LEARNING])
}

/** Forget everything learned (rules marked learned and all counters). Rules the owner set stay. */
export async function forgetLearned() {
  await memDb.query(`DELETE FROM watch_state WHERE key LIKE 'learn:%' OR (key LIKE 'rule:%' AND key <> $1 AND note LIKE 'learned%')`, [LEARNING])
}
