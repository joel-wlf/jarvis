// Synthetic sample data (no real chats). Used by the app's mock mode, by tests and by the web demo.
// Content is German because the reference owner is German; the app localizes all chrome around it.
import type { Card, Person, Suggestion } from './cards.js'
import type { HomeResponse, Memory, PersonSummary } from './api.js'

const p = (name: string, initials: string, jid?: string): Person => ({ name, initials, jid })
const s = (id: string, label: string, text: string, primary = false): Suggestion => ({ id, label, action: { kind: 'send', text }, primary })
const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

export const FIXTURE_CARDS: Card[] = [
  {
    key: 'frage:mama:1', type: 'question', group: 'reply', urgency: 3, state: 'new',
    title: 'Mama fragt nach Sonntag', source: { chat: 'Einzelchat', when: 'vor 2 Std.', at: iso(2) },
    say: 'Mama wartet seit 2 Stunden auf deine Antwort: Sonntagsessen, Oma kommt auch. Um 14 Uhr hilfst du aber Lena beim Umzug.',
    context: 'Sonntag 14 Uhr hilfst du Lena beim Umzug.',
    suggestions: [
      s('a', 'Ja, ich komme gern!', 'Ja, ich komme gern! Soll ich Nachtisch mitbringen?', true),
      s('b', 'Bis Donnerstag Bescheid', 'Ich sag dir bis Donnerstag Bescheid.'),
      s('c', 'Lieber Samstag', 'Sonntag klappt nicht, wie wäre Samstagabend?'),
    ],
    data: { person: p('Mama', 'MA'), quote: 'Kommst du Sonntag zum Essen? Oma ist auch da. Sag bis Freitag Bescheid 😊', waitingSince: iso(2), stats: [{ label: 'Wartet', value: '2 Std.' }, { label: 'Chat', value: 'Einzel' }, { label: 'Vorschläge', value: '3' }] },
  },
  {
    key: 'konflikt:sa', type: 'conflict', group: 'schedule', urgency: 3, state: 'new',
    title: 'Samstagabend ist doppelt belegt', source: { chat: 'Grillen und WG-Kino', when: 'Sa' },
    say: 'Samstagabend ist doppelt belegt: Grillen bei Lukas ab 18 Uhr und das WG-Kino um 21 Uhr. Freitag wäre bei dir frei.',
    suggestions: [s('a', 'Für Freitag stimmen', 'Freitag 20 Uhr passt mir besser!', true), s('b', 'Grillen nur bis 20:30', 'Ich komme, muss aber um halb neun los.')],
    data: { axis: [16, 24], slots: [{ label: 'Grillen bei Lukas', from: 18, to: 23, group: 'schedule' }, { label: 'WG-Kino', from: 21, to: 23.5, group: 'todo' }], free: 'Fr 20:00', stats: [{ label: 'Überschneidung', value: '2 Std.' }, { label: 'Frei', value: 'Fr 20:00' }, { label: 'Betrifft', value: '2 Chats' }] },
  },
  {
    key: 'erinnerung:12', type: 'reminder', group: 'schedule', urgency: 3, state: 'new',
    title: 'Paket bei Familie Kaya abholen', source: { chat: 'Deine Erinnerung', when: 'heute' },
    say: 'Heute um 19 Uhr wolltest du das Paket bei Familie Kaya abholen. Sie sind bis 21 Uhr zu Hause.',
    suggestions: [{ id: 'done', label: 'Erledigt', action: { kind: 'done' }, primary: true }],
    data: { time: '19:00', note: 'Familie Kaya bis 21 Uhr zu Hause', snoozeOptions: [{ label: '+1 Std.', until: iso(-1) }, { label: 'Morgen früh', until: iso(-14) }, { label: 'Sa', until: iso(-60) }] },
  },
  {
    key: 'sprach:lena:1', type: 'voice', group: 'reply', urgency: 2, state: 'new',
    title: 'Lena hat eine Sprachnachricht geschickt', source: { chat: 'Einzelchat', when: 'heute 16:10', at: iso(4) },
    say: 'Lena hat dir 48 Sekunden gesprochen: Umzug Sonntag ab 14 Uhr, und ob du Kartons von der Arbeit mitbringst.',
    suggestions: [s('a', 'Kartons bringe ich', 'Klar, ich bring Kartons mit! Bis Sonntag 14 Uhr.', true), s('b', 'Ohne Kartons', 'Kartons schaffe ich nicht, aber ich bin pünktlich da.')],
    data: { person: p('Lena', 'LE'), durationSec: 48, summary: 'Umzug Sonntag ab 14 Uhr, Transporter bis 18 Uhr. Fragt, ob du Kartons mitbringst.', stats: [{ label: 'Dauer', value: '0:48' }, { label: 'Thema', value: 'Umzug' }, { label: 'Frage', value: '1' }] },
  },
  {
    key: 'event:7:vortag', type: 'event', group: 'schedule', urgency: 2, state: 'new',
    title: 'Grillen bei Lukas', source: { chat: 'Abi 2019', when: 'Sa 18:00' },
    say: 'Lukas grillt Samstag ab 18 Uhr, sechs sind schon dabei. Nur deine Zusage fehlt noch.',
    context: 'Lena, Tim und Sarah haben schon zugesagt.',
    suggestions: [s('a', 'Zusagen', 'Bin dabei, ich bring Getränke mit!', true), s('b', 'Später', 'Komme später, so gegen 20 Uhr.'), s('c', 'Absagen', 'Schaffe es leider nicht.')],
    data: { day: '25', weekday: 'Sa', month: 'Okt', time: '18:00', place: 'Garten bei Lukas, Am Mühlbach 4', attendees: [p('Lukas', 'LU'), p('Tim', 'TI'), p('Sarah', 'SA'), p('Lena', 'LE')], yes: 6, stats: [{ label: 'Beginn', value: '18:00' }, { label: 'Dabei', value: '6' }, { label: 'Du', value: 'offen' }] },
  },
  {
    key: 'umfrage:wg1', type: 'poll', group: 'todo', urgency: 2, state: 'new',
    title: 'Kino-Abend: wann?', source: { chat: 'WG Bremer Str.', when: 'endet Do' },
    say: 'In der WG läuft die Kino-Umfrage, nur du fehlst. Freitag 20 Uhr passt in deinen Kalender.',
    suggestions: [{ id: 'fr', label: 'Fr 20 Uhr', action: { kind: 'vote', option: 'Fr 20 Uhr', pollId: 'wg1' }, primary: true }],
    data: { pollId: 'wg1', voted: '3 von 4', options: [{ label: 'Do 19 Uhr', votes: 1 }, { label: 'Fr 20 Uhr', votes: 1, recommended: true }, { label: 'Sa 21 Uhr', votes: 1 }] },
  },
  {
    key: 'geburtstag:oma', type: 'birthday', group: 'schedule', urgency: 2, state: 'new',
    title: 'Oma wird 80', source: { chat: 'Familie', when: 'in 3 Tagen · Fr' },
    say: 'Oma wird am Freitag 80. Im Familienchat kam ein Gartenbuch als Geschenkidee auf.',
    suggestions: [{ id: 'r', label: 'Glückwunsch vorbereiten', action: { kind: 'remind', at: iso(-60), text: 'Oma gratulieren' }, primary: true }],
    data: { person: p('Oma', 'OM'), age: 80, date: 'Fr', ideas: ['Gartenbuch (im Familienchat erwähnt)', 'Fotobuch mit allen Enkeln', 'Besuch am Samstag'], note: 'Tante Inge sammelt für ein Geschenk' },
  },
  {
    key: 'aktion:31', type: 'task', group: 'todo', urgency: 1, state: 'new',
    title: 'Miete November an Jonas', source: { chat: 'WG Bremer Str.', when: 'bis 1. Nov' },
    say: 'Die Miete für November geht an Jonas: 420 € bis zum Ersten. Soll ich dich am 30. erinnern?',
    suggestions: [{ id: 'done', label: 'Erledigt', action: { kind: 'done' }, primary: true }, { id: 'r', label: 'Am 30. erinnern', action: { kind: 'remind', at: iso(-216), text: 'Miete an Jonas' } }],
    data: { amount: '420 €', recipient: 'Jonas', note: 'IBAN wie letzten Monat', daysLeft: 11, daysTotal: 30 },
  },
  {
    key: 'reaktion:tim:1', type: 'reaction', group: 'reply', urgency: 1, state: 'new',
    title: 'Tim: Wir sind Tabellenerster!!', source: { chat: 'Handball Herren 2', when: 'vor 20 Min.' },
    say: 'Tim jubelt im Handball-Chat: Ihr seid Tabellenerster! Magst du kurz reagieren?',
    suggestions: [],
    data: { person: p('Tim', 'TI'), quote: 'Wir sind Tabellenerster!! 🏆 Danke an alle fürs Kommen', messageId: 'm1', emojis: ['🔥', '🏆', '💪', '🥳'] },
  },
  {
    key: 'kontext:folien', type: 'insight', group: 'know', urgency: 1, state: 'new',
    title: 'Sarah sucht die Kick-off-Folien', source: { chat: 'Projekt Nordlicht', when: 'gestern' },
    say: 'Sarah sucht die Kick-off-Folien. Tim hat sie am 12. Oktober im Projektchat geteilt.',
    suggestions: [s('a', 'Link an Sarah', 'Hier sind die Folien: Kickoff_Nordlicht_v3.pdf, Tim hat sie am 12. geteilt.', true)],
    data: { text: 'Tim hat die Folien am 12. Okt im Gruppenchat geteilt. Sarah braucht sie bis Mittwoch.', sources: ['Projekt Nordlicht · 12. Okt', 'Sarah · gestern'] },
  },
  {
    key: 'digest:abi', type: 'digest', group: 'know', urgency: 1, state: 'new',
    title: 'Abi 2019: 86 neue Nachrichten', source: { chat: 'Abi 2019', when: 'seit gestern' },
    say: 'In Abi 2019 sind seit gestern 86 Nachrichten zusammengekommen. Für dich wichtig: Deine Zusage zum Grillen fehlt.',
    suggestions: [{ id: 'done', label: 'Alles gelesen', action: { kind: 'done' } }],
    data: { unread: 86, bullets: ['Grillen Samstag bei Lukas ist fix', 'Mia sucht eine Mitfahrgelegenheit aus Bremen', 'Fotos vom letzten Treffen sind im Album'], mine: 'Dich betrifft: deine Zusage zum Grillen fehlt.' },
  },
  {
    key: 'card:einkauf:wg', type: 'shopping', group: 'todo', urgency: 2, state: 'new',
    title: 'WG-Einkauf für Freitag', source: { chat: 'WG Bremer Str.', when: 'aus 6 Nachrichten' },
    say: 'Aus sechs Nachrichten in der WG habe ich eine Einkaufsliste gemacht. Kaffee steht auf deinem Namen.',
    suggestions: [s('a', 'In die Gruppe', 'Einkauf Freitag: Hafermilch, Spülmittel, Kaffee, Zitronen. Ich übernehme den Kaffee.', true)],
    data: { items: [{ name: 'Hafermilch', who: 'Jonas', done: false }, { name: 'Spülmittel', who: 'Mia', done: false }, { name: 'Toilettenpapier', who: 'Jonas', done: true }, { name: 'Kaffee, gemahlen', who: 'du', done: false }, { name: 'Zitronen', who: 'Mia', done: false }] },
  },
  {
    key: 'card:paket:schuhe', type: 'parcel', group: 'todo', urgency: 2, state: 'new',
    title: 'Laufschuhe kommen heute', source: { chat: 'Versandbestätigung', when: 'zwischen 14 und 18 Uhr' },
    say: 'Deine Laufschuhe sind in Zustellung, heute zwischen 14 und 18 Uhr. Du bist bis 17 Uhr im Büro.',
    suggestions: [{ id: 'done', label: 'Erledigt', action: { kind: 'done' }, primary: true }],
    data: { steps: ['Bestellt', 'Versandt', 'In Zustellung', 'Zugestellt'], current: 2, window: '14–18 Uhr', stats: [{ label: 'Zeitfenster', value: '14–18 Uhr' }, { label: 'Abwesend', value: 'bis 17:00' }, { label: 'Paket', value: '4 von 4' }] },
  },
  {
    key: 'card:geld:tim', type: 'money', group: 'todo', urgency: 1, state: 'new',
    title: 'Tim hat für dich ausgelegt', source: { chat: 'Abi 2019', when: 'Konzertkarten, 3. Okt' },
    say: 'Tim hat dir 38 € für die Konzertkarte ausgelegt. Das ist jetzt zweieinhalb Wochen her.',
    suggestions: [{ id: 'done', label: 'Beglichen', action: { kind: 'done' }, primary: true }, { id: 'r', label: 'Freitag erinnern', action: { kind: 'remind', at: iso(-72), text: 'Tim 38 € zurückgeben' } }],
    data: { from: 'Du', to: 'Tim', amount: '38,00 €', note: 'Karte für das Konzert im November' },
  },
  {
    key: 'card:nachfassen:jana', type: 'followup', group: 'reply', urgency: 2, state: 'new',
    title: 'Du wolltest Jana zurückschreiben', source: { chat: 'Einzelchat Jana', when: 'seit 5 Tagen' },
    say: 'Du hast Jana vor fünf Tagen versprochen, dich wegen der Wohnung zu melden.',
    suggestions: [s('a', 'Jetzt melden', 'Sorry für die Verspätung! Ist die Wohnung noch frei?', true), s('b', 'Am Wochenende', 'Kurz Bescheid: Ich melde mich am Wochenende.')],
    data: { days: 5, promise: 'Ich melde mich morgen wegen der Wohnung!', promisedAt: 'Du, Donnerstag 21:14', note: 'Jana hat seitdem nichts mehr geschrieben' },
  },
  {
    key: 'card:zug:bremen', type: 'trip', group: 'schedule', urgency: 2, state: 'new',
    title: 'Zug nach Bremen', source: { chat: 'Mia', when: 'Sa 9:12' },
    say: 'Samstag fährst du um 9:12 nach Bremen. Mia nimmt laut Chat denselben Zug.',
    suggestions: [s('a', 'Mit Mia absprechen', 'Ich nehme auch den 9:12 ab Hannover, sollen wir zusammen fahren?', true)],
    data: { depart: '9:12', arrive: '11:04', fromCity: 'Hannover Hbf', toCity: 'Bremen Hbf', track: '7', delayMin: 4, change: 'direkt', duration: '1:52 h' },
  },
  {
    key: 'card:ort:halle', type: 'place', group: 'schedule', urgency: 2, state: 'new',
    title: 'Treffpunkt Auswärtsspiel', source: { chat: 'Handball Herren 2', when: 'Sa 13:30' },
    say: 'Treffpunkt fürs Auswärtsspiel ist Samstag 13:30 an der Sporthalle Nord. Bei Tim ist noch ein Platz frei.',
    suggestions: [s('a', 'Bei Tim mitfahren', 'Tim, kann ich bei dir mitfahren?', true), s('b', 'Ich fahre selbst', 'Ich fahre selbst und kann noch zwei mitnehmen.')],
    data: { name: 'Parkplatz Sporthalle Nord', detail: 'Fahrgemeinschaften, 3 Autos, ein Platz bei Tim frei' },
  },
  {
    key: 'person:opa', type: 'person', group: 'know', urgency: 1, state: 'new',
    title: 'Opa Heinz', source: { chat: 'Familie', when: 'vor 3 Wochen' },
    say: 'Mit Opa Heinz hattest du seit drei Wochen keinen Kontakt. Er hat am 4. November seine Knie-OP.',
    suggestions: [s('a', 'Mal wieder melden', 'Hallo Opa, wie geht es deinem Knie?', true)],
    data: { person: p('Opa Heinz', 'HE'), lastContact: 'Anruf 30. Sep', facts: [{ label: 'Zuletzt', value: 'Anruf 30. Sep' }, { label: 'Erwähnt', value: 'Knie-OP am 4. Nov' }, { label: 'Mag', value: 'Fußball, Kreuzworträtsel' }] },
  },
  {
    key: 'card:adresse:mia', type: 'address', group: 'know', urgency: 1, state: 'new',
    title: 'Mia hat eine neue Adresse', source: { chat: 'Abi 2019', when: 'gestern' },
    say: 'Mia ist umgezogen. Ihre neue Adresse steht im Abi-Chat; soll ich sie übernehmen?',
    suggestions: [{ id: 'save', label: 'Übernehmen', action: { kind: 'save_contact', name: 'Mia Hoffmann', lines: ['Lindenstraße 12, 3. OG', '28203 Bremen'] }, primary: true }],
    data: { lines: ['Mia Hoffmann', 'Lindenstraße 12, 3. OG', '28203 Bremen'] },
  },
  {
    key: 'card:link:formulare', type: 'link', group: 'know', urgency: 1, state: 'new',
    title: 'Sarah teilt einen Artikel', source: { chat: 'Projekt Nordlicht', when: 'heute 11:02' },
    say: 'Sarah hat einen Artikel geteilt, der zu eurem Projekt passt. Sieben Minuten Lesezeit.',
    suggestions: [{ id: 'later', label: 'Später lesen', action: { kind: 'remind', at: iso(-100), text: 'Artikel: Warum gute Formulare kurz sind' }, primary: true }],
    data: { url: 'https://example.org/formulare', domain: 'example.org', headline: 'Warum gute Formulare kurz sind', readingTime: '7 Min. Lesezeit' },
  },
  {
    key: 'card:routine:oma', type: 'routine', group: 'schedule', urgency: 1, state: 'new',
    title: 'Sonntags Oma anrufen', source: { chat: 'Deine Routine', when: 'seit 9 Wochen' },
    say: 'Sonntags rufst du meistens Oma an. Die letzten zwei Wochen hat es geklappt.',
    suggestions: [{ id: 'r', label: 'Sonntag 17 Uhr', action: { kind: 'remind', at: iso(-110), text: 'Oma anrufen' }, primary: true }],
    data: { weeks: [true, true, true, false, true, true, true, true, false, true, true, false], streak: 2, stats: [{ label: 'Diese Woche', value: 'offen' }, { label: 'Serie', value: '2 Wochen' }, { label: 'Quote', value: '9 von 12' }] },
  },
  {
    key: 'card:fotos:abi', type: 'photos', group: 'know', urgency: 1, state: 'new',
    title: 'Lukas hat 14 Fotos geteilt', source: { chat: 'Abi 2019', when: 'vom letzten Treffen' },
    say: 'Lukas hat 14 Fotos vom Treffen geteilt, auf fünf bist du zu sehen.',
    suggestions: [{ id: 'done', label: 'Gesehen', action: { kind: 'done' }, primary: true }],
    data: { count: 14, withOwner: 5, thumbnails: [] },
  },
]

export const FIXTURE_HOME: HomeResponse = {
  now: new Date().toISOString(),
  ownerName: 'Alex',
  jarvis: { state: 'idle', say: '22 Sachen sind offen. Am dringendsten: Mama fragt nach Sonntag.' },
  stats: [{ label: 'Offen', value: '22' }, { label: 'Erledigt', value: '35%' }, { label: 'Nachrichten', value: '214' }],
  modules: {
    messages: { days: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], incoming: [38, 52, 44, 61, 47, 70, 58], handled: [30, 41, 46, 40, 52, 49, 55], deltaPct: 18 },
    week: { days: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], counts: [2, 1, 3, 4, 3, 5, 2], todayIndex: 2, total: 20 },
    system: { servicesOk: 7, servicesTotal: 7, lastSource: 'WG Bremer Str.', lastAt: iso(0) },
  },
  counts: { all: 22, reply: 5, schedule: 7, todo: 5, know: 5 },
}

export const FIXTURE_PEOPLE: PersonSummary[] = [
  { jid: 'mama@s', name: 'Mama', initials: 'MA', relationship: 'family', closeness: 5, lastContactAt: iso(2), openCards: 1 },
  { jid: 'lena@s', name: 'Lena', initials: 'LE', relationship: 'close_friend', closeness: 5, lastContactAt: iso(4), openCards: 1 },
  { jid: 'tim@s', name: 'Tim', initials: 'TI', relationship: 'friend', closeness: 4, lastContactAt: iso(1), openCards: 2 },
  { jid: 'jana@s', name: 'Jana', initials: 'JA', relationship: 'acquaintance', closeness: 2, lastContactAt: iso(120), openCards: 1 },
  { jid: 'opa@s', name: 'Opa Heinz', initials: 'HE', relationship: 'family', closeness: 4, lastContactAt: iso(500), openCards: 1 },
  { jid: 'sarah@s', name: 'Sarah', initials: 'SA', relationship: 'colleague', closeness: 3, lastContactAt: iso(24), openCards: 1 },
]

export const FIXTURE_MEMORIES: Memory[] = [
  { id: 1, content: 'Mama mag keine Sprachnachrichten, lieber kurz schreiben.', scope: 'contact', contactJid: 'mama@s', scopeLabel: 'Mama', pinned: true, active: true, createdAt: iso(400), updatedAt: iso(400) },
  { id: 2, content: 'Projekt Nordlicht: Meetings immer mittwochs 11 Uhr.', scope: 'chat', chatJid: 'nordlicht@g', scopeLabel: 'Projekt Nordlicht', pinned: false, active: true, createdAt: iso(300), updatedAt: iso(50) },
  { id: 3, content: 'Ich antworte in Gruppen nur, wenn ich direkt gefragt werde.', scope: 'global', pinned: true, active: true, createdAt: iso(900), updatedAt: iso(900) },
]
