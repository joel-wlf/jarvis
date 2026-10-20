// Kartentypen im Aufbau der Referenz: Kopf (Titel, Untertitel, Marke), schlanke Mitte je Typ,
// Mikro-Kennzahlen, schwarzer Aktionsbalken, Werkzeugspalte rechts.
import { TYPES } from './data.js'

export const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style') el.style.cssText = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(c))
  return el
}
export const svg = (inner, cls = '') => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  if (cls) s.setAttribute('class', cls)
  s.innerHTML = inner
  return s
}
export const ICON = {
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cal: '<rect x="4" y="5" width="16" height="15"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
}

const mapSvg = (inner) => { const m = svg(inner, 'map'); m.setAttribute('viewBox', '0 0 200 60'); m.setAttribute('preserveAspectRatio', 'none'); return m }
const stop = (fn) => (e) => { e.stopPropagation(); fn() }

// Bausteine
const headOf = (it, sub) => h('header', { class: 'c-head' },
  h('div', {}, h('span', { class: 'mark' }, TYPES[it.type].label), h('h2', {}, it.title), h('p', { class: 'sub' }, sub ?? `${it.chat} · ${it.when}`)))
const meta = (pairs) => h('dl', { class: 'meta' }, pairs.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))))
const route = (a, aSub, b, bSub, icon = ICON.chat) => h('div', { class: 'route' },
  h('div', {}, h('b', {}, a), h('small', {}, aSub)),
  h('div', { class: 'line' }, h('i'), svg(icon), h('i')),
  h('div', { class: 'r' }, h('b', {}, b), h('small', {}, bSub)))
const slab = (big, btn, onclick) => h('div', { class: 'slab' }, h('span', {}, big), h('button', { onclick: stop(onclick) }, btn))
const quote = (text) => h('p', { class: 'quote' }, text)

function wave(seed) {
  let s = seed
  const bars = Array.from({ length: 48 }, () => { s = (s * 9301 + 49297) % 233280; return 0.2 + (s / 233280) * 0.8 })
  return h('div', { class: 'wave', 'aria-hidden': 'true' }, bars.map((v, i) => h('i', { class: i < 16 ? 'on' : '', style: `height:${Math.round(v * 100)}%` })))
}

const R = {
  frage: (it, act) => [headOf(it),
    route(it.person, 'heute 18:42', 'Antwort', 'bis Fr'),
    quote(it.quote),
    meta([['Wartet', '2 Std.'], ['Chat', 'Einzel'], ['Vorschläge', String(it.replies.length)]]),
    slab('3 Antworten bereit', 'Antworten', () => act(it.id, 'Gesendet'))],

  sprach: (it, act) => [headOf(it, `${it.person} · ${it.when}`),
    h('div', { class: 'vmsg' }, h('button', { class: 'play', 'aria-label': 'Abspielen', onclick: stop(() => {}) }, svg(ICON.play)), wave(7), h('span', {}, '0:48')),
    quote(it.summary),
    meta([['Dauer', '0:48'], ['Thema', 'Umzug'], ['Frage', '1']]),
    slab('Antwort vorbereitet', 'Antworten', () => act(it.id, 'Gesendet'))],

  reaktion: (it, act) => [headOf(it, `${it.chat} · ${it.when}`),
    h('div', { class: 'emojis', role: 'group', 'aria-label': 'Reaktion senden' }, it.emojis.map((e) => h('button', { 'aria-label': `Mit ${e} reagieren`, onclick: stop(() => act(it.id, `Reagiert mit ${e}`)) }, e)))],

  termin: (it, act) => [headOf(it),
    h('div', { class: 'datebig' }, h('b', {}, it.day), h('div', {}, h('span', {}, `${it.dow} · ${it.month}`), h('small', {}, it.place))),
    meta([['Beginn', '18:00'], ['Dabei', String(it.yes)], ['Du', 'offen']]),
    slab('Sa 18:00', 'Zusagen', () => act(it.id, 'Zugesagt'))],

  konflikt: (it, act) => {
    const [a, b] = it.axis
    const pct = (v) => ((v - a) / (b - a)) * 100
    const ov = [Math.max(it.slots[0].from, it.slots[1].from), Math.min(it.slots[0].to, it.slots[1].to)]
    return [headOf(it, 'Samstag · 2 Termine'),
      h('div', { class: 'tl' },
        h('div', { class: 'ticks' }, Array.from({ length: (b - a) / 2 + 1 }, (_, i) => h('span', { style: `left:${pct(a + i * 2)}%` }, `${a + i * 2}:00`))),
        it.slots.map((s, i) => h('div', { class: 'slot', style: `top:${22 + i * 26}px;left:${pct(s.from)}%;width:${pct(s.to) - pct(s.from)}%;--s:${s.c}` }, s.label)),
        h('div', { class: 'overlap', style: `left:${pct(ov[0])}%;width:${pct(ov[1]) - pct(ov[0])}%` })),
      meta([['Überschneidung', '2 Std.'], ['Frei', 'Fr 20:00'], ['Betrifft', '2 Chats']]),
      slab('Freitag ist frei', 'Lösen', () => act(it.id, 'Gelöst'))]
  },

  geburtstag: (it, act) => [headOf(it),
    h('div', { class: 'datebig' }, h('b', {}, it.age), h('div', {}, h('span', {}, 'Jahre am Freitag'), h('small', {}, 'Tante Inge sammelt für ein Geschenk'))),
    h('ul', { class: 'ideas' }, it.ideas.map((x) => h('li', {}, x))),
    slab('Glückwunsch', 'Vorbereiten', () => act(it.id, 'Glückwunsch vorbereitet'))],

  erinnerung: (it, act) => [headOf(it),
    h('div', { class: 'datebig' }, h('b', {}, it.time), h('div', {}, h('span', {}, 'heute'), h('small', {}, 'Familie Kaya bis 21 Uhr zu Hause'))),
    h('div', { class: 'seg' }, it.snooze.map((s) => h('button', { onclick: stop(() => act(it.id, `Verschoben auf ${s}`)) }, s)), h('button', { class: 'on', onclick: stop(() => act(it.id, 'Erledigt')) }, 'Erledigt'))],

  aufgabe: (it, act) => [headOf(it),
    h('div', { class: 'datebig' }, h('b', {}, it.amount), h('div', {}, h('span', {}, 'an Jonas'), h('small', {}, 'IBAN wie letzten Monat'))),
    h('div', { class: 'due' }, h('div', { class: 'track' }, h('i', { style: `width:${(1 - it.daysLeft / it.daysTotal) * 100}%` })), h('span', {}, `noch ${it.daysLeft} Tage`)),
    slab('Fällig 1. Nov', 'Erledigt', () => act(it.id, 'Erledigt'))],

  umfrage: (it, act) => {
    const total = it.options.reduce((n, o) => n + o.votes, 0) + 1
    return [headOf(it, `${it.chat} · ${it.voted} abgestimmt`),
      h('div', { class: 'poll' }, it.options.map((o) => h('button', { class: `opt${o.rec ? ' rec' : ''}`, onclick: stop(() => act(it.id, `Abgestimmt: ${o.label}`)) },
        h('span', {}, o.label), o.rec ? h('em', {}, 'passt dir') : null, h('b', {}, String(o.votes)), h('i', { style: `width:${(o.votes / total) * 100}%` })))),
      slab('Fr 20 Uhr passt dir', 'Abstimmen', () => act(it.id, 'Abgestimmt'))]
  },

  kontext: (it, act) => [headOf(it),
    quote(it.insight),
    h('div', { class: 'srcs' }, it.sources.map((s) => h('span', {}, svg(ICON.link), s))),
    slab('Link an Sarah', 'Senden', () => act(it.id, 'Gesendet'))],

  digest: (it, act) => [headOf(it),
    h('ol', { class: 'bul' }, it.bullets.map((b) => h('li', {}, b))),
    h('p', { class: 'mine' }, it.mine),
    h('div', { class: 'seg' }, h('button', { onclick: stop(() => act(it.id, 'Als gelesen markiert')) }, 'Alles gelesen'), h('button', { class: 'on', onclick: stop(() => {}) }, 'Chat öffnen'))],

  einkauf: (it, act) => {
    const ul = h('ul', { class: 'check-list' }, it.list.map(([name, who, got]) => h('li', { class: got ? 'got' : '' },
      h('button', { class: 'box', 'aria-label': `${name} abhaken`, 'aria-pressed': String(got), onclick: stop((e) => {}) }),
      h('span', {}, name), h('small', {}, who))))
    ul.addEventListener('click', (e) => { const b = e.target.closest('.box'); if (!b) return; e.stopPropagation(); const li = b.closest('li'); li.classList.toggle('got'); b.setAttribute('aria-pressed', String(li.classList.contains('got'))) })
    return [headOf(it), ul, slab(`${it.list.filter((x) => !x[2]).length} Sachen offen`, 'In die Gruppe', () => act(it.id, 'Liste geteilt'))]
  },

  paket: (it, act) => [headOf(it),
    h('ol', { class: 'track-steps', style: `--at:${it.at}` }, it.steps.map((st, i) => h('li', { class: i < it.at ? 'past' : i === it.at ? 'now' : '' }, h('i'), h('span', {}, st)))),
    meta([['Zeitfenster', '14–18 Uhr'], ['Abwesend', 'bis 17:00'], ['Paket', '4 von 4']]),
    slab('Zu Familie Kaya', 'Ablageort', () => act(it.id, 'Ablageort gesetzt'))],

  geld: (it, act) => [headOf(it),
    h('div', { class: 'ledger' },
      h('div', {}, h('small', {}, 'Von'), h('b', {}, it.from)),
      h('div', { class: 'amt-line' }, h('i'), h('strong', {}, it.amount), h('i')),
      h('div', { class: 'r' }, h('small', {}, 'An'), h('b', {}, it.to))),
    h('p', { class: 'quote' }, it.note),
    h('div', { class: 'seg' }, h('button', { onclick: stop(() => act(it.id, 'Erinnerung gesetzt')) }, 'Freitag erinnern'), h('button', { class: 'on', onclick: stop(() => act(it.id, 'Als beglichen markiert')) }, 'Beglichen'))],

  nachfassen: (it, act) => [headOf(it),
    h('div', { class: 'datebig' }, h('b', {}, String(it.days)), h('div', {}, h('span', {}, 'Tage ohne Antwort von dir'), h('small', {}, 'Jana hat seitdem nichts mehr geschrieben'))),
    h('figure', { class: 'promise' }, h('blockquote', {}, `„${it.quote}“`), h('figcaption', {}, it.said)),
    slab('Antwort vorbereitet', 'Antworten', () => act(it.id, 'Gesendet'))],

  reise: (it, act) => [headOf(it, `${it.when} · mit ${it.chat}`),
    h('div', { class: 'board' },
      h('div', {}, h('b', {}, it.dep), h('small', {}, it.fromCity)),
      h('div', { class: 'leg' }, h('i'), h('span', {}, it.change), h('i')),
      h('div', { class: 'r' }, h('b', {}, it.arr), h('small', {}, it.toCity))),
    meta([['Gleis', it.track], ['Aktuell', `${it.delay} Min.`], ['Dauer', '1:52 h']]),
    slab('Mia fährt mit', 'Absprechen', () => act(it.id, 'Nachricht vorbereitet'))],

  ort: (it, act) => [headOf(it),
    h('div', { class: 'minimap', 'aria-hidden': 'true' }, mapSvg('<path d="M0 30 L60 34 L120 20 L200 28" class="m-road"/><path d="M40 0 L52 60" class="m-road"/><path d="M150 0 L140 60" class="m-road"/><path d="M0 48 L200 44" class="m-road thin"/><path d="M20 52 L52 34 L118 22" class="m-route"/>'), h('span', { class: 'm-pin' })),
    h('div', {}, h('p', { class: 'place-name' }, it.place), h('p', { class: 'quote' }, it.detail)),
    slab('Sa 13:30', 'Mitfahren', () => act(it.id, 'Mitfahrt angefragt'))],

  person: (it, act) => [
    h('header', { class: 'c-head person-head' }, h('span', { class: 'avatar-l' }, it.initials), h('div', {}, h('span', { class: 'mark' }, TYPES.person.label), h('h2', {}, it.title), h('p', { class: 'sub' }, it.chat))),
    h('dl', { class: 'facts' }, it.facts.map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
    slab('Mal wieder melden', 'Schreiben', () => act(it.id, 'Gesendet'))],

  adresse: (it, act) => [headOf(it),
    h('address', { class: 'addr' }, it.lines.map((l, i) => h(i ? 'span' : 'b', {}, l))),
    h('div', { class: 'seg' }, h('button', { onclick: stop(() => act(it.id, 'Ignoriert')) }, 'Nicht nötig'), h('button', { class: 'on', onclick: stop(() => act(it.id, 'In Kontakte übernommen')) }, 'Übernehmen'))],

  link: (it, act) => [headOf(it),
    h('div', { class: 'linkprev' }, h('small', {}, it.domain), h('b', {}, it.headline), h('span', {}, it.read)),
    h('div', { class: 'seg' }, h('button', { onclick: stop(() => act(it.id, 'Geöffnet')) }, 'Öffnen'), h('button', { class: 'on', onclick: stop(() => act(it.id, 'Auf die Leseliste gesetzt')) }, 'Später lesen'))],

  routine: (it, act) => [headOf(it),
    h('div', { class: 'streak' }, it.weeks.map((w, i) => h('i', { class: w ? 'y' : '', title: `Woche ${i + 1}` }))),
    meta([['Diese Woche', 'offen'], ['Serie', `${it.streak} Wochen`], ['Quote', '9 von 12']]),
    slab('Sonntag 17 Uhr', 'Erinnern', () => act(it.id, 'Erinnerung gesetzt'))],

  fotos: (it, act) => [headOf(it),
    h('div', { class: 'thumbs' }, Array.from({ length: 4 }, (_, i) => h('span', { class: `t${i}` }, i === 3 ? `+${it.count - 3}` : null))),
    meta([['Fotos', String(it.count)], ['Mit dir', String(it.you)], ['Album', 'Abi 2019']]),
    slab(`${it.you} Fotos mit dir`, 'Speichern', () => act(it.id, 'Fotos gespeichert'))],
}

export function renderCard(it, { selected, onSelect, act }) {
  const t = TYPES[it.type]
  const card = h('article', {
    class: `card k-${it.type}${selected ? ' sel' : ''}`, tabindex: '0', style: `--c:${t.color}`, 'data-id': it.id,
    onclick: () => onSelect(it.id), onkeydown: (e) => e.target === e.currentTarget && e.key === 'Enter' && onSelect(it.id),
  }, R[it.type](it, act))
  const head = card.querySelector('.c-head')
  head?.append(h('button', { class: 'dismiss', 'aria-label': 'Als unwichtig ausblenden', title: 'Unwichtig', onclick: stop(() => act(it.id, 'Ausgeblendet')) }, svg(ICON.x)))
  // Weitere Vorschläge: erscheinen in der ausgewählten Karte (ersetzt die frühere Sprechblase)
  const more = (it.replies ?? []).slice(1)
  if (more.length) card.insertBefore(h('div', { class: 'more' }, h('p', {}, 'Andere Vorschläge'), more.map((r) => h('button', { onclick: stop(() => act(it.id, 'Gesendet')) }, h('span', {}, r), svg(ICON.arrow)))), card.querySelector('.slab'))
  return card
}
