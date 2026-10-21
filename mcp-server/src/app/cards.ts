// Cards for the app: derived live from SQL (question, voice, poll, event, conflict, reminder, task, digest, person)
// and merged with the organizer's rows in the `cards` table. Card keys are the watch service keys
// ("frage:<jid>:<ts>", "umfrage:<id>", "event:<id>:<stage>", "reminder:<id>", "aktion:<id>"), so dismissing or
// snoozing in the app and via Claude (watch_feedback) is the same thing.
import {
  CARD_GROUP, type Card, type CardAction, type CardGroup, type CardState, type CardType, type Person, type Stat, type Suggestion, type Urgency,
} from '@jarvis/contract'
import { loadPollResults, memDb, pool } from '../db.js'
import { OWNER } from '../config.js'
import { runJob, type Outcome } from '../outbox.js'
import {
  createReminder, loadWatchState, POLL_RENOTIFY_MS, priorityOf, resolveState, setReminderStatus, setWatchFeedback, snoozeReminder,
} from '../watch.js'
import { berlinParts, initials, tomorrowMorning, when } from './fmt.js'
import { fail, type Lang } from './http.js'

/** Where a card points to, for act and suggest. Not sent to the app. */
export interface CardRef {
  chatJid?: string
  messageId?: string
  reminderId?: number
  actionId?: number
  storedId?: number
  /** watch_state renotify window (polls) */
  renotifyMs?: number
}
export interface Built {
  card: Card
  ref: CardRef
  /** for sorting */
  at: number
}

const S = {
  de: {
    later: 'Später', unimportant: 'Unwichtig', done: 'Erledigt', remindMe: 'Erinnere mich', in1h: 'In 1 Std.', in3h: 'In 3 Std.', tomorrow: 'Morgen früh',
    waiting: 'Wartet seit', relation: 'Beziehung', closeness: 'Nähe', voice: 'Sprachnachricht', asks: (n: string) => `${n} fragt etwas.`,
    voiceSay: (n: string, s: number) => `${n} hat dir ${s ? `${Math.round(s)} Sekunden` : 'etwas'} aufgesprochen.`,
    pollSay: (c: string) => `In ${c} läuft eine Umfrage, du hast noch nicht abgestimmt.`,
    eventSay: (t: string, w: string) => `${t}, ${w}.`, conflictSay: 'Zwei Termine liegen dicht beieinander.',
    reminderSay: (t: string) => `Erinnerung: ${t}`, taskSay: (t: string) => `Offen: ${t}`, digestSay: (c: string, n: number) => `In ${c} sind ${n} neue Nachrichten.`,
    personSay: (n: string, w: string) => `Mit ${n} hattest du zuletzt ${w} Kontakt.`, conflict: 'Terminüberschneidung', people: 'Personen', chats: 'Chats',
    lastContact: 'Letzter Kontakt', messages: 'Nachrichten', reminder: 'Erinnerung', task: 'Aufgabe',
  },
  en: {
    later: 'Later', unimportant: 'Not important', done: 'Done', remindMe: 'Remind me', in1h: 'In 1 h', in3h: 'In 3 h', tomorrow: 'Tomorrow morning',
    waiting: 'Waiting since', relation: 'Relationship', closeness: 'Closeness', voice: 'Voice message', asks: (n: string) => `${n} is asking something.`,
    voiceSay: (n: string, s: number) => `${n} sent you ${s ? `${Math.round(s)} seconds of audio` : 'a voice message'}.`,
    pollSay: (c: string) => `There is a poll in ${c} and you have not voted yet.`,
    eventSay: (t: string, w: string) => `${t}, ${w}.`, conflictSay: 'Two events are close together.',
    reminderSay: (t: string) => `Reminder: ${t}`, taskSay: (t: string) => `Open: ${t}`, digestSay: (c: string, n: number) => `${n} new messages in ${c}.`,
    personSay: (n: string, w: string) => `Your last contact with ${n} was ${w}.`, conflict: 'Overlapping events', people: 'People', chats: 'Chats',
    lastContact: 'Last contact', messages: 'Messages', reminder: 'Reminder', task: 'Task',
  },
}

const REL: Record<string, { de: string; en: string }> = {
  family: { de: 'Familie', en: 'Family' }, partner: { de: 'Partner/in', en: 'Partner' }, close_friend: { de: 'enge/r Freund/in', en: 'Close friend' },
  friend: { de: 'Freund/in', en: 'Friend' }, acquaintance: { de: 'Bekannte/r', en: 'Acquaintance' }, colleague: { de: 'Arbeit/Schule', en: 'Colleague' },
  community: { de: 'Verein/Gemeinde', en: 'Club' }, club: { de: 'Verein/Gemeinde', en: 'Club' }, service: { de: 'Dienstleister', en: 'Service' }, other: { de: 'Sonstige', en: 'Other' },
}
export const relLabel = (r: string | null | undefined, l: Lang) => (r ? REL[r]?.[l] ?? r : undefined)

const cut = (s: string | null | undefined, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const person = (name: string, jid?: string): Person => ({ name, initials: initials(name), ...(jid ? { jid } : {}) })
const iso = (d: Date) => d.toISOString()

function laterSuggestions(l: Lang, now: Date): Suggestion[] {
  const t = S[l]
  return [
    { id: 'snooze-3h', label: t.in3h, action: { kind: 'snooze', until: iso(new Date(now.getTime() + 3 * 3600_000)) } },
    { id: 'snooze-tomorrow', label: t.tomorrow, action: { kind: 'snooze', until: iso(tomorrowMorning(now)) } },
    { id: 'dismiss', label: t.unimportant, action: { kind: 'dismiss' } },
  ]
}

function base<T extends CardType>(type: T, key: string, o: { urgency: Urgency; state: CardState; title: string; chat: string; chatJid?: string; at?: Date; dueAt?: Date; whenText?: string; say: string; context?: string; suggestions: Suggestion[]; group?: CardGroup }, l: Lang, now: Date) {
  return {
    key, type, group: o.group ?? CARD_GROUP[type], urgency: o.urgency, ...(o.dueAt ? { dueAt: iso(o.dueAt) } : {}), state: o.state, title: o.title,
    source: { chat: o.chat, ...(o.chatJid ? { chatJid: o.chatJid } : {}), when: o.whenText ?? (o.at ? when(o.at, l, now) : ''), ...(o.at ? { at: iso(o.at) } : {}) },
    say: o.say, ...(o.context ? { context: o.context } : {}), suggestions: o.suggestions,
  }
}

const q = <R extends Record<string, any>>(text: string, params: unknown[] = []) => pool.query<R>(text, params).then((r) => r.rows).catch((e) => {
  console.error('cards query failed:', e.message)
  return [] as R[]
})

/** All current cards, newest decisions first; dismissed and snoozed ones are filtered out. */
export async function listCards(l: Lang, now = new Date()): Promise<Built[]> {
  const t = S[l]
  const watch = await loadWatchState()
  const out: Built[] = []
  const visible = (key: string, renotifyMs?: number): CardState | null => {
    const r = resolveState(key, watch, { renotifyMs })
    return r.state === 'dismissed' || r.state === 'snoozed' ? null : r.state === 'notified' ? 'notified' : 'new'
  }
  const meta = Object.fromEntries((await q<{ key: string; value: string }>(`SELECT key, value FROM meta WHERE key IN ('self_jid','self_lid')`)).map((x) => [x.key, x.value]))

  // --- unanswered questions and voice messages in direct chats (same window as get_dashboard) ---
  const qs = await q<{ chat_jid: string; chat_name: string; id: string; ts: Date; type: string; body: string | null; relationship: string | null; closeness: number | null; seconds: string | null; n90: number | null }>(
    `WITH last AS (
       SELECT DISTINCT ON (chat_jid) chat_jid, chat_name, from_me, ts, type, id, left(body, 400) AS body
       FROM v_messages WHERE NOT chat_is_group AND deleted_at IS NULL AND type NOT IN ('reaction','sticker')
       ORDER BY chat_jid, ts DESC)
     SELECT l.chat_jid, l.chat_name, l.id, l.ts, l.type, l.body, p.relationship, p.closeness,
            m.media_meta->>'seconds' AS seconds, (p.stats->>'last_90_days')::int AS n90
     FROM last l LEFT JOIN contact_profiles p ON p.jid = l.chat_jid LEFT JOIN messages m ON m.chat_jid = l.chat_jid AND m.id = l.id
     WHERE NOT l.from_me AND l.ts BETWEEN now() - interval '4 days' AND now() - interval '2 hours'
       AND (l.body LIKE '%?%' OR l.type = 'audio')
     ORDER BY coalesce(p.closeness, 0) DESC, l.ts DESC LIMIT 15`,
  )
  for (const x of qs) {
    const ts = new Date(x.ts)
    const key = `frage:${x.chat_jid}:${Math.floor(ts.getTime() / 1000)}`
    const state = visible(key)
    if (!state) continue
    const p = person(x.chat_name, x.chat_jid)
    const ageH = (now.getTime() - ts.getTime()) / 3600_000
    const urgency: Urgency = (x.closeness ?? 0) >= 4 && ageH > 6 ? 3 : 2
    const stats: Stat[] = [{ label: t.waiting, value: when(ts, l, now) }]
    if (x.relationship) stats.push({ label: t.relation, value: relLabel(x.relationship, l)! })
    if (x.closeness) stats.push({ label: t.closeness, value: `${x.closeness}/5` })
    const common = { urgency, state, chat: x.chat_name, chatJid: x.chat_jid, at: ts, suggestions: laterSuggestions(l, now) }
    const ref = { chatJid: x.chat_jid, messageId: x.id }
    if (x.type === 'audio') {
      const sec = Number(x.seconds ?? 0)
      out.push({ at: ts.getTime(), ref, card: { ...base('voice', key, { ...common, title: t.voice, say: t.voiceSay(x.chat_name, sec) }, l, now), data: { person: p, durationSec: sec, summary: cut(x.body, 160), ...(x.body ? { transcript: x.body } : {}), stats } } })
    } else {
      out.push({ at: ts.getTime(), ref, card: { ...base('question', key, { ...common, title: cut(x.body, 80), say: t.asks(x.chat_name) }, l, now), data: { person: p, quote: cut(x.body, 400), waitingSince: iso(ts), stats } } })
    }
  }

  // --- open polls without the owner's vote ---
  const self = [meta.self_jid, meta.self_lid].filter(Boolean)
  const polls = await q<{ id: string; chat_jid: string; chat_name: string; sender_name: string; ts: Date; question: string | null; type: string }>(
    `SELECT v.id, v.chat_jid, v.chat_name, v.sender_name, v.ts, v.type,
            coalesce(m.raw->'message'->'pollCreationMessageV3'->>'name', m.raw->'message'->'pollCreationMessageV2'->>'name', m.raw->'message'->'pollCreationMessage'->>'name', v.body) AS question
     FROM v_messages v JOIN messages m ON m.chat_jid = v.chat_jid AND m.id = v.id
     WHERE v.type = 'poll' AND NOT v.from_me AND v.ts > now() - interval '14 days'
       AND NOT EXISTS (SELECT 1 FROM poll_votes pv WHERE pv.chat_jid = v.chat_jid AND pv.poll_msg_id = v.id AND pv.voter_jid = ANY($1::text[]))
     ORDER BY v.ts DESC LIMIT 10`,
    [self],
  )
  const results = await loadPollResults(polls)
  for (const x of polls) {
    const key = `umfrage:${x.id}`
    const state = visible(key, POLL_RENOTIFY_MS)
    if (!state) continue
    const ts = new Date(x.ts)
    const res = results.get(`${x.chat_jid}\u0000${x.id}`)
    const opts = (res?.options ?? []).map((o) => ({ label: o.name, votes: o.voters.length }))
    const top = opts.reduce((a, b) => (b.votes > (a?.votes ?? -1) ? b : a), undefined as (typeof opts)[number] | undefined)
    const options = opts.map((o) => ({ ...o, ...(top && top.votes > 0 && o === top ? { recommended: true } : {}) }))
    const suggestions: Suggestion[] = options.slice(0, 4).map((o, i) => ({ id: `vote-${i}`, label: o.label, action: { kind: 'vote', option: o.label, pollId: x.id }, ...(o.recommended ? { primary: true } : {}) }))
    suggestions.push(laterSuggestions(l, now)[2])
    const ageD = (now.getTime() - ts.getTime()) / 86400_000
    out.push({ at: ts.getTime(), ref: { chatJid: x.chat_jid, messageId: x.id, renotifyMs: POLL_RENOTIFY_MS }, card: { ...base('poll', key, { urgency: ageD < 1 ? 2 : 1, state, title: cut(x.question, 120), chat: x.chat_name, chatJid: x.chat_jid, at: ts, say: t.pollSay(x.chat_name), suggestions }, l, now), data: { pollId: x.id, voted: String(res?.voted ?? 0), options } } })
  }

  // --- events (next 3 days, same stages as the watch service) and conflicts (next 7 days) ---
  const evs = await q<{ id: number; title: string; summary: string | null; event_at: Date; facts: any; chat_count: number }>(
    `SELECT id, title, summary, event_at, facts, chat_count FROM topics
     WHERE status = 'open' AND event_at BETWEEN now() - interval '2 hours' AND now() + interval '7 days' ORDER BY event_at LIMIT 30`,
  )
  for (const x of evs) {
    const at = new Date(x.event_at)
    const h = (at.getTime() - now.getTime()) / 3600_000
    if (h > 72) continue
    const stage = h <= 3.5 ? 'kurz' : h >= 12 && h <= 30 ? 'vortag' : 'info'
    const key = `event:${x.id}:${stage}`
    const state = visible(key)
    if (!state) continue
    const ppl = (x.facts?.people ?? []) as { name: string; state: string }[]
    const yes = ppl.filter((p) => p.state === 'yes')
    const p = berlinParts(at, l)
    const stats: Stat[] = [{ label: t.people, value: String(ppl.length) }, { label: t.chats, value: String(x.chat_count ?? 1) }]
    const remindAt = new Date(Math.max(now.getTime() + 5 * 60_000, at.getTime() - 2 * 3600_000))
    out.push({
      at: at.getTime(), ref: {},
      card: {
        ...base('event', key, {
          urgency: h <= 3.5 ? 3 : h <= 30 ? 2 : 1, dueAt: at, state, title: x.title, chat: x.chat_count > 1 ? `${x.chat_count} ${t.chats}` : 'WhatsApp', at, whenText: when(at, l, now),
          say: t.eventSay(x.title, when(at, l, now)), context: cut(x.summary, 220) || undefined,
          suggestions: [{ id: 'remind', label: t.remindMe, action: { kind: 'remind', at: iso(remindAt), text: x.title }, primary: true }, laterSuggestions(l, now)[2]],
        }, l, now),
        data: { day: p.day, weekday: p.weekday, month: p.month, time: p.time, ...(x.facts?.place ? { place: String(x.facts.place) } : {}), attendees: yes.slice(0, 8).map((y) => person(y.name)), yes: yes.length, stats },
      },
    })
  }
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j]
      const ta = new Date(a.event_at).getTime(), tb = new Date(b.event_at).getTime()
      if (Math.abs(tb - ta) >= 2 * 3600_000 || tb < now.getTime()) continue
      const key = `konflikt:${a.id}:${b.id}`
      const state = visible(key)
      if (!state) continue
      const hour = (ms: number) => { const p = berlinParts(new Date(ms), 'en'); return p.hour + p.minute / 60 }
      const slots = [a, b].map((e) => ({ label: e.title, from: hour(new Date(e.event_at).getTime()), to: Math.min(24, hour(new Date(e.event_at).getTime()) + 2), group: 'schedule' as const }))
      const axis: [number, number] = [Math.max(0, Math.floor(Math.min(...slots.map((s) => s.from))) - 1), Math.min(24, Math.ceil(Math.max(...slots.map((s) => s.to))) + 1)]
      out.push({ at: ta, ref: {}, card: { ...base('conflict', key, { urgency: 3, dueAt: new Date(ta), state, title: `${a.title} / ${b.title}`, chat: t.conflict, at: new Date(ta), whenText: when(new Date(ta), l, now), say: t.conflictSay, suggestions: laterSuggestions(l, now) }, l, now), data: { axis, slots, stats: [] } } })
    }
  }

  // --- reminders (open and fired, next 7 days; same states as get_dashboard) ---
  const rem = await q<{ id: number; text: string; due_at: Date; status: string; ref: string | null }>(
    `SELECT id, text, due_at, status, ref FROM reminders WHERE status IN ('open','fired') AND due_at <= now() + interval '7 days' ORDER BY due_at LIMIT 20`,
  )
  for (const x of rem) {
    const due = new Date(x.due_at)
    const key = `reminder:${x.id}`
    const state: CardState = x.status === 'fired' ? 'notified' : due <= now ? 'new' : 'scheduled'
    const minsLeft = (due.getTime() - now.getTime()) / 60_000
    const snoozeOptions = [
      { label: t.in1h, until: iso(new Date(now.getTime() + 3600_000)) },
      { label: t.in3h, until: iso(new Date(now.getTime() + 3 * 3600_000)) },
      { label: t.tomorrow, until: iso(tomorrowMorning(now)) },
    ]
    out.push({
      at: due.getTime(), ref: { reminderId: Number(x.id) },
      card: {
        ...base('reminder', key, {
          urgency: minsLeft <= 0 ? 3 : minsLeft <= 120 ? 2 : 1, dueAt: due, state, title: x.text, chat: t.reminder, at: due, whenText: when(due, l, now), say: t.reminderSay(x.text),
          suggestions: [{ id: 'done', label: t.done, action: { kind: 'done' }, primary: true }, { id: 'snooze-1h', label: t.in1h, action: { kind: 'snooze', until: snoozeOptions[0].until } }, { id: 'snooze-tomorrow', label: t.tomorrow, action: { kind: 'snooze', until: snoozeOptions[2].until } }],
        }, l, now),
        data: { time: berlinParts(due, l).time, ...(x.ref ? { note: x.ref } : {}), snoozeOptions },
      },
    })
  }

  // --- suggested actions (organizer) ---
  const acts = await q<{ id: number; title: string; detail: string | null; due_at: Date | null; created_at: Date }>(
    `SELECT id, title, detail, due_at, created_at FROM suggested_actions
     WHERE status = 'open' AND (due_at BETWEEN now() - interval '1 day' AND now() + interval '7 days' OR (due_at IS NULL AND created_at > now() - interval '7 days'))
     ORDER BY due_at NULLS LAST, created_at DESC LIMIT 15`,
  )
  for (const x of acts) {
    const key = `aktion:${x.id}`
    const state = visible(key)
    if (!state) continue
    const due = x.due_at ? new Date(x.due_at) : null
    const daysLeft = due ? Math.ceil((due.getTime() - now.getTime()) / 86400_000) : undefined
    out.push({
      at: (due ?? new Date(x.created_at)).getTime(), ref: { actionId: Number(x.id) },
      card: {
        ...base('task', key, {
          urgency: daysLeft !== undefined && daysLeft <= 1 ? 2 : 1, ...(due ? { dueAt: due } : {}), state, title: cut(x.title, 120), chat: t.task, at: due ?? new Date(x.created_at), say: t.taskSay(cut(x.title, 120)),
          suggestions: [{ id: 'done', label: t.done, action: { kind: 'done' }, primary: true }, ...laterSuggestions(l, now)],
        }, l, now),
        data: { ...(x.detail ? { note: cut(x.detail, 300) } : {}), ...(due ? { dueAt: iso(due), daysLeft } : {}) },
      },
    })
  }

  // --- digest: busy group chats of the last 24 hours with their open threads ---
  const busy = await q<{ chat_jid: string; chat_name: string; n: number; last: Date }>(
    `SELECT chat_jid, max(chat_name) AS chat_name, count(*)::int AS n, max(ts) AS last FROM v_messages
     WHERE chat_is_group AND NOT from_me AND ts > now() - interval '24 hours' AND type NOT IN ('reaction')
     GROUP BY chat_jid HAVING count(*) >= 15 ORDER BY count(*) DESC LIMIT 5`,
  )
  const day = berlinParts(now, 'en').date
  for (const x of busy) {
    const key = `digest:${x.chat_jid}:${day}`
    const state = visible(key)
    if (!state) continue
    const th = await q<{ title: string }>(`SELECT title FROM threads WHERE chat_jid = $1 AND ended_at > now() - interval '2 days' ORDER BY ended_at DESC LIMIT 4`, [x.chat_jid])
    const last = new Date(x.last)
    out.push({ at: last.getTime(), ref: { chatJid: x.chat_jid }, card: { ...base('digest', key, { urgency: 1, state, title: x.chat_name, chat: x.chat_name, chatJid: x.chat_jid, at: last, say: t.digestSay(x.chat_name, Number(x.n)), suggestions: [{ id: 'done', label: t.done, action: { kind: 'done' }, primary: true }] }, l, now), data: { unread: Number(x.n), bullets: th.map((y) => y.title) } } })
  }

  // --- people to keep in touch with: close, but no contact for three weeks ---
  const ppl = await q<{ jid: string; name: string; relationship: string | null; closeness: number; last: Date | null; messages: number | null }>(
    `SELECT p.jid, coalesce(c.name, p.real_name, p.jid) AS name, p.relationship, p.closeness, c.last_message_at AS last, (p.stats->>'messages')::int AS messages
     FROM contact_profiles p JOIN v_chats c ON c.jid = p.jid AND NOT c.is_group
     WHERE p.closeness >= 4 AND p.relationship IN ('family','partner','close_friend','friend') AND c.last_message_at < now() - interval '21 days'
     ORDER BY p.closeness DESC, c.last_message_at LIMIT 5`,
  )
  for (const x of ppl) {
    const key = `person:${x.jid}`
    const state = visible(key)
    if (!state) continue
    const last = x.last ? new Date(x.last) : null
    const facts: Stat[] = [{ label: t.relation, value: relLabel(x.relationship, l) ?? '-' }, { label: t.closeness, value: `${x.closeness}/5` }]
    if (x.messages) facts.push({ label: t.messages, value: String(x.messages) })
    const lastText = last ? when(last, l, now) : '-'
    out.push({ at: last?.getTime() ?? 0, ref: { chatJid: x.jid }, card: { ...base('person', key, { urgency: 1, state, title: x.name, chat: x.name, chatJid: x.jid, ...(last ? { at: last } : {}), say: t.personSay(x.name, lastText), suggestions: laterSuggestions(l, now) }, l, now), data: { person: person(x.name, x.jid), facts, lastContact: lastText } } })
  }

  // --- organizer cards (cards table) ---
  const stored = await q<{ id: number; type: CardType; key: string; payload: any; due_at: Date | null; chat_jid: string | null; created_at: Date }>(
    `SELECT id, type, key, payload, due_at, chat_jid, created_at FROM cards
     WHERE status = 'open' AND (due_at IS NULL OR due_at > now() - interval '2 days') ORDER BY coalesce(due_at, created_at) DESC LIMIT 60`,
  )
  for (const x of stored) {
    const p = x.payload ?? {}
    if (!p.title || !p.source || !(x.type in CARD_GROUP)) continue
    const state = visible(x.key)
    if (!state) continue
    const card = {
      ...p, key: x.key, type: x.type, group: p.group ?? CARD_GROUP[x.type], urgency: ([1, 2, 3].includes(p.urgency) ? p.urgency : 1) as Urgency,
      ...(x.due_at ? { dueAt: iso(new Date(x.due_at)) } : {}),
      state: p.state === 'scheduled' ? 'scheduled' : state, suggestions: Array.isArray(p.suggestions) ? p.suggestions : [], say: p.say ?? '', data: p.data ?? {},
    } as Card
    out.push({ at: new Date(x.due_at ?? x.created_at).getTime(), ref: { storedId: Number(x.id), ...(x.chat_jid ? { chatJid: x.chat_jid } : {}) }, card })
  }

  // The owner's own importance (watch_state.priority) beats Jarvis' guess.
  for (const b of out) {
    const p = priorityOf(b.card.key, watch)
    if (p) b.card.urgency = p
  }
  // Importance first, then the nearest deadline, then the newest.
  const due = (b: Built) => (b.card.dueAt ? new Date(b.card.dueAt).getTime() : Infinity)
  return out.sort((a, b) => b.card.urgency - a.card.urgency || due(a) - due(b) || b.at - a.at)
}

export function countCards(cards: Built[]): Record<CardGroup | 'all', number> {
  const c = { all: cards.length, reply: 0, schedule: 0, todo: 0, know: 0 }
  for (const b of cards) c[b.card.group]++
  return c
}

export async function findCard(key: string, l: Lang): Promise<Built> {
  const b = (await listCards(l)).find((x) => x.card.key === key)
  if (!b) throw fail('not_found', 'No such card (done, dismissed or snoozed already)')
  return b
}

// --- act ---------------------------------------------------------------------------------------------

export interface ActResult {
  message: string
  removed: boolean
}

function outcome(o: Outcome, l: Lang, okText: string): ActResult {
  const de = l === 'de'
  switch (o.status) {
    case 'done': return { message: okText, removed: true }
    case 'failed': throw fail('internal', de ? `Fehlgeschlagen: ${o.error}` : `Failed: ${o.error}`)
    case 'limit': throw fail('rate_limited', de ? 'Stundenlimit für Aktionen erreicht.' : 'Hourly action limit reached.')
    case 'offline': throw fail('unavailable', de ? 'WhatsApp ist gerade nicht verbunden. Nichts wurde gesendet.' : 'WhatsApp is not connected right now. Nothing was sent.')
    case 'cancelled': throw fail('unavailable', de ? 'Zeitüberschreitung, nichts wurde gesendet. Erneut versuchen ist gefahrlos.' : 'Timed out, nothing was sent. Retrying is safe.')
    default: throw fail('unavailable', de ? 'Wird gerade ausgeführt, Ergebnis noch unklar. Nicht erneut senden.' : 'Still running, result unclear. Do not send again.')
  }
}

const parseUntil = (s: unknown, field: string): Date => {
  const d = new Date(String(s ?? ''))
  if (Number.isNaN(d.getTime())) throw fail('invalid', `${field} must be an ISO timestamp`, { [field]: 'ISO 8601' })
  if (d.getTime() < Date.now() - 60_000) throw fail('invalid', `${field} is in the past`, { [field]: 'in the past' })
  return d
}

/**
 * Execute a card action. Writes with the same semantics as the MCP tools:
 * done/dismiss/snooze -> watch_state (watch_feedback), reminders (update_reminder), suggested_actions (set_action_status),
 * cards.status for organizer cards; send/react/vote -> outbox (send_message, react_to_message, vote_in_poll).
 */
export async function act(b: Built, a: CardAction, l: Lang): Promise<ActResult> {
  const de = l === 'de'
  const { card, ref } = b
  const key = card.key
  switch (a?.kind) {
    case 'done': {
      if (ref.reminderId != null) await setReminderStatus(ref.reminderId, 'done')
      else if (ref.actionId != null) await memDb.query(`UPDATE suggested_actions SET status = 'done' WHERE id = $1`, [ref.actionId])
      else if (ref.storedId != null) await memDb.query(`UPDATE cards SET status = 'done', updated_at = now() WHERE id = $1`, [ref.storedId])
      else await setWatchFeedback(key, 'dismiss', { note: `${OWNER}: schon erledigt (App)` })
      return { message: de ? 'Erledigt.' : 'Done.', removed: true }
    }
    case 'dismiss': {
      if (ref.reminderId != null) await setReminderStatus(ref.reminderId, 'cancelled')
      else if (ref.actionId != null) await memDb.query(`UPDATE suggested_actions SET status = 'dismissed' WHERE id = $1`, [ref.actionId])
      else if (ref.storedId != null) await memDb.query(`UPDATE cards SET status = 'dismissed', updated_at = now() WHERE id = $1`, [ref.storedId])
      else await setWatchFeedback(key, 'dismiss', { note: `${OWNER}: unwichtig (App)` })
      return { message: de ? 'Wird nicht mehr angezeigt.' : 'Will not be shown again.', removed: true }
    }
    case 'snooze': {
      const until = parseUntil(a.until, 'until')
      if (ref.reminderId != null) await snoozeReminder(ref.reminderId, until)
      else await setWatchFeedback(key, 'snooze', { until })
      return { message: de ? `Zurückgestellt bis ${when(until, l)}.` : `Snoozed until ${when(until, l)}.`, removed: ref.reminderId == null }
    }
    case 'remind': {
      const at = parseUntil(a.at, 'at')
      const text = String(a.text ?? '').trim().slice(0, 400) || card.title
      await createReminder(text, at, key)
      return { message: de ? `Erinnerung gesetzt: ${when(at, l)}.` : `Reminder set: ${when(at, l)}.`, removed: false }
    }
    case 'send': {
      const text = String(a.text ?? '').trim()
      if (!text || text.length > 4000) throw fail('invalid', 'text must have 1 to 4000 characters', { text: '1-4000 characters' })
      if (!ref.chatJid) throw fail('invalid', 'This card has no chat to reply to')
      const r = outcome(await runJob('send_text', ref.chatJid, { text, mentions: [] }), l, de ? 'Gesendet.' : 'Sent.')
      return r
    }
    case 'react': {
      if (!ref.chatJid) throw fail('invalid', 'This card has no chat')
      const messageId = String(a.messageId ?? ref.messageId ?? '')
      const emoji = String(a.emoji ?? '')
      if (!messageId || [...emoji].length > 8) throw fail('invalid', 'messageId and a short emoji are required')
      return outcome(await runJob('react', ref.chatJid, { message_id: messageId, emoji }), l, de ? 'Reagiert.' : 'Reacted.')
    }
    case 'vote': {
      if (card.type !== 'poll' || !ref.chatJid) throw fail('invalid', 'Only poll cards can vote')
      const pollId = String(a.pollId ?? ref.messageId)
      if (pollId !== ref.messageId) throw fail('invalid', 'pollId does not belong to this card')
      const options = (card.data as { options: { label: string }[] }).options.map((o) => o.label)
      const option = options.find((o) => o.toLowerCase() === String(a.option ?? '').toLowerCase())
      if (!option) throw fail('invalid', 'Unknown poll option', { option: options.join(' | ') })
      return outcome(await runJob('vote', ref.chatJid, { poll_id: pollId, options: [option] }), l, de ? `Abgestimmt: ${option}.` : `Voted: ${option}.`)
    }
    case 'open':
    case 'save_contact':
      throw fail('invalid', `"${a.kind}" is handled by the app, not the server`)
    default:
      throw fail('invalid', 'Unknown action kind')
  }
}

