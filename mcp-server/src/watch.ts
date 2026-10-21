// Shared owner state: watch service keys (watch_state) and reminders.
// Used by the MCP tools (dashboard, watch_feedback, reminders) and the app API (cards, act), so both follow the same rules.
import { memDb, pool } from './db.js'

export interface StateRow {
  key: string
  last_notified_at: Date | null
  snoozed_until: Date | null
  dismissed: boolean
  note: string | null
}

export type ItemState = 'new' | 'notified' | 'snoozed' | 'dismissed' | 'scheduled'

export const POLL_RENOTIFY_MS = 3 * 24 * 3600_000

/** A key without suffix acts as a prefix: "frage:<jid>" covers "frage:<jid>:<ts>", "umfrage:" covers all polls. */
export function covers(entryKey: string, key: string): boolean {
  return key === entryKey || key.startsWith(entryKey.endsWith(':') ? entryKey : `${entryKey}:`)
}

export function resolveState(key: string, rows: StateRow[], opts: { renotifyMs?: number } = {}): { state: ItemState; until?: Date; notified_at?: Date; note?: string } {
  const now = Date.now()
  const hit = rows.filter((r) => covers(r.key, key))
  const dis = hit.find((r) => r.dismissed)
  if (dis) return { state: 'dismissed', note: dis.note ?? undefined }
  const sn = hit.filter((r) => r.snoozed_until && r.snoozed_until.getTime() > now).sort((a, b) => b.snoozed_until!.getTime() - a.snoozed_until!.getTime())[0]
  if (sn) return { state: 'snoozed', until: sn.snoozed_until!, note: sn.note ?? undefined }
  const exact = rows.find((r) => r.key === key)
  if (exact?.last_notified_at) {
    const afterSnooze = !exact.snoozed_until || exact.last_notified_at.getTime() > exact.snoozed_until.getTime()
    const stale = opts.renotifyMs != null && now - exact.last_notified_at.getTime() > opts.renotifyMs
    if (afterSnooze && !stale) return { state: 'notified', notified_at: exact.last_notified_at }
  }
  return { state: 'new' }
}

export async function loadWatchState(): Promise<StateRow[]> {
  const r = await pool
    .query<StateRow>(`SELECT key, last_notified_at, snoozed_until, dismissed, note FROM watch_state`)
    .catch(() => ({ rows: [] as StateRow[] }))
  return r.rows.map((x) => ({ ...x, last_notified_at: toDate(x.last_notified_at), snoozed_until: toDate(x.snoozed_until) }))
}

const toDate = (d: Date | string | null) => (d == null ? null : d instanceof Date ? d : new Date(d))

/** Owner feedback on a key: never show again, or not before `until`. Same upsert as the watch_feedback tool. */
export async function setWatchFeedback(key: string, action: 'dismiss' | 'snooze', opts: { until?: Date; note?: string } = {}) {
  await memDb.query(
    `INSERT INTO watch_state (key, snoozed_until, dismissed, note) VALUES ($1,$2,$3,$4)
     ON CONFLICT (key) DO UPDATE SET snoozed_until = excluded.snoozed_until, dismissed = excluded.dismissed, note = coalesce(excluded.note, watch_state.note), updated_at = now()`,
    [key, action === 'snooze' ? opts.until ?? null : null, action === 'dismiss', opts.note ?? null],
  )
}

export async function resetWatchFeedback(key: string) {
  await memDb.query(`DELETE FROM watch_state WHERE key = $1`, [key])
}

export async function markNotified(keys: string[], reminderIds: number[] = []) {
  for (const k of keys) {
    await memDb.query(
      `INSERT INTO watch_state (key, last_notified_at) VALUES ($1, now())
       ON CONFLICT (key) DO UPDATE SET last_notified_at = now(), updated_at = now()`,
      [k],
    )
  }
  if (reminderIds.length) await memDb.query(`UPDATE reminders SET status = 'fired', fired_at = now() WHERE id = ANY($1) AND status = 'open'`, [reminderIds])
}

// --- reminders ---------------------------------------------------------------------------------

export async function createReminder(text: string, dueAt: Date, ref?: string | null): Promise<number> {
  const r = await memDb.query<{ id: number }>(`INSERT INTO reminders (text, due_at, ref) VALUES ($1,$2,$3) RETURNING id`, [text, dueAt, ref ?? null])
  return Number(r.rows[0].id)
}

/** Move a reminder to a new time and reopen it. Returns false if it does not exist. */
export async function snoozeReminder(id: number, dueAt: Date): Promise<boolean> {
  const r = await memDb.query(`UPDATE reminders SET due_at = $2, status = 'open', fired_at = NULL WHERE id = $1`, [id, dueAt])
  return !!r.rowCount
}

export async function setReminderStatus(id: number, status: 'done' | 'cancelled'): Promise<boolean> {
  const r = await memDb.query(`UPDATE reminders SET status = $2 WHERE id = $1`, [id, status])
  return !!r.rowCount
}
