// Mock mode: serves the contract fixtures from memory so the whole app runs without a server.
// Turned on with EXPO_PUBLIC_JARVIS_MOCK=1 or the "try without a server" button on the connect screen.
import { FIXTURE_CARDS, FIXTURE_HOME, FIXTURE_MEMORIES, FIXTURE_PEOPLE } from '@jarvis/contract/fixtures'
import type { Card, CardGroup, Device, HomeResponse, LearnedRule, Memory, PersonDetail, PersonSummary, PreferencesResponse } from '@jarvis/contract'
import i18n from '@/i18n'
import type { JarvisApi } from './client'
import { JarvisError } from './http'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

export function createMockApi(): JarvisApi {
  let cards: Card[] = clone(FIXTURE_CARDS)
  const guesses = new Map<string, Card['urgency']>()
  let memories: Memory[] = clone(FIXTURE_MEMORIES)
  let nextMemoryId = 100
  let done = 12
  let messages = 214
  const people: PersonSummary[] = clone(FIXTURE_PEOPLE)
  const details = new Map<string, PersonDetail>()
  let learning = true
  let rules: LearnedRule[] = [
    { key: 'rule:chat:handball@g.us', kind: 'chat', target: 'handball@g.us', label: 'Handball Herren 2', priority: 1, hidden: false, source: 'learned', updatedAt: iso(30) },
  ]
  const prefs = (): PreferencesResponse => clone({ learning, rules })
  const started = Date.now()
  let devices: Device[] = [
    { id: 'd1', name: 'iPhone', platform: 'ios', kind: 'device', createdAt: iso(400), lastSeenAt: iso(0), current: true },
    { id: 'd2', name: 'Laptop', platform: 'web', kind: 'device', createdAt: iso(900), lastSeenAt: iso(30) },
    { id: 'o1', name: 'Claude', platform: 'mcp', kind: 'oauth', createdAt: iso(1500), lastSeenAt: iso(3) },
  ]

  const counts = (): HomeResponse['counts'] => {
    const by = (g: CardGroup) => cards.filter((c) => c.group === g).length
    return { all: cards.length, reply: by('reply'), schedule: by('schedule'), todo: by('todo'), know: by('know') }
  }

  const detail = (jid: string): PersonDetail => {
    const hit = details.get(jid)
    if (hit) return hit
    const p = people.find((x) => x.jid === jid)
    if (!p) throw new JarvisError('not_found', 'not found', 404)
    const d: PersonDetail = {
      ...p,
      realName: p.name === 'Mama' ? 'Petra Wagner' : undefined,
      aliases: p.name === 'Opa Heinz' ? ['Opa', 'Heinz'] : [],
      formality: 'du',
      tone: p.relationship === 'colleague' ? 'sachlich, freundlich' : 'herzlich, locker',
      note: undefined,
      locked: false,
      source: 'auto',
      stats: [
        { label: i18n.t('mock.stats.messages'), value: String(40 + p.name.length * 37) },
        { label: i18n.t('mock.stats.since'), value: '2019' },
        { label: i18n.t('mock.stats.open'), value: String(p.openCards) },
      ],
      memories: memories.filter((m) => m.contactJid === jid),
      recent: [
        { at: iso(2), fromMe: false, text: 'Kommst du Sonntag zum Essen? Oma ist auch da.' },
        { at: iso(26), fromMe: true, text: 'Klar, ich melde mich morgen!' },
        { at: iso(27), fromMe: false, text: 'Wie war dein Tag?' },
      ],
    }
    details.set(jid, d)
    return d
  }

  return {
    async home() {
      await wait(180)
      const pct = Math.round((done / (done + cards.length)) * 100)
      return {
        ...clone(FIXTURE_HOME),
        now: new Date().toISOString(),
        jarvis: { state: 'idle', say: cards[0] ? i18n.t('today.summary', { count: cards.length, title: cards[0].title }) : i18n.t('today.allDone') },
        stats: [
          { label: i18n.t('today.stats.open'), value: String(cards.length) },
          { label: i18n.t('today.stats.done'), value: `${pct}%` },
          { label: i18n.t('today.stats.messages'), value: String(messages) },
        ],
        counts: counts(),
      }
    },
    async cards(group) {
      await wait(220)
      return { cards: clone(group ? cards.filter((c) => c.group === group) : cards) }
    },
    async act(key, action) {
      await wait(260)
      const card = cards.find((c) => c.key === key)
      if (!card) throw new JarvisError('not_found', 'not found', 404)
      if (action.kind === 'attend') {
        if (card.type !== 'event') throw new JarvisError('invalid', 'Only event cards take an answer', 400)
        if (!action.going) {
          cards = cards.filter((c) => c.key !== key)
          return { ok: true, message: i18n.t('act.notGoing'), removed: true }
        }
        const stats = card.data.stats.map((x) => (x.label === 'Du' || x.label === 'You' ? { ...x, value: i18n.t('card.youGo') } : x))
        const next = { ...card, data: { ...card.data, going: 'yes' as const, stats }, suggestions: [{ id: 'noted', label: i18n.t('card.noted'), action: { kind: 'done' as const }, primary: true }, { id: 'not-going', label: i18n.t('card.notGoingAfterAll'), action: { kind: 'attend' as const, going: false } }] }
        cards = cards.map((c) => (c.key === key ? next : c))
        return { ok: true, message: i18n.t('act.going'), removed: false, card: clone(next) }
      }
      const removed = action.kind !== 'open'
      if (removed) {
        cards = cards.filter((c) => c.key !== key)
        if (action.kind !== 'dismiss') done += 1
      }
      const detailText = action.kind === 'react' ? action.emoji : action.kind === 'vote' ? action.option : ''
      return { ok: true, message: i18n.t(`act.${action.kind}`, { detail: detailText }), removed }
    },
    async setPriority(key, priority) {
      await wait(120)
      const i = cards.findIndex((c) => c.key === key)
      if (i < 0) throw new JarvisError('not_found', 'not found', 404)
      // In the mock the card keeps what Jarvis guessed in `guess`, so null can restore it.
      const c = cards[i]!
      const guess = guesses.get(key) ?? c.urgency
      guesses.set(key, guess)
      cards[i] = { ...c, urgency: priority ?? guess } as Card
      return { ok: true, priority }
    },
    async suggest(key) {
      await wait(600)
      return { suggestions: cards.find((c) => c.key === key)?.suggestions ?? [], cached: true }
    },
    async context(key) {
      await wait(250)
      const card = cards.find((c) => c.key === key)
      return {
        chat: card?.source.chat,
        summary: i18n.t('mock.contextSummary'),
        messages: [
          { who: 'Lena', fromMe: false, at: iso(30), text: 'Wer hilft Sonntag beim Umzug?' },
          { who: i18n.t('card.you'), fromMe: true, at: iso(29), text: 'Ich kann ab 14 Uhr.' },
          { who: 'Lena', fromMe: false, at: iso(4), text: card?.title ?? '', highlight: true },
        ],
      }
    },
    async media() {
      await wait(300)
      throw new JarvisError('unavailable', i18n.t('card.playUnavailable'), 503)
    },
    async preferences() {
      await wait(120)
      return prefs()
    },
    async setRule(r) {
      await wait(150)
      const key = `rule:${r.kind}:${r.target}`
      rules = rules.filter((x) => x.key !== key)
      if (r.priority !== null || r.hidden) rules.unshift({ key, kind: r.kind, target: r.target, label: r.target, ...(r.priority ? { priority: r.priority } : {}), hidden: r.hidden, source: 'user', updatedAt: iso(0) })
      return prefs()
    },
    async removeRule(key) {
      await wait(150)
      rules = rules.filter((x) => x.key !== key)
      return prefs()
    },
    async setLearning(enabled) {
      await wait(120)
      learning = enabled
      return prefs()
    },
    async forgetLearned() {
      await wait(150)
      rules = rules.filter((x) => x.source !== 'learned')
      return prefs()
    },
    async status() {
      await wait(150)
      // a simulated first hour after setup: every step catches up within two minutes
      const f = Math.min(1, (Date.now() - started) / 120_000)
      const step = (id: 'import' | 'transcripts' | 'images' | 'search' | 'organizer' | 'people', total: number, lag = 0) => {
        const done = Math.round(total * Math.max(0, Math.min(1, f * (1 + lag) - lag)))
        return { id, total, done, state: done >= total ? ('done' as const) : ('running' as const) }
      }
      const steps = [step('import', 100), step('transcripts', 48, 0.1), step('images', 120, 0.2), step('search', 4200, 0.3), step('organizer', 4200, 0.5), step('people', 60, 0.6)]
      return { busy: f < 1, messages: Math.round(4200 * Math.min(1, f * 1.5)), chats: 86, contacts: 140, named: Math.round(140 * Math.min(1, 0.4 + f)), steps, searchReady: true }
    },
    async resyncContacts() {
      await wait(1500)
      return { before: 96, after: 131 }
    },
    async people(q) {
      await wait(160)
      const needle = q?.trim().toLowerCase()
      return { people: clone(needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people) }
    },
    async person(jid) {
      await wait(200)
      return clone({ ...detail(jid), memories: memories.filter((m) => m.contactJid === jid) })
    },
    async patchPerson(jid, patch) {
      await wait(300)
      const d = { ...detail(jid), ...patch, source: 'user' as const }
      details.set(jid, d)
      const i = people.findIndex((p) => p.jid === jid)
      if (i >= 0) people[i] = { ...people[i]!, relationship: d.relationship, closeness: d.closeness }
      return clone({ ...d, memories: memories.filter((m) => m.contactJid === jid) })
    },
    async memories(q, scope) {
      await wait(160)
      const needle = q?.trim().toLowerCase()
      return { memories: clone(memories.filter((m) => (!scope || m.scope === scope) && (!needle || m.content.toLowerCase().includes(needle) || m.scopeLabel?.toLowerCase().includes(needle)))) }
    },
    async createMemory(m) {
      await wait(250)
      if (!m.content.trim()) throw new JarvisError('invalid', i18n.t('memory.errors.empty'), 400, { content: i18n.t('memory.errors.empty') })
      const label = m.contactJid ? people.find((p) => p.jid === m.contactJid)?.name : m.chatJid
      const mem: Memory = { id: nextMemoryId++, content: m.content.trim(), scope: m.scope, chatJid: m.chatJid, contactJid: m.contactJid, topicId: m.topicId, pinned: !!m.pinned, active: true, createdAt: iso(0), updatedAt: iso(0), scopeLabel: label }
      memories = [mem, ...memories]
      return clone(mem)
    },
    async patchMemory(id, patch) {
      await wait(200)
      const i = memories.findIndex((m) => m.id === id)
      if (i < 0) throw new JarvisError('not_found', 'not found', 404)
      const next = { ...memories[i]!, ...patch, updatedAt: iso(0) }
      if (patch.contactJid) next.scopeLabel = people.find((p) => p.jid === patch.contactJid)?.name
      memories[i] = next
      return clone(next)
    },
    async deleteMemory(id) {
      await wait(200)
      memories = memories.filter((m) => m.id !== id)
    },
    async devices() {
      await wait(150)
      return { devices: clone(devices) }
    },
    async revokeDevice(id) {
      await wait(200)
      devices = devices.filter((d) => d.id !== id)
    },
    async ask(req, onEvent, signal) {
      onEvent({ type: 'state', state: 'thinking' })
      await wait(900)
      if (signal?.aborted) return
      onEvent({ type: 'state', state: 'speaking' })
      const answer = i18n.t('mock.answer', { question: req.question })
      for (let i = 0; i < answer.length; i += 6) {
        if (signal?.aborted) return
        onEvent({ type: 'delta', text: answer.slice(i, i + 6) })
        await wait(30)
      }
      onEvent({ type: 'source', label: 'Abi 2019 · Grillen bei Lukas', at: iso(20) })
      onEvent({ type: 'source', label: 'WG Bremer Str. · Kino-Umfrage', at: iso(8) })
      onEvent({ type: 'source', label: 'Lena · Sprachnachricht', at: iso(4) })
      onEvent({ type: 'state', state: 'idle' })
      onEvent({ type: 'done', conversationId: req.conversationId ?? 'mock-1' })
    },
    live(onEvent) {
      const sources = ['WG Bremer Str.', 'Abi 2019', 'Mama', 'Projekt Nordlicht', 'Handball Herren 2']
      let timer: ReturnType<typeof setTimeout>
      const tick = () => {
        messages += 1
        onEvent({ type: 'message', source: sources[Math.floor(Math.random() * sources.length)]!, at: new Date().toISOString(), todayCount: messages })
        timer = setTimeout(tick, 3000 + Math.random() * 4000)
      }
      timer = setTimeout(tick, 2500)
      return () => clearTimeout(timer)
    },
  }
}
