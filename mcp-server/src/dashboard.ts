import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Card } from '@jarvis/contract'
import { pool } from './db.js'
import { listCards, type Built } from './app/cards.js'
import { loadWatchState, resolveState as resolve } from './watch.js'

// get_dashboard reads the same feed as the app (listCards): the owner's priorities, the rules Jarvis learned and the
// "unimportant" / "later" choices apply here too. The shape (reminders, events, questions, polls, actions, muted,
// to_notify) stays as the watch task expects it; everything else the app shows comes under "more".

const BY_DEFAULT_MIN = 2 // Jarvis' own urgency from which a new card is reported without the owner's say

export function registerDashboardTool(server: McpServer) {
  server.registerTool(
    'get_dashboard',
    {
      description:
        'Alles, was gerade Aufmerksamkeit braucht, als JSON mit Karten: fällige und kommende Erinnerungen, Termine (aus Themen und aus Chats) der nächsten Tage, unbeantwortete Fragen und Sprachnachrichten in Einzelchats, offene Umfragen, Aufgaben und den Zustand von Jarvis. ' +
        'Es ist derselbe Feed wie in der App: was der Nutzer dort auf wichtig, später oder unwichtig gestellt hat, und was Jarvis daraus gelernt hat, gilt auch hier. ' +
        'Jede Karte hat einen Schlüssel (key) und einen Zustand (new, notified, scheduled); Zurückgestelltes und als unwichtig Markiertes ist bereits herausgefiltert und steht unter muted. ' +
        '"to_notify" nennt die Schlüssel, die der Watch jetzt melden sollte. Jede Karte trägt "priority" (3 wichtig, 2 normal, 1 später, null = keine Festlegung): was der Nutzer als wichtig markiert hat, steht immer in to_notify, solange es neu ist, was er auf später gestellt hat, nie. ' +
        'Unter "more" stehen die übrigen Karten der App (Links, Fotos, offene Versprechen, Geburtstage, Kontakte, die sich melden sollten …); sie kommen nur in to_notify, wenn der Nutzer sie als wichtig markiert hat. ' +
        'Für Karten mit Vorschlägen, Hintergrund und Ausführen: list_cards, get_card, act_on_card. Für Fragen wie "Was steht an?" oder "Gibt es etwas Offenes?" der beste Startpunkt.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const now = new Date()
      const rows = await loadWatchState()
      const feed = await listCards('de', now)

      // Zustand von Jarvis
      const meta = await pool.query<{ key: string; value: string }>(`SELECT key, value FROM meta WHERE key IN ('wa_status','wa_heartbeat')`)
      const m = Object.fromEntries(meta.rows.map((x) => [x.key, x.value]))
      const hbAge = m.wa_heartbeat ? Math.round((Date.now() - new Date(m.wa_heartbeat).getTime()) / 1000) : null
      const healthOk = m.wa_status === 'open' && hbAge != null && hbAge < 900
      const health = { ok: healthOk, whatsapp: m.wa_status ?? 'unbekannt', heartbeat_age_s: hbAge }

      const toNotify: string[] = []
      if (!healthOk) {
        const r = resolve('health', rows, { renotifyMs: 6 * 3600_000 })
        if (r.state === 'new') toNotify.push('health')
      }

      /** The owner's own importance beats the default rules: important is always reported while new, later never. */
      const notify = (b: Built, byDefault: boolean) => {
        const ok = b.card.state === 'new' && b.owner !== 1 && (b.owner === 3 || byDefault)
        if (ok) toNotify.push(b.card.key)
        return ok
      }
      const prio = (b: Built) => b.owner ?? null
      const byDefault = (b: Built) => b.guess >= BY_DEFAULT_MIN
      const of = <T extends Card['type']>(...types: T[]) => feed.filter((b) => (types as string[]).includes(b.card.type))

      const reminders = of('reminder').map((b) => {
        notify(b, true)
        const due = new Date(b.card.dueAt ?? now)
        return { key: b.card.key, priority: prio(b), id: b.ref.reminderId, text: b.card.title, due_at: due.toISOString(), overdue: due <= now, ref: (b.card.data as { note?: string }).note ?? null, state: b.card.state }
      })

      const events = of('event').slice(0, 15).map((b) => {
        notify(b, byDefault(b))
        const at = new Date(b.card.dueAt ?? now)
        const stage = /^event:\d+:(kurz|vortag|info)$/.exec(b.card.key)?.[1] ?? null
        const d = b.card.data as { attendees?: { name: string }[]; yes?: number; going?: 'yes' | 'no' }
        return {
          ...(d.going ? { owner_going: d.going === 'yes' } : {}),
          key: b.card.key, priority: prio(b), topic_id: b.ref.topicId ?? null, title: b.card.title, summary: (b.card.context ?? '').slice(0, 220), event_at: b.card.dueAt ? at.toISOString() : null,
          hours_until: b.card.dueAt ? Math.round(((at.getTime() - now.getTime()) / 3600_000) * 10) / 10 : null, stage, chat: b.card.source.chat, people: (d.attendees ?? []).map((p) => p.name), state: b.card.state,
        }
      })

      const questions = of('question', 'voice').slice(0, 15).map((b) => {
        notify(b, true)
        const d = b.card.data as { quote?: string; transcript?: string; summary?: string; waitingSince?: string }
        return {
          key: b.card.key, priority: prio(b), chat_jid: b.ref.chatJid ?? null, chat: b.card.source.chat, ts: d.waitingSince ?? b.card.source.at ?? null, relationship: b.ref.relationship ?? null,
          closeness: b.ref.closeness ?? null, type: b.card.type === 'voice' ? 'audio' : 'text', body: (d.quote ?? d.transcript ?? d.summary ?? b.card.title).slice(0, 200), state: b.card.state,
        }
      })

      const polls = of('poll').map((b) => {
        notify(b, byDefault(b))
        const d = b.card.data as { pollId: string; voted: string }
        const created = b.card.source.at ? new Date(b.card.source.at) : now
        const age = (now.getTime() - created.getTime()) / 86400_000
        return {
          key: b.card.key, priority: prio(b), id: d.pollId, chat_jid: b.ref.chatJid ?? null, chat: b.card.source.chat, from: b.ref.fromName ?? null, created: created.toISOString(),
          age_days: Math.round(age * 10) / 10, question: b.card.title.slice(0, 200), voted: Number(d.voted), state: b.card.state,
        }
      })

      const actions = of('task').map((b) => {
        notify(b, byDefault(b))
        return { key: b.card.key, priority: prio(b), id: b.ref.actionId ?? null, title: b.card.title.slice(0, 160), chat: b.card.source.chat, due_at: b.card.dueAt ? new Date(b.card.dueAt).toISOString() : null, state: b.card.state }
      })

      const known = new Set(['reminder', 'event', 'question', 'voice', 'poll', 'task'])
      const more = feed
        .filter((b) => !known.has(b.card.type))
        .slice(0, 30)
        .map((b) => {
          notify(b, false) // only when the owner marked it important
          return { key: b.card.key, type: b.card.type, priority: prio(b), title: b.card.title.slice(0, 160), chat: b.card.source.chat, due_at: b.card.dueAt ?? null, state: b.card.state }
        })

      // What the owner or the learned rules keep out of the feed, with the state the watch service knows
      const muted = rows
        .filter((r) => !/^(rule|learn):/.test(r.key))
        .flatMap((r) => {
          const s = resolve(r.key, rows)
          return s.state === 'dismissed' || s.state === 'snoozed' ? [{ key: r.key, kind: s.state, until: s.until?.toISOString(), note: s.note }] : []
        })
        .slice(0, 50)

      const out = { now: now.toISOString(), health, to_notify: toNotify, reminders, events, questions, polls, actions, more, muted }
      return { content: [{ type: 'text' as const, text: JSON.stringify(out) }] }
    },
  )
}
