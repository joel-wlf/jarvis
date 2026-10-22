// The background of a card: where it comes from, so the owner (and Claude) understand it without opening WhatsApp.
import type { CardContextResponse } from '@jarvis/contract'
import { pool } from '../db.js'
import { niceName, type Built } from './cards.js'
import type { Lang } from './http.js'

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined)

export async function cardContext(b: Built, l: Lang): Promise<CardContextResponse> {
  const out: CardContextResponse = { messages: [] }
  const jid = b.ref.chatJid
  if (jid) out.chat = niceName((await pool.query<{ name: string }>(`SELECT name FROM v_chats WHERE jid = $1`, [jid])).rows[0]?.name ?? jid, l)
  type Row = { id: string; sender_name: string; from_me: boolean; ts: Date; type: string; body: string | null }
  let rows: Row[] = []
  if (b.ref.threadId != null) {
    const th = await pool.query<{ summary: string | null; topic_title: string | null; topic_summary: string | null }>(
      `SELECT t.summary, tp.title AS topic_title, tp.summary AS topic_summary FROM threads t LEFT JOIN topics tp ON tp.id = t.topic_id WHERE t.id = $1`,
      [b.ref.threadId],
    )
    if (th.rows[0]?.summary) out.summary = th.rows[0].summary
    if (th.rows[0]?.topic_title) out.topic = { title: th.rows[0].topic_title, ...(th.rows[0].topic_summary ? { summary: th.rows[0].topic_summary } : {}) }
    rows = (await pool.query<Row>(
      `SELECT * FROM (SELECT v.id, v.sender_name, v.from_me, v.ts, v.type, v.body FROM v_messages v JOIN messages m ON m.chat_jid = v.chat_jid AND m.id = v.id
                      WHERE m.thread_id = $1 AND v.deleted_at IS NULL AND v.type <> 'reaction' ORDER BY v.ts DESC LIMIT 14) x ORDER BY ts`,
      [b.ref.threadId],
    )).rows
  } else if (b.ref.topicId != null) {
    const tp = await pool.query<{ title: string; summary: string | null }>(`SELECT title, summary FROM topics WHERE id = $1`, [b.ref.topicId])
    if (tp.rows[0]) out.topic = { title: tp.rows[0].title, ...(tp.rows[0].summary ? { summary: tp.rows[0].summary } : {}) }
    rows = (await pool.query<Row & { chat_name: string }>(
      `SELECT * FROM (SELECT v.id, v.sender_name || ' · ' || v.chat_name AS sender_name, v.from_me, v.ts, v.type, v.body FROM v_messages v JOIN messages m ON m.chat_jid = v.chat_jid AND m.id = v.id
                      JOIN threads t ON t.id = m.thread_id WHERE t.topic_id = $1 AND v.deleted_at IS NULL AND v.type <> 'reaction' ORDER BY v.ts DESC LIMIT 14) x ORDER BY ts`,
      [b.ref.topicId],
    )).rows
  }
  if (!rows.length && jid) {
    // around the card's message or time: a few lines before, a couple after
    const at = b.card.source.at ? new Date(b.card.source.at) : new Date()
    rows = (await pool.query<Row>(
      `(SELECT id, sender_name, from_me, ts, type, body FROM v_messages WHERE chat_jid = $1 AND deleted_at IS NULL AND type <> 'reaction' AND ts <= $2 ORDER BY ts DESC LIMIT 9)
       UNION ALL
       (SELECT id, sender_name, from_me, ts, type, body FROM v_messages WHERE chat_jid = $1 AND deleted_at IS NULL AND type <> 'reaction' AND ts > $2 ORDER BY ts LIMIT 3)
       ORDER BY ts`,
      [jid, at],
    )).rows
  }
  const voice = l === 'de' ? 'Sprachnachricht' : 'Voice message'
  out.messages = rows.map((m) => ({
    who: m.from_me ? (l === 'de' ? 'Du' : 'You') : niceName(m.sender_name, l),
    fromMe: m.from_me,
    at: iso(m.ts)!,
    text: (m.body ?? (m.type === 'audio' ? `[${voice}]` : `[${m.type}]`)).slice(0, 800),
    ...(b.ref.messageId && m.id === b.ref.messageId ? { highlight: true } : {}),
  }))
  return out
}
