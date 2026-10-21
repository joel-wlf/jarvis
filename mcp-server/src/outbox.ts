// Outbox jobs for wa-ingest (send, react, vote ...). Shared by the MCP action tools and the app API.
import { actDb, pool } from './db.js'

export const MAX_PER_HOUR = Number(process.env.MAX_ACTIONS_PER_HOUR ?? 30)

// Pure queries and harmless state changes do not count against the hourly limit
export const FREE_KINDS = ['group_info', 'check_numbers', 'get_profile', 'blocklist', 'download_media', 'resync_contacts', 'presence', 'chat_modify', 'star', 'privacy', 'group_requests']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type Outcome =
  | { status: 'done'; id: string; result: Record<string, any> }
  | { status: 'failed'; id: string; error: string }
  | { status: 'pending'; id: string }
  | { status: 'cancelled'; id: string }
  | { status: 'offline' }
  | { status: 'limit' }

/** WhatsApp-Verbindung von wa-ingest: Status und Herzschlag (alle 15 s). */
export async function whatsappOnline(): Promise<boolean> {
  try {
    const r = await pool.query<{ k: string; v: string }>(`SELECT key AS k, value AS v FROM meta WHERE key IN ('wa_status', 'wa_heartbeat')`)
    const m = new Map(r.rows.map((x) => [x.k, x.v]))
    if (!m.has('wa_status')) return true // ältere Version ohne Herzschlag: nicht blockieren
    return m.get('wa_status') === 'open' && Date.now() - new Date(m.get('wa_heartbeat') ?? 0).getTime() < 60_000
  } catch {
    return true
  }
}

export async function runJob(kind: string, chatJid: string, payload: unknown): Promise<Outcome> {
  // Ohne Verbindung gar nicht erst einreihen: sonst würde die Nachricht später überraschend gesendet
  if (!(await whatsappOnline())) return { status: 'offline' }
  if (!FREE_KINDS.includes(kind)) {
    const recent = await actDb.query<{ n: string }>(
      `SELECT count(*) n FROM outbox WHERE created_at > now() - interval '1 hour' AND kind <> ALL($1::text[])`,
      [FREE_KINDS],
    )
    if (Number(recent.rows[0].n) >= MAX_PER_HOUR) return { status: 'limit' }
  }
  const ins = await actDb.query<{ id: string }>(
    `INSERT INTO outbox (kind, chat_jid, payload) VALUES ($1, $2, $3) RETURNING id`,
    [kind, chatJid, JSON.stringify(payload)],
  )
  const id = String(ins.rows[0].id)
  for (let i = 0; i < 90; i++) {
    await sleep(i < 4 ? 300 : 700)
    const r = await actDb.query(`SELECT status, result, error FROM outbox WHERE id = $1`, [id])
    const row = r.rows[0]
    if (row.status === 'done') return { status: 'done', id, result: row.result ?? {} }
    if (row.status === 'failed') return { status: 'failed', id, error: row.error }
  }
  // Zeitüberschreitung: wartet der Auftrag noch, zurückziehen, damit er nicht später doch gesendet wird
  const c = await actDb.query(`UPDATE outbox SET status = 'cancelled', error = 'Zeitüberschreitung: nicht ausgeführt', done_at = now() WHERE id = $1 AND status = 'pending' RETURNING id`, [id])
  if (c.rowCount) return { status: 'cancelled', id }
  return { status: 'pending', id } // wird gerade ausgeführt, Ergebnis unklar
}

