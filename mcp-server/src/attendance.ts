// Whether the owner goes to an event, answered in the app ("Ich bin dabei" / "Bin nicht dabei"). Nothing is sent to
// WhatsApp. The answer lives in watch_state (key zusage:<event>, note yes|no) for the cards and the hot context, and as
// a global memory so Claude knows it in every conversation. The memory is marked with refs [{type: 'attendance', key,
// until}] and leaves Claude's notes once the event is over.
import { memDb, pool } from './db.js'
import { OWNER } from './config.js'

export type Going = 'yes' | 'no'

/** Stable per event, whatever stage (event:<id>:vortag …) the card is in. */
export function attendanceKey(ref: { topicId?: number; actionId?: number }, cardKey: string): string {
  if (ref.topicId != null) return `zusage:topic:${ref.topicId}`
  if (ref.actionId != null) return `zusage:aktion:${ref.actionId}`
  return `zusage:${cardKey}`
}

/** Answers from watch_state rows (loadWatchState), by attendance key. */
export function attendanceOf(rows: { key: string; note: string | null }[]): Map<string, Going> {
  const out = new Map<string, Going>()
  for (const r of rows) if (r.key.startsWith('zusage:') && (r.note === 'yes' || r.note === 'no')) out.set(r.key, r.note)
  return out
}

/** The memory sentence; with the date, so it still reads right next week. */
export function attendanceNote(going: Going, title: string, whenText: string): string {
  const what = `„${title.replace(/\s+/g, ' ').trim().slice(0, 160)}“${whenText ? ` (${whenText})` : ''}`
  return going === 'yes' ? `${OWNER} geht zu ${what}. In der App zugesagt.` : `${OWNER} geht nicht zu ${what}. In der App abgesagt.`
}

/** SQL condition for memories that are an answer to an event already over (excluded from Claude's notes). */
export const PAST_ATTENDANCE = `(refs @> '[{"type":"attendance"}]' AND coalesce((refs->0->>'until')::timestamptz, 'infinity') < now() - interval '1 day')`

export async function setAttendance(key: string, going: Going, o: { title: string; whenText: string; at?: Date }) {
  await memDb.query(
    `INSERT INTO watch_state (key, note) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET note = excluded.note, updated_at = now()`,
    [key, going],
  )
  const content = attendanceNote(going, o.title, o.whenText)
  const refs = JSON.stringify([{ type: 'attendance', key, ...(o.at ? { until: o.at.toISOString() } : {}) }])
  const prev = await pool.query<{ id: string }>(`SELECT id FROM memories WHERE refs @> $1::jsonb ORDER BY id DESC LIMIT 1`, [JSON.stringify([{ type: 'attendance', key }])])
  if (prev.rows[0]) {
    await memDb.query(`UPDATE memories SET content = $1, refs = $2::jsonb, active = true, embedding = NULL, updated_at = now() WHERE id = $3`, [content, refs, prev.rows[0].id])
  } else {
    await memDb.query(`INSERT INTO memories (kind, content, scope, refs) VALUES ('fact', $1, 'global', $2::jsonb)`, [content, refs])
  }
  // Answers to events long past only fill the list of notes
  await memDb.query(`UPDATE memories SET active = false, updated_at = now() WHERE active AND ${PAST_ATTENDANCE}`)
}
