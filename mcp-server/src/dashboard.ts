import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { pool } from './db.js'
import { loadWatchState, POLL_RENOTIFY_MS, priorityOf, resolveState as resolve, type ItemState } from './watch.js'


export function registerDashboardTool(server: McpServer) {
  server.registerTool(
    'get_dashboard',
    {
      description:
        'Alles, was gerade Aufmerksamkeit braucht, als JSON mit Karten: fällige und kommende Erinnerungen, Termine in den nächsten 3 Tagen, unbeantwortete Fragen in Einzelchats, offene Umfragen, fällige Vorschläge und den Zustand von Jarvis. ' +
        'Jede Karte hat einen Schlüssel (key) und einen Zustand (new, notified, scheduled); Zurückgestelltes und als unwichtig Markiertes ist bereits herausgefiltert und steht unter muted. ' +
        '"to_notify" nennt die Schlüssel, die der Watch jetzt melden sollte. Jede Karte trägt "priority" (3 wichtig, 2 normal, 1 später, null = keine Festlegung): was der Nutzer als wichtig markiert hat, steht immer in to_notify, solange es neu ist, was er auf später gestellt hat, nie. Für Fragen wie "Was steht an?" oder "Gibt es etwas Offenes?" der beste Startpunkt.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const now = new Date()
      const rows = await loadWatchState()
      const muted: { key: string; kind: 'dismissed' | 'snoozed'; until?: string; note?: string }[] = []
      const mute = (key: string, r: ReturnType<typeof resolve>) => {
        if (r.state === 'dismissed' || r.state === 'snoozed') muted.push({ key, kind: r.state, until: r.until?.toISOString(), note: r.note })
      }
      const toNotify: string[] = []
      const prio = (key: string) => priorityOf(key, rows) ?? null
      /** The owner's own importance beats the default rules: important is always reported while new, later never. */
      const shouldNotify = (key: string, state: ItemState, byDefault: boolean) => state === 'new' && prio(key) !== 1 && (prio(key) === 3 || byDefault)

      // Zustand von Jarvis
      const meta = await pool.query<{ key: string; value: string }>(`SELECT key, value FROM meta WHERE key IN ('wa_status','wa_heartbeat','self_jid','self_lid')`)
      const m = Object.fromEntries(meta.rows.map((x) => [x.key, x.value]))
      const hbAge = m.wa_heartbeat ? Math.round((Date.now() - new Date(m.wa_heartbeat).getTime()) / 1000) : null
      const healthOk = m.wa_status === 'open' && hbAge != null && hbAge < 900
      const health = { ok: healthOk, whatsapp: m.wa_status ?? 'unbekannt', heartbeat_age_s: hbAge }
      if (!healthOk) {
        const r = resolve('health', rows, { renotifyMs: 6 * 3600_000 })
        if (r.state === 'new') toNotify.push('health')
      }

      // Erinnerungen
      const rem = await pool.query(
        `SELECT id, text, due_at, status, ref FROM reminders
         WHERE status IN ('open','fired') AND due_at <= now() + interval '7 days' ORDER BY due_at LIMIT 20`,
      )
      const reminders = rem.rows.map((x) => {
        const due = new Date(x.due_at)
        const state: ItemState = x.status === 'fired' ? 'notified' : due <= now ? 'new' : 'scheduled'
        const key = `reminder:${x.id}`
        if (shouldNotify(key, state, true)) toNotify.push(key)
        return { key, priority: prio(key), id: x.id, text: x.text, due_at: due.toISOString(), overdue: due <= now, ref: x.ref, state }
      })

      // Termine
      const ev = await pool.query(
        `SELECT id, title, summary, event_at, facts, chat_count FROM topics
         WHERE status = 'open' AND event_at BETWEEN now() - interval '2 hours' AND now() + interval '3 days' ORDER BY event_at LIMIT 12`,
      )
      const events = ev.rows.flatMap((x) => {
        const at = new Date(x.event_at)
        const h = (at.getTime() - Date.now()) / 3600_000
        const stage = h <= 3.5 ? 'kurz' : h >= 12 && h <= 30 ? 'vortag' : 'info'
        const key = `event:${x.id}:${stage}`
        const r = resolve(key, rows)
        if (r.state === 'dismissed' || r.state === 'snoozed') {
          mute(key, r)
          return []
        }
        if (shouldNotify(key, r.state, stage !== 'info')) toNotify.push(key)
        const people = ((x.facts as { people?: { name: string; state: string }[] } | null)?.people ?? []).slice(0, 12)
        return [{ key, priority: prio(key), topic_id: x.id, title: x.title, summary: String(x.summary ?? '').replace(/\s+/g, ' ').slice(0, 220), event_at: at.toISOString(), hours_until: Math.round(h * 10) / 10, stage, people, chats: x.chat_count, state: r.state }]
      })

      // Unbeantwortete Fragen in Einzelchats
      const q = await pool.query(
        `WITH last AS (
           SELECT DISTINCT ON (chat_jid) chat_jid, chat_name, from_me, ts, type, left(body, 200) AS body
           FROM v_messages WHERE NOT chat_is_group AND deleted_at IS NULL AND type NOT IN ('reaction','sticker')
           ORDER BY chat_jid, ts DESC)
         SELECT l.chat_jid, l.chat_name, l.ts, p.relationship, p.closeness, l.type, l.body
         FROM last l LEFT JOIN contact_profiles p ON p.jid = l.chat_jid
         WHERE NOT l.from_me AND l.ts BETWEEN now() - interval '4 days' AND now() - interval '2 hours'
           AND (l.body LIKE '%?%' OR l.type = 'audio')
         ORDER BY coalesce(p.closeness, 0) DESC, l.ts DESC LIMIT 15`,
      )
      const questions = q.rows.flatMap((x) => {
        const key = `frage:${x.chat_jid}:${Math.floor(new Date(x.ts).getTime() / 1000)}`
        const r = resolve(key, rows)
        if (r.state === 'dismissed' || r.state === 'snoozed') {
          mute(key, r)
          return []
        }
        if (shouldNotify(key, r.state, true)) toNotify.push(key)
        return [{ key, priority: prio(key), chat_jid: x.chat_jid, chat: x.chat_name, ts: new Date(x.ts).toISOString(), relationship: x.relationship, closeness: x.closeness, type: x.type, body: x.body, state: r.state }]
      })

      // Offene Umfragen
      const self = [m.self_jid, m.self_lid].filter(Boolean)
      const pl = await pool.query(
        `SELECT v.id, v.chat_jid, v.chat_name, v.sender_name, v.ts,
                coalesce(m.raw->'message'->'pollCreationMessageV3'->>'name', m.raw->'message'->'pollCreationMessageV2'->>'name', m.raw->'message'->'pollCreationMessage'->>'name', v.body) AS question,
                (SELECT count(*) FROM poll_votes pv WHERE pv.chat_jid = v.chat_jid AND pv.poll_msg_id = v.id) AS voted
         FROM v_messages v JOIN messages m ON m.chat_jid = v.chat_jid AND m.id = v.id
         WHERE v.type = 'poll' AND NOT v.from_me AND v.ts > now() - interval '14 days'
           AND NOT EXISTS (SELECT 1 FROM poll_votes pv WHERE pv.chat_jid = v.chat_jid AND pv.poll_msg_id = v.id AND pv.voter_jid = ANY($1::text[]))
         ORDER BY v.ts DESC LIMIT 10`,
        [self],
      )
      const polls = pl.rows.flatMap((x) => {
        const key = `umfrage:${x.id}`
        const age = (Date.now() - new Date(x.ts).getTime()) / 86400_000
        const r = resolve(key, rows, { renotifyMs: POLL_RENOTIFY_MS })
        if (r.state === 'dismissed' || r.state === 'snoozed') {
          mute(key, r)
          return []
        }
        if (shouldNotify(key, r.state, age < 3)) toNotify.push(key)
        return [{ key, priority: prio(key), id: x.id, chat_jid: x.chat_jid, chat: x.chat_name, from: x.sender_name, created: new Date(x.ts).toISOString(), age_days: Math.round(age * 10) / 10, question: String(x.question ?? '').slice(0, 200), voted: Number(x.voted), state: r.state }]
      })

      // Fällige Vorschläge
      const ac = await pool.query(
        `SELECT id, title, due_at FROM suggested_actions
         WHERE status = 'open' AND due_at BETWEEN now() - interval '1 day' AND now() + interval '1 day' ORDER BY due_at LIMIT 10`,
      )
      const actions = ac.rows.flatMap((x) => {
        const key = `aktion:${x.id}`
        const r = resolve(key, rows)
        if (r.state === 'dismissed' || r.state === 'snoozed') {
          mute(key, r)
          return []
        }
        if (shouldNotify(key, r.state, true)) toNotify.push(key)
        return [{ key, priority: prio(key), id: x.id, title: String(x.title).slice(0, 160), due_at: new Date(x.due_at).toISOString(), state: r.state }]
      })

      const out = {
        now: now.toISOString(),
        health,
        to_notify: toNotify,
        reminders,
        events,
        questions,
        polls,
        actions,
        muted,
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(out) }] }
    },
  )
}
