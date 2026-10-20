// Mock mode: serves the contract fixtures from memory so the whole app runs without a server.
// Turned on with EXPO_PUBLIC_JARVIS_MOCK=1 or the "try without a server" button on the connect screen.
import { FIXTURE_CARDS, FIXTURE_HOME, FIXTURE_MEMORIES, FIXTURE_PEOPLE } from '@jarvis/contract/fixtures'
import type { Card, CardGroup, Device, HomeResponse, Memory, PersonDetail, PersonSummary } from '@jarvis/contract'
import i18n from '@/i18n'
import type { JarvisApi } from './client'
import { JarvisError } from './http'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

export function createMockApi(): JarvisApi {
  let cards: Card[] = clone(FIXTURE_CARDS)
  let memories: Memory[] = clone(FIXTURE_MEMORIES)
  let nextMemoryId = 100
  let done = 12
  let messages = 214
  const people: PersonSummary[] = clone(FIXTURE_PEOPLE)
  const details = new Map<string, PersonDetail>()
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
      const removed = action.kind !== 'open'
      if (removed) {
        cards = cards.filter((c) => c.key !== key)
        if (action.kind !== 'dismiss') done += 1
      }
      const detailText = action.kind === 'react' ? action.emoji : action.kind === 'vote' ? action.option : ''
      return { ok: true, message: i18n.t(`act.${action.kind}`, { detail: detailText }), removed }
    },
    async suggest(key) {
      await wait(600)
      return { suggestions: cards.find((c) => c.key === key)?.suggestions ?? [], cached: true }
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
