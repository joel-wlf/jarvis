// Einzige Quelle der Wahrheit für alle Einstellungen in .env.
// Standardwerte müssen mit den ${KEY:-standard}-Angaben in docker-compose.yml übereinstimmen (prüft test/schema.test.ts).

export type FieldType = 'text' | 'secret' | 'bool' | 'int' | 'float' | 'enum' | 'list' | 'phone' | 'url'

export interface Field {
  key: string
  group: GroupId
  label: string
  help: string
  type: FieldType
  /** Wert, der gilt, wenn der Schlüssel fehlt ('' = der Dienst entscheidet selbst bzw. leer) */
  default: string
  required?: boolean
  min?: number
  max?: number
  /** nur für text/secret/list: erlaubte Zeichen bzw. Format */
  pattern?: string
  patternHelp?: string
  maxLength?: number
  options?: { value: string; label: string }[]
  /** Nur bei der Ersteinrichtung frei wählbar, danach nur über "Wechseln" (Rotation) */
  initOnly?: boolean
  /** Bei der Ersteinrichtung automatisch erzeugen, wenn leer */
  generate?: 'hex24' | 'hex32'
  advanced?: boolean
  /** Dienste, die den Wert lesen (für die Anzeige "betroffen") */
  services: string[]
  /** Wird von der Oberfläche berechnet und nicht angezeigt */
  managed?: boolean
  /** Nur von der Oberfläche gelesen, nicht an Dienste durchgereicht */
  adminOnly?: boolean
  placeholder?: string
  unit?: string
  /** Common values the interface offers as choices; any other valid value can still be typed in */
  presets?: { value: string; label: string }[]
}

export const GROUPS = [
  { id: 'general', label: 'Allgemein', icon: 'user', help: 'Wer du bist und wie Jarvis dich nennt.' },
  { id: 'access', label: 'Zugang & Fernzugriff', icon: 'key', help: 'Token für Claude, Cloudflare-Tunnel und Datenbank-Passwörter.' },
  { id: 'ai', label: 'KI-Anbieter', icon: 'spark', help: 'OpenAI-Schlüssel für Transkription, Bedeutungssuche, Bilder und Themen-Sortierung.' },
  { id: 'privacy', label: 'Datenschutz', icon: 'shield', help: 'Was nie an die KI geht und was vorher geschwärzt wird.' },
  { id: 'voice', label: 'Sprachnachrichten', icon: 'mic', help: 'Transkription über den API-Anbieter oder ausschalten.' },
  { id: 'images', label: 'Bilder', icon: 'image', help: 'Automatische Bildbeschreibung, damit Bilder durchsuchbar werden.' },
  { id: 'search', label: 'Suche', icon: 'search', help: 'Embeddings für die Bedeutungssuche.' },
  { id: 'organizer', label: 'Themen-Sortierung', icon: 'layers', help: 'Organizer: bündelt Nachrichten zu Themen, Terminen und Aufgaben.' },
  { id: 'people', label: 'Personen-Profile', icon: 'users', help: 'Automatische Einschätzung von Beziehung und Ton.' },
  { id: 'actions', label: 'Aktionen & Gedächtnis', icon: 'send', help: 'Was Claude in WhatsApp tun darf.' },
  { id: 'whatsapp', label: 'WhatsApp', icon: 'phone', help: 'Verknüpfung per Kopplungscode statt QR.' },
  { id: 'admin', label: 'Oberfläche', icon: 'monitor', help: 'Adresse dieser Einstellungsseite.' },
  { id: 'expert', label: 'Experten', icon: 'wrench', help: 'Feinabstimmung und Fehlersuche. Nur ändern, wenn du weißt, wozu.' },
] as const

export type GroupId = (typeof GROUPS)[number]['id']

const MODEL = '^[A-Za-z0-9._:/-]{1,100}$'
const MODEL_HELP = 'Nur Buchstaben, Ziffern und . _ : / -'
const LIST = "^[\\p{L}\\p{N} ,.&+_()/-]*$"
const LIST_HELP = 'Kommagetrennt; Buchstaben, Ziffern, Leerzeichen und . & + _ ( ) / -'
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].map((v) => ({ value: v, label: v }))

export const FIELDS: Field[] = [
  {
    key: 'APP_WEB_PORT', group: 'admin', type: 'int', default: '8081', min: 1024, max: 65535,
    label: 'Web-Port', help: 'Gemeinsamer Einstieg für Einrichtung, App und Verwaltung.', services: ['app-web'],
  },
  {
    key: 'APP_WEB_BIND', group: 'admin', type: 'text', default: '0.0.0.0',
    label: 'Web-Adresse', help: '0.0.0.0 = im Heimnetz erreichbar, 127.0.0.1 = nur auf diesem Rechner.', services: ['app-web'],
    pattern: '^(0\\.0\\.0\\.0|127\\.0\\.0\\.1)$', patternHelp: '0.0.0.0 oder 127.0.0.1',
  },
  // Allgemein
  {
    key: 'ASSISTANT_NAME', group: 'general', type: 'text', default: 'Jarvis', label: 'Name des Assistenten',
    help: 'So heißt dein persönlicher Assistent. Unabhängig von deinem eigenen Namen.',
    maxLength: 40, pattern: '^[\\p{L}\\p{N} .-]+$', patternHelp: 'Buchstaben, Ziffern, Leerzeichen, Punkt und Bindestrich',
    services: ['mcp-server'],
  },
  {
    key: 'OWNER_NAME', group: 'general', type: 'text', default: '', label: 'Dein Name',
    help: 'So spricht Jarvis in Anweisungen, Zusammenfassungen und Profilen von dir. Leer = „dich".',
    pattern: '^[\\p{L}\\p{N} .-]*$', patternHelp: 'Nur Buchstaben, Ziffern, Leerzeichen, Punkt und Bindestrich', maxLength: 40,
    services: ['mcp-server', 'organizer'], placeholder: 'z.B. Alex',
  },
  {
    key: 'OWN_NAMES', group: 'general', type: 'list', default: '', label: 'Weitere eigene Namen',
    help: 'Spitznamen oder Schreibweisen, mit denen andere dich ansprechen. Werden nie als Name einer anderen Person übernommen. Leer = nur dein Name.',
    pattern: LIST, patternHelp: LIST_HELP, maxLength: 300, services: ['organizer'], placeholder: 'z.B. Alex,Lexi',
  },

  // Zugang
  {
    key: 'APP_HOME_URL', group: 'access', type: 'url', default: '', label: 'Adresse im Heimnetz',
    help: 'Adresse für andere Geräte im gleichen Netz, z.B. http://192.168.1.20:8081. Nicht localhost.',
    adminOnly: true, services: [], placeholder: 'http://192.168.1.20:8081',
  },
  {
    key: 'MCP_TOKEN', group: 'access', type: 'secret', default: '', required: true, label: 'MCP-Token',
    help: 'Geheimer Schlüssel in der Connector-URL für Claude. Wer ihn hat, kann deine Chats lesen und in deinem Namen schreiben. Wechseln macht die alte URL sofort ungültig.',
    pattern: '^[A-Za-z0-9_-]{32,200}$', patternHelp: 'Mindestens 32 Zeichen, nur Buchstaben, Ziffern, _ und -',
    generate: 'hex32', services: ['mcp-server'],
  },
  {
    key: 'MCP_PUBLIC_HOST', group: 'access', type: 'text', default: '', label: 'Öffentlicher Hostname',
    help: 'Der Hostname, den du im Cloudflare-Tunnel für den MCP-Server eingetragen hast. Nur für die Anzeige der Connector-URL.',
    pattern: '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$', patternHelp: 'Hostname ohne https://, z.B. jarvis.example.com',
    adminOnly: true, services: [], placeholder: 'jarvis.example.com',
  },
  {
    key: 'MCP_LEGACY_TOKEN', group: 'access', type: 'bool', default: 'true', label: 'MCP-Token weiter erlauben',
    help: 'An: Die alte Connector-URL mit MCP-Token funktioniert weiter. Aus: Claude verbindet sich nur noch per Anmeldung (OAuth) mit deinem Passwort.',
    services: ['mcp-server'],
  },
  {
    key: 'APP_PUBLIC_URL', group: 'access', type: 'url', default: '', label: 'Öffentliche Adresse',
    help: 'Adresse, unter der die App und Claude Jarvis über den Cloudflare-Tunnel erreichen, z.B. https://jarvis.example.com. Steht im Kopplungs-QR-Code und ist die Adresse der Anmeldung (OAuth).',
    services: ['mcp-server'], placeholder: 'https://jarvis.example.com',
  },
  {
    key: 'ADMIN_INTERNAL_SECRET', group: 'access', type: 'secret', default: '', label: 'Interner Schlüssel',
    help: 'Sichert die interne Prüfung des gemeinsamen Passworts und der Gerätesitzungen ab. Nur im Docker-Netz gültig, nie über den Tunnel erreichbar.',
    pattern: '^[A-Za-z0-9]{16,128}$', patternHelp: 'Mindestens 16 Zeichen, nur Buchstaben und Ziffern',
    generate: 'hex24', services: ['mcp-server'],
  },
  {
    key: 'CLOUDFLARE_TUNNEL_TOKEN', group: 'access', type: 'secret', default: '', label: 'Cloudflare-Tunnel-Token',
    help: 'Macht den MCP-Server von außen erreichbar (Zero Trust → Networks → Tunnels). Gesetzt = Tunnel läuft. Den ganzen Installationsbefehl einfügen geht auch.',
    pattern: '^eyJ[A-Za-z0-9+/=_-]{20,}$', patternHelp: 'Beginnt mit eyJ…', services: ['cloudflared'],
  },
  {
    key: 'POSTGRES_PASSWORD', group: 'access', type: 'secret', default: '', required: true, initOnly: true, label: 'Datenbank-Passwort',
    help: 'Hauptpasswort der Datenbank. Gilt nur beim allerersten Start; später nur über „Wechseln", das die Datenbank mit umstellt.',
    pattern: '^[A-Za-z0-9]{16,128}$', patternHelp: 'Mindestens 16 Zeichen, nur Buchstaben und Ziffern (steht in Verbindungs-URLs)',
    generate: 'hex24', services: ['postgres', 'embedder', 'wa-ingest', 'organizer'],
  },
  {
    key: 'MCP_RO_PASSWORD', group: 'access', type: 'secret', default: '', required: true, initOnly: true, label: 'Passwort der MCP-Datenbankrollen',
    help: 'Für die eingeschränkten Rollen mcp_ro, mcp_act und mcp_mem. Ändern nur über „Wechseln".',
    pattern: '^[A-Za-z0-9]{16,128}$', patternHelp: 'Mindestens 16 Zeichen, nur Buchstaben und Ziffern',
    generate: 'hex24', services: ['postgres', 'mcp-server'],
  },

  // KI
  {
    key: 'OPENAI_API_KEY', group: 'ai', type: 'secret', default: '', label: 'OpenAI-API-Schlüssel',
    help: 'Optional. Ohne Schlüssel bleiben Suche und Archiv lokal; Transkription, Themen-Sortierung und Bildbeschreibung sind ausgeschaltet.',
    pattern: '^sk-[A-Za-z0-9_-]{20,300}$', patternHelp: 'Beginnt mit sk-', services: ['embedder', 'wa-ingest', 'organizer', 'mcp-server'],
  },
  {
    key: 'OPENAI_BASE_URL', group: 'ai', type: 'url', default: 'https://api.openai.com/v1', label: 'API-Adresse',
    help: 'Für OpenAI-kompatible Anbieter oder einen Proxy. Gilt für Themen-Sortierung, Bildbeschreibung und die App.',
    advanced: true, services: ['organizer', 'wa-ingest', 'mcp-server'],
  },
  {
    key: 'APP_MODEL', group: 'ai', type: 'text', default: 'gpt-4.1-mini', presets: [{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }, { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' }, { value: 'gpt-4.1', label: 'gpt-4.1' }, { value: 'gpt-4o-mini', label: 'gpt-4o-mini' }], label: 'Modell der App',
    help: 'Für Antwortvorschläge und „Frag Jarvis" in der App. Braucht einen OpenAI-Schlüssel.',
    pattern: MODEL, patternHelp: MODEL_HELP, advanced: true, services: ['mcp-server'],
  },

  // Datenschutz
  {
    key: 'ORGANIZER_EXCLUDE_NAMES', group: 'privacy', type: 'list', default: '', label: 'Chats nie an die KI senden',
    help: 'Chats, deren Name einen dieser Begriffe enthält, gehen weder an die Embedding- noch an die Sortier-API. Unbedingt vor dem ersten Start mit Schlüssel setzen.',
    pattern: LIST, patternHelp: LIST_HELP, maxLength: 2000, services: ['embedder', 'organizer'], placeholder: 'z.B. Arzt,Bank,Anwalt',
  },
  {
    key: 'ORGANIZER_REDACT', group: 'privacy', type: 'bool', default: 'true', label: 'Persönliche Daten schwärzen',
    help: 'Telefonnummern, IBANs, E-Mail-Adressen und Link-Pfade vor dem Senden an die KI entfernen.',
    services: ['embedder', 'organizer'],
  },
  {
    key: 'PEOPLE_SCRUB', group: 'privacy', type: 'bool', default: 'false', label: 'Personen-Profile ohne Details',
    help: 'Profile nur allgemein halten (keine konkreten Angaben wie Orte oder Ereignisse).',
    services: ['organizer'],
  },

  // Sprachnachrichten
  {
    key: 'TRANSCRIBE_PROVIDER', group: 'voice', type: 'enum', default: '', label: 'Transkription',
    help: 'Automatisch = API-Anbieter, wenn ein Schlüssel gesetzt ist, sonst aus. Audio wird zur Transkription an den Anbieter übertragen.',
    options: [
      { value: '', label: 'Automatisch' }, { value: 'openai', label: 'OpenAI' },
      { value: 'off', label: 'Aus' },
    ],
    services: ['wa-ingest'],
  },
  {
    key: 'OPENAI_TRANSCRIBE_MODEL', group: 'voice', type: 'text', default: 'gpt-4o-mini-transcribe', presets: [{ value: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe' }, { value: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe' }, { value: 'whisper-1', label: 'whisper-1' }], label: 'OpenAI-Modell',
    help: 'Modell für die Transkription bei OpenAI.', pattern: MODEL, patternHelp: MODEL_HELP, services: ['wa-ingest'],
  },
  {
    key: 'TRANSCRIBE_LANG', group: 'voice', type: 'text', default: 'de', presets: [{ value: 'auto', label: 'Automatisch' }, { value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }, { value: 'fr', label: 'Français' }, { value: 'es', label: 'Español' }, { value: 'it', label: 'Italiano' }, { value: 'nl', label: 'Nederlands' }, { value: 'pl', label: 'Polski' }, { value: 'tr', label: 'Türkçe' }], label: 'Sprache',
    help: 'Sprachcode wie de oder en, oder auto.', pattern: '^(auto|[a-z]{2})$', patternHelp: 'Zwei Buchstaben (de, en …) oder auto',
    services: ['wa-ingest'],
  },
  {
    key: 'TRANSCRIBE_MAX_AGE_DAYS', group: 'voice', type: 'int', default: '', presets: [{ value: '', label: 'Alles' }, { value: '30', label: '30 Tage' }, { value: '90', label: '90 Tage' }, { value: '365', label: '1 Jahr' }], min: 1, max: 36500, unit: 'Tage', label: 'Ältere Sprachnachrichten',
    help: 'Nur Sprachnachrichten bis zu diesem Alter transkribieren. Leer = gesamter noch verfügbarer Verlauf (bis zu 10 Jahre).',
    services: ['wa-ingest'],
  },
  {
    key: 'MAX_AUDIO_SECONDS', group: 'voice', type: 'int', default: '600', min: 10, max: 7200, unit: 'Sekunden', label: 'Maximale Länge',
    help: 'Längere Sprachnachrichten werden übersprungen.', advanced: true, services: ['wa-ingest'],
  },

  // Bilder
  {
    key: 'IMAGE_DESCRIBE', group: 'images', type: 'bool', default: 'true', label: 'Bilder beschreiben',
    help: 'Beschreibt jedes Bild per KI, damit es durchsuchbar wird. Braucht einen OpenAI-Schlüssel.', services: ['wa-ingest'],
  },
  {
    key: 'IMAGE_MODEL', group: 'images', type: 'text', default: 'gpt-4.1-mini', presets: [{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }, { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' }, { value: 'gpt-4.1', label: 'gpt-4.1' }, { value: 'gpt-4o-mini', label: 'gpt-4o-mini' }], label: 'Modell',
    help: 'Vision-fähiges Modell.', pattern: MODEL, patternHelp: MODEL_HELP, services: ['wa-ingest'],
  },
  {
    key: 'IMAGE_DETAIL', group: 'images', type: 'enum', default: 'auto', label: 'Detailstufe',
    help: 'low ist billiger, liest aber kaum Text in Screenshots.',
    options: [{ value: 'low', label: 'low (günstig)' }, { value: 'auto', label: 'auto' }, { value: 'high', label: 'high (liest Text besser)' }],
    services: ['wa-ingest'],
  },
  {
    key: 'IMAGE_CONCURRENCY', group: 'images', type: 'int', default: '3', min: 1, max: 10, label: 'Gleichzeitige Anfragen',
    help: 'Wie viele Bilder parallel beschrieben werden.', advanced: true, services: ['wa-ingest'],
  },

  // Suche
  {
    key: 'EMBED_PROVIDER', group: 'search', type: 'enum', default: '', label: 'Embeddings',
    help: 'Automatisch = OpenAI mit Schlüssel, sonst lokal. Ein Wechsel berechnet alle Vektoren neu (dauert, kostet bei OpenAI).',
    options: [{ value: '', label: 'Automatisch' }, { value: 'openai', label: 'OpenAI' }, { value: 'local', label: 'Lokal (multilingual-e5-small)' }],
    services: ['embedder'],
  },
  {
    key: 'OPENAI_EMBED_MODEL', group: 'search', type: 'text', default: 'text-embedding-3-small', presets: [{ value: 'text-embedding-3-small', label: 'text-embedding-3-small' }, { value: 'text-embedding-3-large', label: 'text-embedding-3-large' }], label: 'OpenAI-Modell',
    help: 'Wird auf 384 Dimensionen gekürzt.', pattern: MODEL, patternHelp: MODEL_HELP, services: ['embedder'],
  },
  {
    key: 'EMBED_BATCH', group: 'search', type: 'int', default: '', min: 1, max: 1000, label: 'Stapelgröße',
    help: 'Nachrichten pro Durchgang. Leer = automatisch (OpenAI 100, lokal 32).', advanced: true, services: ['embedder'],
  },
  {
    key: 'SEARCH_MAX_TOPIC_DIST', group: 'search', type: 'float', default: '0.52', min: 0, max: 2, label: 'Themen-Trefferschwelle',
    help: 'Maximale Vektor-Distanz, ab der ein Thema in der Suche noch als passend gilt. Kleiner = strenger.',
    advanced: true, services: ['mcp-server'],
  },

  // Organizer
  {
    key: 'ORGANIZER_ENABLED', group: 'organizer', type: 'bool', default: 'false', label: 'Themen-Sortierung aktiv',
    help: 'Startet den Organizer. Braucht einen OpenAI-Schlüssel. Kosten vorab unter Wartung → Kostenschätzung prüfen.',
    services: ['organizer'],
  },
  {
    key: 'ORGANIZER_MODEL', group: 'organizer', type: 'text', default: 'gpt-4.1-mini', presets: [{ value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' }, { value: 'gpt-4.1-nano', label: 'gpt-4.1-nano' }, { value: 'gpt-4.1', label: 'gpt-4.1' }, { value: 'gpt-4o-mini', label: 'gpt-4o-mini' }], label: 'Modell',
    help: 'Günstiges Modell mit strukturierter Ausgabe.', pattern: MODEL, patternHelp: MODEL_HELP, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_REASONING_EFFORT', group: 'organizer', type: 'enum', default: '', label: 'Reasoning-Aufwand',
    help: 'Nur für Reasoning-Modelle.',
    options: [{ value: '', label: 'Standard' }, ...['minimal', 'low', 'medium', 'high'].map((v) => ({ value: v, label: v }))],
    advanced: true, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_DAILY_TOKEN_BUDGET', group: 'organizer', type: 'int', default: '3000000', presets: [{ value: '500000', label: '0,5 Mio' }, { value: '1000000', label: '1 Mio' }, { value: '3000000', label: '3 Mio' }, { value: '10000000', label: '10 Mio' }], min: 0, max: 1_000_000_000, unit: 'Token/Tag', label: 'Tagesbudget',
    help: 'Obergrenze Eingabe + Ausgabe pro Tag. Danach pausiert die Sortierung bis morgen.', services: ['organizer'],
  },
  {
    key: 'ORGANIZER_PRICE_IN', group: 'organizer', type: 'float', default: '0.4', min: 0, max: 1000, unit: '$ / Mio Token', label: 'Preis Eingabe',
    help: 'Für die Kostenschätzung. Aktuellen Preis auf der Seite des Anbieters prüfen.', services: ['organizer'],
  },
  {
    key: 'ORGANIZER_PRICE_OUT', group: 'organizer', type: 'float', default: '1.6', min: 0, max: 1000, unit: '$ / Mio Token', label: 'Preis Ausgabe',
    help: 'Für die Kostenschätzung.', services: ['organizer'],
  },
  {
    key: 'ORGANIZER_SETTLE_HOURS', group: 'organizer', type: 'float', default: '1', min: 0, max: 168, unit: 'Stunden', label: 'Ruhezeit',
    help: 'Jüngere Nachrichten warten, bis das Gespräch ruht.', advanced: true, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_MIN_MESSAGES', group: 'organizer', type: 'int', default: '4', min: 1, max: 1000, label: 'Mindestanzahl',
    help: 'Ab so vielen unsortierten Nachrichten wird ein Chat sortiert …', advanced: true, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_MAX_WAIT_HOURS', group: 'organizer', type: 'float', default: '12', min: 0, max: 720, unit: 'Stunden', label: 'Maximale Wartezeit',
    help: '… oder wenn die älteste so lange wartet.', advanced: true, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_IDLE_MINUTES', group: 'organizer', type: 'float', default: '2', min: 0.1, max: 1440, unit: 'Minuten', label: 'Pause zwischen Durchläufen',
    help: 'Wartezeit, wenn nichts zu tun ist.', advanced: true, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_MAX_MESSAGES', group: 'organizer', type: 'int', default: '150', min: 10, max: 2000, label: 'Nachrichten pro Aufruf',
    help: 'Obergrenze je KI-Aufruf.', advanced: true, services: ['organizer'],
  },
  {
    key: 'ORGANIZER_MAX_CHARS', group: 'organizer', type: 'int', default: '30000', min: 1000, max: 500000, unit: 'Zeichen', label: 'Zeichen pro Aufruf',
    help: 'Obergrenze je KI-Aufruf.', advanced: true, services: ['organizer'],
  },
  {
    key: 'TOPIC_STALE_DAYS', group: 'organizer', type: 'int', default: '21', min: 1, max: 3650, unit: 'Tage', label: 'Thema veraltet nach',
    help: 'Offenes Thema ohne Termin und ohne Aktivität gilt danach als veraltet.', services: ['organizer'],
  },
  {
    key: 'TOPIC_PAST_GRACE_HOURS', group: 'organizer', type: 'int', default: '24', min: 0, max: 720, unit: 'Stunden', label: 'Thema vorbei nach Termin',
    help: 'So lange nach dem Termin bleibt ein Thema noch offen.', services: ['organizer'],
  },

  // Personen
  {
    key: 'PEOPLE_MIN_MESSAGES', group: 'people', type: 'int', default: '30', min: 1, max: 100000, label: 'Mindestnachrichten im Chat',
    help: 'Erst ab so vielen Nachrichten im Einzelchat wird ein Profil erstellt.', services: ['organizer'],
  },
  {
    key: 'PEOPLE_MIN_THEIRS', group: 'people', type: 'int', default: '8', min: 1, max: 100000, label: 'Davon von der Person',
    help: 'Mindestens so viele Nachrichten müssen von der anderen Person sein.', services: ['organizer'],
  },
  {
    key: 'PEOPLE_MIN_INTERVAL_DAYS', group: 'people', type: 'int', default: '14', min: 1, max: 3650, unit: 'Tage', label: 'Neubewertung frühestens nach',
    help: 'Ein Profil wird höchstens so oft neu eingeschätzt.', services: ['organizer'],
  },
  {
    key: 'PEOPLE_MAX_PER_DAY', group: 'people', type: 'int', default: '60', min: 0, max: 10000, label: 'KI-Aufrufe pro Tag',
    help: 'Obergrenze für Personen-Einschätzungen pro Tag.', services: ['organizer'],
  },
  {
    key: 'PEOPLE_REFRESH_GROWTH', group: 'people', type: 'float', default: '1.2', min: 1, max: 100, label: 'Neu bei Wachstum um Faktor',
    help: '1,2 = Chat um 20 % gewachsen.', advanced: true, services: ['organizer'],
  },
  {
    key: 'PEOPLE_GROUP_DELTA', group: 'people', type: 'int', default: '3', min: 1, max: 1000, label: 'Neu bei Gruppenänderung',
    help: 'Gemeinsame Gruppen um so viele geändert.', advanced: true, services: ['organizer'],
  },
  {
    key: 'PEOPLE_ACTIVITY_DELTA', group: 'people', type: 'int', default: '15', min: 1, max: 100000, label: 'Neu bei Aktivitätsänderung',
    help: 'Mindeständerung der Nachrichten der letzten 90 Tage.', advanced: true, services: ['organizer'],
  },

  // Aktionen
  {
    key: 'ENABLE_ACTIONS', group: 'actions', type: 'bool', default: 'true', label: 'Aktionen erlauben',
    help: 'Senden, Abstimmen, Reagieren, Gruppen verwalten. Aus = der MCP-Server ist rein lesend.', services: ['mcp-server'],
  },
  {
    key: 'REQUIRE_CONFIRM', group: 'actions', type: 'bool', default: 'false', label: 'Erst Vorschau, dann ausführen',
    help: 'An: jede Aktion zeigt erst eine Vorschau und läuft erst mit confirm=true. Aus: Aktionen laufen sofort.', services: ['mcp-server'],
  },
  {
    key: 'MAX_ACTIONS_PER_HOUR', group: 'actions', type: 'int', default: '30', min: 0, max: 500, unit: 'pro Stunde', label: 'Aktionen pro Stunde',
    help: 'Schutz vor Missbrauch und WhatsApp-Sperre. Abfragen zählen nicht mit.', services: ['mcp-server'],
  },
  {
    key: 'ENABLE_MEMORY', group: 'actions', type: 'bool', default: 'true', label: 'Gedächtnis & Korrekturen',
    help: 'Notizen, Erinnerungen, Personen- und Themenkorrekturen speichern.', services: ['mcp-server'],
  },

  // WhatsApp
  {
    key: 'WA_PAIRING_PHONE', group: 'whatsapp', type: 'phone', default: '', label: 'Kopplung per Telefonnummer',
    help: 'Statt QR-Code: Nummer mit Ländervorwahl (z.B. 4915112345678). Wird nach erfolgreicher Verknüpfung automatisch geleert.',
    services: ['wa-ingest'], placeholder: '4915112345678',
  },

  // Oberfläche
  {
    key: 'ADMIN_PORT', managed: true, group: 'admin', type: 'int', default: '8082', min: 1024, max: 65535, label: 'Port',
    help: 'Port dieser Seite auf dem Pi.', services: ['admin'],
  },
  {
    key: 'ADMIN_BIND', managed: true, group: 'admin', type: 'text', default: '127.0.0.1', label: 'Erreichbar über',
    help: '0.0.0.0 = im ganzen Heimnetz, 127.0.0.1 = nur auf dem Pi selbst (Zugriff per SSH-Tunnel).',
    pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$', patternHelp: 'IPv4-Adresse, z.B. 0.0.0.0 oder 127.0.0.1', services: ['admin'],
  },
  {
    key: 'JARVIS_SECRETS_DIR', group: 'admin', type: 'text', default: '.', label: 'Ordner der echten .env (Tresor)',
    help: 'Nur mit verschlüsseltem Tresor: Ordner, auf den ~/jarvis/.env verweist (z.B. /srv/vault/secrets).',
    pattern: '^(\\.|/[A-Za-z0-9._/-]+)$', patternHelp: 'Absoluter Pfad', advanced: true, services: ['admin'],
  },

  // Experten
  {
    key: 'LOG_LEVEL', group: 'expert', type: 'enum', default: 'info', label: 'Log-Stufe wa-ingest',
    help: 'debug für Fehlersuche, sonst info.', options: LOG_LEVELS, advanced: true, services: ['wa-ingest'],
  },
  {
    key: 'BAILEYS_LOG_LEVEL', group: 'expert', type: 'enum', default: 'warn', label: 'Log-Stufe WhatsApp-Bibliothek',
    help: 'Sehr gesprächig ab info.', options: LOG_LEVELS, advanced: true, services: ['wa-ingest'],
  },
  {
    key: 'JARVIS_VERSION', group: 'expert', type: 'text', default: 'latest', label: 'Image-Version',
    help: 'Welche vorgebauten Images gezogen werden: latest, eine Version wie 1.2.0 oder ein Commit (sha-abc1234). Wirkt bei der nächsten Aktualisierung.',
    pattern: '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$', patternHelp: 'Tag, z.B. latest oder 1.2.0', advanced: true, adminOnly: true, services: [],
  },
  {
    key: 'JARVIS_REGISTRY', group: 'expert', type: 'text', default: 'ghcr.io/joel-wlf/jarvis', label: 'Image-Registry',
    help: 'Präfix der Images (<Präfix>-<dienst>). Nur für eigene Forks oder einen Spiegel ändern. Einzige Stelle für den Standardwert; docker-compose.yml muss übereinstimmen.',
    pattern: '^[a-z0-9][a-z0-9._:/-]{0,200}$', patternHelp: 'Kleingeschrieben, z.B. ghcr.io/besitzer/jarvis', advanced: true, adminOnly: true, services: [],
  },

  // Von der Oberfläche berechnet
  {
    key: 'COMPOSE_PROFILES', group: 'expert', type: 'text', default: '', label: 'Docker-Profile',
    help: 'Wird automatisch aus den Einstellungen abgeleitet.', managed: true, services: [],
  },
]

export const FIELD = new Map(FIELDS.map((f) => [f.key, f]))

/** Wert, der tatsächlich gilt (gesetzter Wert oder Standard). */
export function effective(env: Record<string, string | undefined>, key: string): string {
  const v = env[key]
  return v !== undefined && v !== '' ? v : (FIELD.get(key)?.default ?? '')
}

/** Prüft einen einzelnen Wert. Gibt eine Fehlermeldung oder null zurück. Leere Werte sind erlaubt, außer bei Pflichtfeldern. */
export function validateField(f: Field, raw: string): string | null {
  const v = raw
  if (/[\r\n\0]/.test(v)) return 'Zeilenumbrüche sind nicht erlaubt.'
  if (v === '') return f.required ? 'Pflichtfeld.' : null
  if (v !== v.trim()) return 'Keine Leerzeichen am Anfang oder Ende.'
  if (f.maxLength && [...v].length > f.maxLength) return `Höchstens ${f.maxLength} Zeichen.`
  switch (f.type) {
    case 'bool':
      return v === 'true' || v === 'false' ? null : 'Nur true oder false.'
    case 'int':
    case 'float': {
      const re = f.type === 'int' ? /^-?\d+$/ : /^-?\d+(\.\d+)?$/
      if (!re.test(v)) return f.type === 'int' ? 'Ganze Zahl erwartet.' : 'Zahl erwartet (Punkt als Dezimaltrenner).'
      const n = Number(v)
      if (f.min !== undefined && n < f.min) return `Mindestens ${f.min}.`
      if (f.max !== undefined && n > f.max) return `Höchstens ${f.max}.`
      return null
    }
    case 'enum':
      return f.options?.some((o) => o.value === v) ? null : 'Ungültige Auswahl.'
    case 'phone':
      return /^\d{7,15}$/.test(v) ? null : 'Nur Ziffern mit Ländervorwahl, 7 bis 15 Stellen (ohne + und Leerzeichen).'
    case 'url': {
      try {
        const u = new URL(v)
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Nur http(s)-Adressen.'
        if (/['"\s#$]/.test(v)) return 'Ungültige Zeichen in der Adresse.'
        return null
      } catch {
        return 'Ungültige Adresse.'
      }
    }
    default:
      if (f.pattern && !new RegExp(f.pattern, 'u').test(v)) return f.patternHelp ?? 'Ungültiges Format.'
      if (/['"$`\\]/.test(v)) return 'Anführungszeichen, $, ` und \\ sind nicht erlaubt.'
      return null
  }
}

/** Eingaben vor der Prüfung bereinigen (z.B. Tunnel-Token aus einem eingefügten Befehl herausziehen). */
export function normalizeInput(key: string, raw: string): string {
  let v = raw.replace(/\r?\n/g, ' ').trim()
  const f = FIELD.get(key)
  if (!f) return v
  if (key === 'CLOUDFLARE_TUNNEL_TOKEN') v = v.match(/eyJ[A-Za-z0-9+/=_-]{20,}/)?.[0] ?? v
  if (f.type === 'secret') v = v.replace(/\s+/g, '')
  if (f.type === 'phone') v = v.replace(/[\s+()/-]/g, '').replace(/^00/, '')
  if (f.type === 'list') v = v.split(',').map((s) => s.trim()).filter(Boolean).join(',')
  if (f.type === 'float') v = v.replace(',', '.')
  if (f.type === 'url') v = v.replace(/\/+$/, '')
  if (key === 'MCP_PUBLIC_HOST') v = v.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase()
  return v
}
