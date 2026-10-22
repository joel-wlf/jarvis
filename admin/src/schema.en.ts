// English texts for the settings schema (schema.ts holds the German ones and stays the single source for keys, types
// and limits). The settings endpoint picks the language from Accept-Language; keys missing here fall back to German.
import type { Field } from './schema.js'

type Text = { label: string; help: string; placeholder?: string; patternHelp?: string; unit?: string; options?: Record<string, string> }

export const GROUPS_EN: Record<string, { label: string; help: string }> = {
  general: { label: 'General', help: 'Who you are and what Jarvis calls you.' },
  access: { label: 'Access & remote access', help: 'Token for Claude, Cloudflare tunnel and database passwords.' },
  ai: { label: 'AI provider', help: 'OpenAI key for transcription, meaning search, images and topic sorting.' },
  privacy: { label: 'Privacy', help: 'What never goes to the AI and what is blacked out first.' },
  voice: { label: 'Voice messages', help: 'Transcription through the API provider, or off.' },
  images: { label: 'Images', help: 'Automatic image descriptions, so images become searchable.' },
  search: { label: 'Search', help: 'Embeddings for the meaning search.' },
  organizer: { label: 'Topic sorting', help: 'The organizer groups messages into topics, dates and tasks.' },
  people: { label: 'People profiles', help: 'Automatic estimate of relationship and tone.' },
  actions: { label: 'Actions & memory', help: 'What Claude may do in WhatsApp.' },
  whatsapp: { label: 'WhatsApp', help: 'Link with a pairing code instead of a QR code.' },
  admin: { label: 'Interface', help: 'Address of this settings page.' },
  expert: { label: 'Expert', help: 'Fine tuning and troubleshooting. Only change if you know why.' },
}

const MODEL_HELP = 'Only letters, digits and . _ : / -'
const LIST_HELP = 'Comma separated; letters, digits, spaces and . & + _ ( ) / -'

export const FIELDS_EN: Record<string, Text> = {
  APP_WEB_PORT: { label: 'Web port', help: 'Shared entry for setup, app and administration.' },
  APP_WEB_BIND: { label: 'Web address', help: '0.0.0.0 = reachable in your home network, 127.0.0.1 = only on this machine.', patternHelp: '0.0.0.0 or 127.0.0.1' },
  ASSISTANT_NAME: { label: 'Assistant name', help: 'What your personal assistant is called. Independent of your own name.', patternHelp: 'Letters, digits, spaces, dot and hyphen' },
  OWNER_NAME: { label: 'Your name', help: 'How Jarvis refers to you in instructions, summaries and profiles. Empty = "you".', placeholder: 'e.g. Alex', patternHelp: 'Only letters, digits, spaces, dot and hyphen' },
  OWN_NAMES: { label: 'Other names of yours', help: 'Nicknames or spellings others use for you. Never taken as the name of another person. Empty = only your name.', placeholder: 'e.g. Alex, Lexi', patternHelp: LIST_HELP },
  APP_HOME_URL: { label: 'Home network address', help: 'Address for other devices in the same network, e.g. http://192.168.1.20:8081. Not localhost.', placeholder: 'http://192.168.1.20:8081' },
  MCP_TOKEN: { label: 'MCP token', help: 'Secret key in the connector URL for Claude. Whoever has it can read your chats and write in your name. Rotating it invalidates the old URL at once.', patternHelp: 'At least 32 characters, only letters, digits, _ and -' },
  MCP_PUBLIC_HOST: { label: 'Public host name', help: 'The host name you entered in the Cloudflare tunnel for the MCP server. Only used to show the connector URL.', placeholder: 'jarvis.example.com', patternHelp: 'Host name without https://, e.g. jarvis.example.com' },
  MCP_LEGACY_TOKEN: { label: 'Keep allowing the MCP token', help: 'On: the old connector URL with MCP token keeps working. Off: Claude connects only by signing in (OAuth) with your password.' },
  APP_PUBLIC_URL: { label: 'Public address', help: 'Address where the app and Claude reach Jarvis through the Cloudflare tunnel, e.g. https://jarvis.example.com. It is in the pairing QR code and is the sign-in (OAuth) address.', placeholder: 'https://jarvis.example.com' },
  ADMIN_INTERNAL_SECRET: { label: 'Internal key', help: 'Secures the internal check of the shared password and device sessions. Only valid inside Docker, never reachable through the tunnel.', patternHelp: 'At least 16 characters, only letters and digits' },
  CLOUDFLARE_TUNNEL_TOKEN: { label: 'Cloudflare tunnel token', help: 'Makes Jarvis reachable from outside (Zero Trust → Networks → Tunnels). Set = tunnel runs. Pasting the whole install command works too.', patternHelp: 'Starts with eyJ…' },
  POSTGRES_PASSWORD: { label: 'Database password', help: 'Main database password. Only applies at the very first start; later only through "Rotate", which changes the database too.', patternHelp: 'At least 16 characters, only letters and digits (used in connection URLs)' },
  MCP_RO_PASSWORD: { label: 'Password of the MCP database roles', help: 'For the restricted roles mcp_ro, mcp_act and mcp_mem. Change only through "Rotate".', patternHelp: 'At least 16 characters, only letters and digits' },
  OPENAI_API_KEY: { label: 'API key', help: 'Key from OpenAI or OpenRouter (with OpenRouter you can also sign in from the setup assistant). Without a key search and archive stay local; transcription, topic sorting and image descriptions are off.', patternHelp: 'Starts with sk-' },
  OPENAI_BASE_URL: { label: 'API address', help: 'For OpenAI-compatible providers or a proxy. Applies to topic sorting, image descriptions and the app.' },
  APP_MODEL: { label: 'App model', help: 'For reply suggestions and "Ask Jarvis" in the app. Needs an OpenAI key.', patternHelp: MODEL_HELP },
  ORGANIZER_EXCLUDE_NAMES: { label: 'Never send these chats to the AI', help: 'Chats whose name contains one of these words go neither to the embedding nor to the sorting API. Set this before the first start with a key.', placeholder: 'e.g. Doctor, Bank, Lawyer', patternHelp: LIST_HELP },
  ORGANIZER_REDACT: { label: 'Black out personal data', help: 'Remove phone numbers, IBANs, e-mail addresses and link paths before sending anything to the AI.' },
  PEOPLE_SCRUB: { label: 'People profiles without details', help: 'Keep profiles general (no concrete facts such as places or events).' },
  TRANSCRIBE_PROVIDER: { label: 'Transcription', help: 'Automatic = API provider when a key is set, otherwise off. Audio is sent to the provider for transcription.', options: { '': 'Automatic', openai: 'OpenAI', off: 'Off' } },
  OPENAI_TRANSCRIBE_MODEL: { label: 'OpenAI model', help: 'Model for transcription at OpenAI.', patternHelp: MODEL_HELP },
  TRANSCRIBE_LANG: { label: 'Language', help: 'Language of most voice messages, or automatic.', patternHelp: 'Two letters (de, en …) or auto', options: { auto: 'Automatic' } },
  TRANSCRIBE_MAX_AGE_DAYS: { label: 'Older voice messages', help: 'Only transcribe voice messages up to this age. Empty = all history still available (up to 10 years).', unit: 'days', options: { '': 'All', '30': '30 days', '90': '90 days', '365': '1 year' } },
  MAX_AUDIO_SECONDS: { label: 'Maximum length', help: 'Longer voice messages are skipped.', unit: 'seconds' },
  IMAGE_DESCRIBE: { label: 'Describe images', help: 'Describes every image with AI so it becomes searchable. Needs an OpenAI key.' },
  IMAGE_MODEL: { label: 'Model', help: 'A vision-capable model.', patternHelp: MODEL_HELP },
  IMAGE_DETAIL: { label: 'Detail level', help: 'low is cheaper but barely reads text in screenshots.', options: { low: 'low (cheap)', auto: 'auto', high: 'high (reads text better)' } },
  IMAGE_CONCURRENCY: { label: 'Parallel requests', help: 'How many images are described at the same time.' },
  EMBED_PROVIDER: { label: 'Embeddings', help: 'Automatic = OpenAI with a key, otherwise local. Switching recomputes all vectors (takes time, costs money at OpenAI).', options: { '': 'Automatic', openai: 'OpenAI', local: 'Local (multilingual-e5-small)' } },
  OPENAI_EMBED_MODEL: { label: 'OpenAI model', help: 'Shortened to 384 dimensions.', patternHelp: MODEL_HELP },
  EMBED_BATCH: { label: 'Batch size', help: 'Messages per pass. Empty = automatic (OpenAI 100, local 32).' },
  SEARCH_MAX_TOPIC_DIST: { label: 'Topic match threshold', help: 'Maximum vector distance for a topic to still count as a match in search. Smaller = stricter.' },
  ORGANIZER_ENABLED: { label: 'Topic sorting on', help: 'Starts the organizer. Needs an OpenAI key. Check the cost first under Maintenance → Cost estimate.' },
  ORGANIZER_MODEL: { label: 'Model', help: 'An inexpensive model with structured output.', patternHelp: MODEL_HELP },
  ORGANIZER_REASONING_EFFORT: { label: 'Reasoning effort', help: 'Only for reasoning models.', options: { '': 'Default' } },
  ORGANIZER_DAILY_TOKEN_BUDGET: { label: 'Daily budget', help: 'Upper limit of input + output per day. After that sorting pauses until tomorrow.', unit: 'tokens/day', options: { '500000': '0.5 M', '1000000': '1 M', '3000000': '3 M', '10000000': '10 M' } },
  ORGANIZER_PRICE_IN: { label: 'Input price', help: 'For the cost estimate. Check the current price on the provider\'s page.', unit: '$ / M tokens' },
  ORGANIZER_PRICE_OUT: { label: 'Output price', help: 'For the cost estimate.', unit: '$ / M tokens' },
  ORGANIZER_SETTLE_HOURS: { label: 'Quiet time', help: 'Newer messages wait until the conversation settles.', unit: 'hours' },
  ORGANIZER_MIN_MESSAGES: { label: 'Minimum count', help: 'A chat is sorted once it has this many unsorted messages …' },
  ORGANIZER_MAX_WAIT_HOURS: { label: 'Maximum wait', help: '… or when the oldest one has waited this long.', unit: 'hours' },
  ORGANIZER_IDLE_MINUTES: { label: 'Pause between runs', help: 'Waiting time when there is nothing to do.', unit: 'minutes' },
  ORGANIZER_MAX_MESSAGES: { label: 'Messages per call', help: 'Upper limit per AI call.' },
  ORGANIZER_MAX_CHARS: { label: 'Characters per call', help: 'Upper limit per AI call.', unit: 'characters' },
  TOPIC_STALE_DAYS: { label: 'Topic stale after', help: 'An open topic without a date and without activity counts as stale after this.', unit: 'days' },
  TOPIC_PAST_GRACE_HOURS: { label: 'Topic over after the date', help: 'How long a topic stays open after its date.', unit: 'hours' },
  PEOPLE_MIN_MESSAGES: { label: 'Minimum messages in the chat', help: 'A profile is only created from this many messages in the direct chat.' },
  PEOPLE_MIN_THEIRS: { label: 'Of these from the person', help: 'At least this many messages must come from the other person.' },
  PEOPLE_MIN_INTERVAL_DAYS: { label: 'Re-assess at the earliest after', help: 'A profile is re-assessed at most this often.', unit: 'days' },
  PEOPLE_MAX_PER_DAY: { label: 'AI calls per day', help: 'Upper limit for people assessments per day.' },
  PEOPLE_REFRESH_GROWTH: { label: 'Again when grown by factor', help: '1.2 = the chat grew by 20 %.' },
  PEOPLE_GROUP_DELTA: { label: 'Again when groups change', help: 'Shared groups changed by this many.' },
  PEOPLE_ACTIVITY_DELTA: { label: 'Again when activity changes', help: 'Minimum change of messages in the last 90 days.' },
  ENABLE_ACTIONS: { label: 'Allow actions', help: 'Send, vote, react, manage groups. Off = the MCP server only reads.' },
  REQUIRE_CONFIRM: { label: 'Preview first, then run', help: 'On: every action shows a preview first and only runs with confirm=true. Off: actions run at once.' },
  MAX_ACTIONS_PER_HOUR: { label: 'Actions per hour', help: 'Protects against misuse and a WhatsApp ban. Queries do not count.', unit: 'per hour' },
  ENABLE_MEMORY: { label: 'Memory & corrections', help: 'Store notes, reminders, people and topic corrections.' },
  WA_PAIRING_PHONE: { label: 'Link by phone number', help: 'Instead of a QR code: number with country code (e.g. 4915112345678). Cleared automatically after linking.', placeholder: '4915112345678' },
  JARVIS_SECRETS_DIR: { label: 'Folder of the real .env (vault)', help: 'Only with an encrypted vault: folder that ~/jarvis/.env points to (e.g. /srv/vault/secrets).', patternHelp: 'Absolute path' },
  LOG_LEVEL: { label: 'Log level wa-ingest', help: 'debug for troubleshooting, otherwise info.' },
  BAILEYS_LOG_LEVEL: { label: 'Log level WhatsApp library', help: 'Very chatty from info on.' },
  AUTO_UPDATE: { label: 'Update automatically', help: 'Loads new versions at night and restarts only the services that changed. If the new state does not run cleanly, the old one comes back.' },
  AUTO_UPDATE_HOUR: { label: 'Update time', help: 'Hour (time zone Europe/Berlin) when the nightly update starts.', unit: 'o\'clock' },
  JARVIS_VERSION: { label: 'Image version', help: 'Which prebuilt images are pulled: latest, a version like 1.2.0 or a commit (sha-abc1234). Takes effect with the next update.', patternHelp: 'Tag, e.g. latest or 1.2.0' },
  JARVIS_REGISTRY: { label: 'Image registry', help: 'Prefix of the images (<prefix>-<service>). Only change for your own fork or a mirror. docker-compose.yml must match.', patternHelp: 'Lower case, e.g. ghcr.io/owner/jarvis' },
}

/** German (schema.ts) or English texts; everything else in the field stays as it is. */
export function localizeField(f: Field, lang: 'de' | 'en'): Field {
  const e = lang === 'en' ? FIELDS_EN[f.key] : undefined
  if (!e) return f
  return {
    ...f,
    label: e.label,
    help: e.help,
    ...(e.placeholder ? { placeholder: e.placeholder } : {}),
    ...(e.patternHelp ? { patternHelp: e.patternHelp } : {}),
    ...(e.unit ? { unit: e.unit } : {}),
    ...(f.options ? { options: f.options.map((o) => ({ ...o, label: e.options?.[o.value] ?? o.label })) } : {}),
    ...(f.presets && e.options ? { presets: f.presets.map((o) => ({ ...o, label: e.options?.[o.value] ?? o.label })) } : {}),
  }
}

export function localizeGroup<G extends { id: string; label: string; help: string }>(g: G, lang: 'de' | 'en'): G {
  const e = lang === 'en' ? GROUPS_EN[g.id] : undefined
  return e ? { ...g, ...e } : g
}

/** German or English from Accept-Language, English by default (same rule as the app API). */
export function langOf(header: unknown): 'de' | 'en' {
  for (const part of String(header ?? '').toLowerCase().split(',')) {
    const tag = part.trim().slice(0, 2)
    if (tag === 'de' || tag === 'en') return tag
  }
  return 'en'
}
