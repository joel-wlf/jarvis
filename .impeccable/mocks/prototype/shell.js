import { TYPES, GROUPS, ITEMS, LIVE_SOURCES, SAY } from './data.js'
import { h, svg, renderCard } from './cards.js'

const $ = (s) => document.querySelector(s)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const wide = () => matchMedia('(min-width: 1024px)').matches
const byUrgency = (a, b) => b.urgency - a.urgency
const state = { filter: 'all', sel: null, items: [...ITEMS].sort(byUrgency), done: 12 }

// ---------- Reiter und Karten ----------
const inGroup = (it, g) => g === 'all' || TYPES[it.type].group === g
function renderTabs() {
  const count = (g) => state.items.filter((i) => inGroup(i, g)).length
  const defs = [['all', 'Alle', 'var(--ink)'], ...Object.entries(GROUPS).map(([k, v]) => [k, v.label, v.color])]
  $('#tabs').replaceChildren(...defs.filter(([k]) => k === 'all' || count(k)).map(([k, label, c]) =>
    h('button', { class: 'tab', role: 'tab', 'aria-selected': String(state.filter === k), style: `--c:${c}`, onclick: () => { state.filter = k; renderTabs(); renderCards() } }, label, h('b', {}, String(count(k))))))
  $('#count').textContent = state.items.length
  renderStats()
}
function renderCards() {
  $('#cards').replaceChildren(...state.items.filter((i) => inGroup(i, state.filter)).map((it) => renderCard(it, { selected: state.sel === it.id, onSelect: select, act: done })))
}

// ---------- Jarvis-Figur ----------
const STATES = ['idle', 'listening', 'thinking', 'speaking', 'notify', 'happy', 'sleep', 'error']
const LABEL = { idle: 'Ruhe', listening: 'Hört zu', thinking: 'Denkt', speaking: 'Spricht', notify: 'Neu', happy: 'Erledigt', sleep: 'Nacht', error: 'Störung' }
const images = {}
let current = 'idle'
let revert = null
function loadImages() {
  for (const s of STATES) {
    const img = new Image()
    img.onload = () => { images[s] = img.src; setState(current, true) }
    img.src = `jarvis/${s}.png`
  }
}
function setState(s, force = false, ms = 0) {
  clearTimeout(revert)
  if (ms) revert = setTimeout(() => setState('idle'), ms)
  if (s === current && !force) return
  current = s
  $('#jarvis').dataset.state = s
  const src = images[s] ?? images.idle
  const body = $('#figure')
  if (src) {
    const prev = body.querySelector('img')
    if (prev?.getAttribute('src') === src) return
    const next = h('img', { src, alt: `Jarvis: ${LABEL[s]}`, class: 'in' })
    body.replaceChildren(...(prev ? [prev] : []), next)
    if (prev) { prev.classList.add('out'); setTimeout(() => prev.remove(), 500) }
  } else if (!body.querySelector('.pebble')) {
    body.replaceChildren(h('div', { class: 'pebble' }, h('div', { class: 'visor' }, h('i', { class: 'eye' }), h('i', { class: 'eye' }))), h('span', { class: 'ph' }, 'Platzhalter'))
  }
  for (const b of document.querySelectorAll('#states button')) b.setAttribute('aria-pressed', String(b.dataset.s === s))
}
$('#states').replaceChildren(...STATES.map((s) => h('button', { 'data-s': s, 'aria-pressed': String(s === 'idle'), onclick: () => setState(s) }, LABEL[s])))

// Untertitel: eine ruhige Zeile unter der Figur, keine Blase
let typer = 0
function voice(text, then) {
  const el = $('#voice')
  cancelAnimationFrame(typer)
  if (reduced) { el.textContent = text; return then?.() }
  let i = 0
  const step = () => { i += 2; el.textContent = text.slice(0, i); if (i < text.length) typer = requestAnimationFrame(step); else then?.() }
  step()
}

// ---------- Auswahl und Erledigen ----------
function select(id) {
  state.sel = state.sel === id && !wide() ? null : id
  for (const c of document.querySelectorAll('.card')) c.classList.toggle('sel', c.dataset.id === state.sel)
  const it = state.items.find((i) => i.id === state.sel)
  if (!it) return voice(summary())
  setState('speaking')
  voice(SAY[it.id] ?? it.title, () => setState(it.urgency >= 3 ? 'notify' : 'idle'))
}
function done(id, verb) {
  state.items = state.items.filter((i) => i.id !== id)
  state.done += 1
  if (state.sel === id) state.sel = null
  renderTabs()
  renderCards()
  toast(`${verb}.`)
  setState('happy', false, 1600)
  voice(state.items.length ? `${verb}. ${summary()}` : 'Alles erledigt. Ich melde mich, wenn etwas Neues kommt.')
}
function summary() {
  const top = state.items[0]
  if (!top) return 'Alles erledigt.'
  return `${state.items.length} Sachen sind offen. Am dringendsten: ${top.title}.`
}

// ---------- Kennzahlen und Module ----------
let msgCount = 214
function renderStats() {
  const pct = Math.round((state.done / (state.done + state.items.length)) * 100)
  $('#stats').replaceChildren(
    h('div', {}, h('dt', {}, 'Offen'), h('dd', {}, String(state.items.length))),
    h('div', {}, h('dt', {}, 'Erledigt'), h('dd', {}, `${pct}%`)),
    h('div', {}, h('dt', {}, 'Nachrichten'), h('dd', { id: 'msgCount' }, String(msgCount))))
}
function chart() {
  const inc = [38, 52, 44, 61, 47, 70, 58]
  const dn = [30, 41, 46, 40, 52, 49, 55]
  const W = 320
  const H = 80
  const pts = (arr) => arr.map((v, i) => [i * (W / 6), H - (v / 80) * H])
  const path = (arr) => pts(arr).reduce((d, [x, y], i, a) => (i ? `${d} C${(a[i - 1][0] + x) / 2} ${a[i - 1][1]} ${(a[i - 1][0] + x) / 2} ${y} ${x} ${y}` : `M${x} ${y}`), '')
  const [lx, ly] = pts(inc)[5]
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', `0 0 ${W} ${H}`)
  el.setAttribute('preserveAspectRatio', 'none')
  el.setAttribute('class', 'chart')
  el.innerHTML = `${[0.33, 0.66].map((f) => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" class="gl"/>`).join('')}<path d="${path(dn)}" class="s2"/><path d="${path(inc)}" class="s1"/><circle cx="${lx}" cy="${ly}" r="4" class="pt"/>`
  return el
}
function renderModules() {
  const days = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
  $('#modules').replaceChildren(
    h('section', { class: 'mod' },
      h('header', {}, h('h3', {}, 'Nachrichten-Verlauf'), h('p', {}, 'Eingegangen und erledigt, 7 Tage')),
      h('div', { class: 'chart-wrap' }, chart(), h('div', { class: 'tip' }, h('b', {}, '+18 %'), h('span', {}, 'zur Vorwoche'))),
      h('div', { class: 'days' }, days.map((d) => h('span', {}, d)))),
    h('section', { class: 'mod' },
      h('header', {}, h('h3', {}, 'Diese Woche'), h('p', {}, '20 Termine und Fristen')),
      h('div', { class: 'week' }, [2, 1, 3, 4, 3, 5, 2].map((n, i) => h('div', { class: i === 2 ? 'today' : '' }, h('i', { style: `height:${8 + n * 9}px` }), days[i])))),
    h('section', { class: 'mod' },
      h('header', {}, h('h3', {}, 'System'), h('p', {}, '7 Dienste laufen')),
      h('div', { class: 'feedline', id: 'feed' }, 'Zuletzt: WG Bremer Str.'),
      h('div', { class: 'svc' }, Array.from({ length: 7 }, () => h('i')))),
  )
}
function liveTick() {
  const src = LIVE_SOURCES[Math.floor(Math.random() * LIVE_SOURCES.length)]
  msgCount += 1
  const c = $('#msgCount')
  if (c) c.textContent = String(msgCount)
  $('#feed')?.replaceChildren(`Zuletzt: ${src}`)
  $('#live').textContent = `aktualisiert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  setTimeout(liveTick, 3000 + Math.random() * 4000)
}

// ---------- Frag Jarvis (Prototyp: feste Beispielantwort) ----------
$('#askInput').addEventListener('focus', () => setState('listening'))
$('#askInput').addEventListener('blur', () => current === 'listening' && setState('idle'))
$('#ask').addEventListener('submit', (e) => {
  e.preventDefault()
  if (!$('#askInput').value.trim()) return
  $('#askInput').value = ''
  $('#askInput').blur()
  setState('thinking')
  voice('…')
  if (!wide()) window.scrollTo({ top: 0, behavior: 'smooth' })
  setTimeout(() => {
    setState('speaking')
    voice('Samstag 15 Uhr Handball, ab 18 Uhr Grillen bei Lukas. Das WG-Kino um 21 Uhr überschneidet sich, Freitag 20 Uhr wäre frei. Sonntag 14 Uhr hilfst du Lena beim Umzug.', () => setState('idle'))
  }, 1100)
})

function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, svg('<path d="m5 12 5 5 9-10"/>'), msg)
  document.body.append(t)
  setTimeout(() => t.remove(), 2200)
}

// ---------- Start ----------
setState('idle', true)
loadImages()
renderTabs()
renderCards()
renderModules()
if (wide()) select(state.items[0].id)
else voice(summary())
setTimeout(liveTick, 2500)
