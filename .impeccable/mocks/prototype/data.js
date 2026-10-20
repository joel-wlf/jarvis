// Beispieldaten für den Prototyp (synthetisch, keine echten Chats).

// Kartentypen: jede hat eigene Farbe und eigenes Layout; group bestimmt den Reiter.
export const TYPES = {
  frage: { label: 'Frage', color: '#E39A2D', group: 'antworten' },
  sprach: { label: 'Sprachnachricht', color: '#E39A2D', group: 'antworten' },
  reaktion: { label: 'Reaktion', color: '#E39A2D', group: 'antworten' },
  termin: { label: 'Termin', color: '#2FA45A', group: 'termine' },
  konflikt: { label: 'Überschneidung', color: '#2FA45A', group: 'termine' },
  geburtstag: { label: 'Geburtstag', color: '#2FA45A', group: 'termine' },
  erinnerung: { label: 'Erinnerung', color: '#2FA45A', group: 'termine' },
  aufgabe: { label: 'Aufgabe', color: '#3274F0', group: 'erledigen' },
  umfrage: { label: 'Umfrage', color: '#3274F0', group: 'erledigen' },
  kontext: { label: 'Gut zu wissen', color: '#7D8798', group: 'wissen' },
  digest: { label: 'Zusammenfassung', color: '#7D8798', group: 'wissen' },
  einkauf: { label: 'Einkaufsliste', color: '#3274F0', group: 'erledigen' },
  paket: { label: 'Paket', color: '#3274F0', group: 'erledigen' },
  geld: { label: 'Geld', color: '#3274F0', group: 'erledigen' },
  nachfassen: { label: 'Nachfassen', color: '#E39A2D', group: 'antworten' },
  reise: { label: 'Zug', color: '#2FA45A', group: 'termine' },
  ort: { label: 'Treffpunkt', color: '#2FA45A', group: 'termine' },
  person: { label: 'Person', color: '#7D8798', group: 'wissen' },
  adresse: { label: 'Adresse', color: '#7D8798', group: 'wissen' },
  link: { label: 'Link', color: '#7D8798', group: 'wissen' },
  routine: { label: 'Routine', color: '#2FA45A', group: 'termine' },
  fotos: { label: 'Fotos', color: '#7D8798', group: 'wissen' },
}

export const GROUPS = {
  antworten: { label: 'Antworten', color: '#E39A2D' },
  termine: { label: 'Termine', color: '#2FA45A' },
  erledigen: { label: 'Erledigen', color: '#3274F0' },
  wissen: { label: 'Wissen', color: '#7D8798' },
}

export const AREAS = [
  { id: 'familie', label: 'Familie', size: 6 },
  { id: 'wg', label: 'WG Bremer Str.', size: 5 },
  { id: 'abi', label: 'Abi 2019', size: 9 },
  { id: 'arbeit', label: 'Arbeit', size: 8 },
  { id: 'verein', label: 'Handball', size: 6 },
  { id: 'alltag', label: 'Freunde & Alltag', size: 4 },
]

export const ITEMS = [
  {
    id: 'q1', type: 'frage', area: 'familie', urgency: 3,
    title: 'Mama fragt nach Sonntag', person: 'Mama', initials: 'MA', chat: 'Einzelchat', when: 'vor 2 Std.',
    quote: 'Kommst du Sonntag zum Essen? Oma ist auch da. Sag bis Freitag Bescheid 😊',
    replies: ['Ja, ich komme gern! Soll ich Nachtisch mitbringen?', 'Ich sag dir bis Donnerstag Bescheid.', 'Sonntag klappt nicht, wie wäre Samstagabend?'],
    context: 'Sonntag 14 Uhr hilfst du Lena beim Umzug.',
  },
  {
    id: 'k1', type: 'konflikt', area: 'wg', urgency: 3,
    title: 'Samstagabend ist doppelt belegt', chat: 'Grillen und Kino-Umfrage', when: 'Sa',
    slots: [{ label: 'Grillen bei Lukas', from: 18, to: 23, c: '#2FA45A' }, { label: 'WG-Kino', from: 21, to: 23.5, c: '#3274F0' }],
    axis: [16, 24],
    replies: ['In der WG-Umfrage für Freitag stimmen', 'Beim Grillen nur bis 20:30 zusagen'],
    context: 'Freitag 20 Uhr hast du nichts vor.',
  },
  {
    id: 's1', type: 'sprach', area: 'alltag', urgency: 2,
    title: 'Lena hat eine Sprachnachricht geschickt', person: 'Lena', initials: 'LE', chat: 'Einzelchat', when: '0:48 · heute 16:10',
    quote: '„… also Sonntag ab zwei, ich hab den Transporter bis sechs. Kannst du vielleicht noch Kartons von der Arbeit mitbringen?“',
    summary: 'Umzug Sonntag ab 14 Uhr, Transporter bis 18 Uhr. Fragt, ob du Kartons mitbringst.',
    replies: ['Klar, ich bring Kartons mit! Bis Sonntag 14 Uhr.', 'Kartons schaffe ich nicht, aber ich bin pünktlich da.'],
    context: 'Im Büro stehen laut Sarah noch Kartons im Lager.',
  },
  {
    id: 't1', type: 'termin', area: 'abi', urgency: 2,
    title: 'Grillen bei Lukas', chat: 'Abi 2019', when: 'Sa 18:00', day: '25', dow: 'Sa', month: 'Okt',
    place: 'Garten bei Lukas, Am Mühlbach 4', people: ['LU', 'TI', 'SA', 'LE', 'JO', 'MI'], yes: 6,
    replies: ['Bin dabei, ich bring Getränke mit!', 'Komme später, so gegen 20 Uhr.', 'Schaffe es leider nicht.'],
    context: 'Lena, Tim und Sarah haben schon zugesagt.',
  },
  {
    id: 'u1', type: 'umfrage', area: 'wg', urgency: 2,
    title: 'Kino-Abend: wann?', chat: 'WG Bremer Str.', when: 'endet Do', voted: '3 von 4',
    options: [{ label: 'Do 19 Uhr', votes: 1 }, { label: 'Fr 20 Uhr', votes: 1, rec: true }, { label: 'Sa 21 Uhr', votes: 1 }],
    replies: ['Für Fr 20 Uhr stimmen'],
    context: 'Freitagabend ist frei, Samstag kollidiert mit dem Grillen.',
  },
  {
    id: 'g1', type: 'geburtstag', area: 'familie', urgency: 2,
    title: 'Oma wird 80', chat: 'Familie', when: 'in 3 Tagen · Fr', age: '80',
    ideas: ['Gartenbuch (im Familienchat erwähnt)', 'Fotobuch mit allen Enkeln', 'Besuch am Samstag'],
    replies: ['Glückwunsch für Freitag vorbereiten', 'Papa wegen Geschenk fragen'],
    context: 'Tante Inge sammelt für ein gemeinsames Geschenk.',
  },
  {
    id: 'a1', type: 'aufgabe', area: 'wg', urgency: 1,
    title: 'Miete November an Jonas', chat: 'WG Bremer Str.', when: 'bis 1. Nov',
    amount: '420 €', daysLeft: 11, daysTotal: 30, steps: ['Betrag 420 €', 'IBAN wie letzten Monat'],
    replies: ['Am 30. Okt erinnern', 'Erledigt, ist überwiesen'],
    context: 'Letzten Monat hast du am 29. überwiesen.',
  },
  {
    id: 'r1', type: 'reaktion', area: 'verein', urgency: 1,
    title: 'Tim: Wir sind Tabellenerster!!', person: 'Tim', initials: 'TI', chat: 'Handball Herren 2', when: 'vor 20 Min.',
    quote: 'Wir sind Tabellenerster!! 🏆 Danke an alle fürs Kommen',
    emojis: ['🔥', '🏆', '💪', '🥳'],
    context: 'Du warst beim Spiel nicht dabei.',
  },
  {
    id: 'e1', type: 'erinnerung', area: 'alltag', urgency: 3,
    title: 'Paket bei Familie Kaya abholen', chat: 'Deine Erinnerung', when: 'heute', time: '19:00',
    snooze: ['+1 Std.', 'Morgen früh', 'Sa'],
    context: 'Familie Kaya ist laut Nachricht bis 21 Uhr zu Hause.',
  },
  {
    id: 'c1', type: 'kontext', area: 'arbeit', urgency: 1,
    title: 'Sarah sucht die Kick-off-Folien', chat: 'Projekt Nordlicht', when: 'gestern',
    insight: 'Tim hat die Folien am 12. Okt im Gruppenchat geteilt. Sarah braucht sie bis Mittwoch.',
    sources: ['Projekt Nordlicht · 12. Okt', 'Sarah · gestern'],
    replies: ['Sarah den Link schicken'],
    context: 'Die Datei heißt „Kickoff_Nordlicht_v3.pdf“.',
  },
  {
    id: 'd1', type: 'digest', area: 'abi', urgency: 1,
    title: 'Abi 2019: 86 neue Nachrichten', chat: 'Abi 2019', when: 'seit gestern',
    bullets: ['Grillen Samstag bei Lukas ist fix', 'Mia sucht eine Mitfahrgelegenheit aus Bremen', 'Fotos vom letzten Treffen sind im Album'],
    mine: 'Dich betrifft: deine Zusage zum Grillen fehlt.',
    context: 'Mia fährt Samstag aus Bremen los, du auch.',
  },
]

ITEMS.push(
  {
    id: 'l1', type: 'einkauf', area: 'wg', urgency: 2, title: 'WG-Einkauf für Freitag', chat: 'WG Bremer Str.', when: 'aus 6 Nachrichten',
    list: [['Hafermilch', 'Jonas', false], ['Spülmittel', 'Mia', false], ['Toilettenpapier', 'Jonas', true], ['Kaffee, gemahlen', 'du', false], ['Zitronen', 'Mia', false]],
    replies: ['Ich gehe Freitag einkaufen, schick ich in die Gruppe'],
  },
  {
    id: 'p1', type: 'paket', area: 'alltag', urgency: 2, title: 'Laufschuhe kommen heute', chat: 'Versandbestätigung', when: 'zwischen 14 und 18 Uhr',
    steps: ['Bestellt', 'Versandt', 'In Zustellung', 'Zugestellt'], at: 2, carrier: 'Zusteller · Sendung 4 von 4',
    replies: ['Ablageort: Nachbarn Kaya', 'Morgen zustellen lassen'],
  },
  {
    id: 'm1', type: 'geld', area: 'abi', urgency: 1, title: 'Tim hat für dich ausgelegt', chat: 'Abi 2019', when: 'Konzertkarten, 3. Okt',
    from: 'Du', to: 'Tim', amount: '38,00 €', note: 'Karte für das Konzert im November',
    replies: ['Tim schreiben, dass ich es Freitag zurückgebe'],
  },
  {
    id: 'n1', type: 'nachfassen', area: 'arbeit', urgency: 2, title: 'Du wolltest Jana zurückschreiben', chat: 'Einzelchat Jana', when: 'seit 5 Tagen',
    days: 5, quote: 'Ich melde mich morgen wegen der Wohnung!', said: 'Du, Donnerstag 21:14',
    replies: ['Sorry für die Verspätung! Ist die Wohnung noch frei?', 'Kurz Bescheid: Ich melde mich am Wochenende.'],
  },
  {
    id: 'z1', type: 'reise', area: 'abi', urgency: 2, title: 'Zug nach Bremen', chat: 'Mia', when: 'Sa 9:12',
    dep: '9:12', arr: '11:04', fromCity: 'Hannover Hbf', toCity: 'Bremen Hbf', track: '7', delay: '+4', change: 'direkt',
    replies: ['Mia fragen, ob wir zusammen fahren'],
  },
  {
    id: 'o1', type: 'ort', area: 'verein', urgency: 2, title: 'Treffpunkt Auswärtsspiel', chat: 'Handball Herren 2', when: 'Sa 13:30',
    place: 'Parkplatz Sporthalle Nord', detail: 'Fahrgemeinschaften, 3 Autos, ein Platz bei Tim frei',
    replies: ['Bei Tim mitfahren', 'Ich fahre selbst'],
  },
  {
    id: 'h1', type: 'person', area: 'familie', urgency: 1, title: 'Opa Heinz', chat: 'Letzter Kontakt vor 3 Wochen', when: 'Familie',
    initials: 'HE', facts: [['Zuletzt', 'Anruf 30. Sep'], ['Erwähnt', 'Knie-OP am 4. Nov'], ['Mag', 'Fußball, Kreuzworträtsel']],
    replies: ['Guten Tag Opa, wie geht es deinem Knie?', 'Anruf am Sonntag einplanen'],
  },
  {
    id: 'ad1', type: 'adresse', area: 'abi', urgency: 1, title: 'Mia hat eine neue Adresse', chat: 'Abi 2019', when: 'gestern',
    lines: ['Mia Hoffmann', 'Lindenstraße 12, 3. OG', '28203 Bremen'],
    replies: ['In Kontakte übernehmen'],
  },
  {
    id: 'li1', type: 'link', area: 'arbeit', urgency: 1, title: 'Sarah teilt einen Artikel', chat: 'Projekt Nordlicht', when: 'heute 11:02',
    domain: 'zeitschrift-gestaltung.de', headline: 'Warum gute Formulare kurz sind', read: '7 Min. Lesezeit',
    replies: ['Auf die Leseliste für Sonntag'],
  },
  {
    id: 'ro1', type: 'routine', area: 'familie', urgency: 1, title: 'Sonntags Oma anrufen', chat: 'Deine Routine', when: 'seit 9 Wochen',
    weeks: [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0], streak: 2,
    replies: ['Sonntag 17 Uhr erinnern'],
  },
  {
    id: 'f1', type: 'fotos', area: 'abi', urgency: 1, title: 'Lukas hat 14 Fotos geteilt', chat: 'Abi 2019', when: 'vom letzten Treffen',
    count: 14, you: 5,
    replies: ['Die 5 Fotos mit dir speichern'],
  },
)

export const WEEK = [
  { d: 'Mo', n: 2 }, { d: 'Di', n: 1 }, { d: 'Mi', n: 3, today: true }, { d: 'Do', n: 4 }, { d: 'Fr', n: 3 }, { d: 'Sa', n: 5 }, { d: 'So', n: 2 },
]

export const LIVE_SOURCES = ['WG Bremer Str.', 'Abi 2019', 'Mama', 'Projekt Nordlicht', 'Handball Herren 2', 'Lena', 'Familie']
export const SOURCE_AREA = { 'WG Bremer Str.': 'wg', 'Abi 2019': 'abi', Mama: 'familie', 'Projekt Nordlicht': 'arbeit', 'Handball Herren 2': 'verein', Lena: 'alltag', Familie: 'familie' }

// Was Jarvis in der Sprechblase sagt (seine Stimme, kurz, mit dem Grund, warum es dich betrifft)
export const SAY = {
  q1: 'Mama wartet seit 2 Stunden auf deine Antwort: Sonntagsessen, Oma kommt auch. Um 14 Uhr hilfst du aber Lena beim Umzug.',
  k1: 'Samstagabend ist doppelt belegt: Grillen bei Lukas ab 18 Uhr und das WG-Kino um 21 Uhr. Freitag wäre bei dir frei.',
  s1: 'Lena hat dir 48 Sekunden gesprochen: Umzug Sonntag ab 14 Uhr, und ob du Kartons von der Arbeit mitbringst.',
  t1: 'Lukas grillt Samstag ab 18 Uhr, sechs sind schon dabei. Nur deine Zusage fehlt noch.',
  u1: 'In der WG läuft die Kino-Umfrage, nur du fehlst. Freitag 20 Uhr passt in deinen Kalender.',
  g1: 'Oma wird am Freitag 80. Im Familienchat kam ein Gartenbuch als Geschenkidee auf.',
  a1: 'Die Miete für November geht an Jonas: 420 € bis zum Ersten. Soll ich dich am 30. erinnern?',
  r1: 'Tim jubelt im Handball-Chat: Ihr seid Tabellenerster! Magst du kurz reagieren?',
  e1: 'Heute um 19 Uhr wolltest du das Paket bei Familie Kaya abholen. Sie sind bis 21 Uhr zu Hause.',
  c1: 'Sarah sucht die Kick-off-Folien. Tim hat sie am 12. Oktober im Projektchat geteilt.',
  l1: 'Aus sechs Nachrichten in der WG habe ich eine Einkaufsliste gemacht. Kaffee steht auf deinem Namen.',
  p1: 'Deine Laufschuhe sind in Zustellung, heute zwischen 14 und 18 Uhr. Du bist bis 17 Uhr im Büro.',
  m1: 'Tim hat dir 38 € für die Konzertkarte ausgelegt. Das ist jetzt zweieinhalb Wochen her.',
  n1: 'Du hast Jana vor fünf Tagen versprochen, dich wegen der Wohnung zu melden.',
  z1: 'Samstag fährst du um 9:12 nach Bremen. Mia nimmt laut Chat denselben Zug.',
  o1: 'Treffpunkt fürs Auswärtsspiel ist Samstag 13:30 an der Sporthalle Nord. Bei Tim ist noch ein Platz frei.',
  h1: 'Mit Opa Heinz hattest du seit drei Wochen keinen Kontakt. Er hat am 4. November seine Knie-OP.',
  ad1: 'Mia ist umgezogen. Ihre neue Adresse steht im Abi-Chat; soll ich sie übernehmen?',
  li1: 'Sarah hat einen Artikel geteilt, der zu eurem Projekt passt. Sieben Minuten Lesezeit.',
  ro1: 'Sonntags rufst du meistens Oma an. Die letzten zwei Wochen hat es geklappt.',
  f1: 'Lukas hat 14 Fotos vom Treffen geteilt, auf fünf bist du zu sehen.',
  d1: 'In Abi 2019 sind seit gestern 86 Nachrichten zusammengekommen. Für dich wichtig: Deine Zusage zum Grillen fehlt.',
}
