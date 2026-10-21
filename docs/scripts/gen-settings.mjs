// Generates the settings reference pages from admin/src/schema.ts, the single source of truth for .env.
// Runs before `dev` and `build`. German labels and help come straight from the schema; English comes from
// scripts/settings-en.json and falls back to the German text (with a visible note) when a key is missing there.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const schemaPath = resolve(here, '../../admin/src/schema.ts')
const { FIELDS, GROUPS } = await import(pathToFileURL(schemaPath).href)
const en = JSON.parse(readFileSync(resolve(here, 'settings-en.json'), 'utf8'))

const T = {
  en: {
    title: 'Settings reference',
    description: 'Every setting in .env, generated from the admin schema.',
    intro:
      'Every setting lives in `.env`. You normally change them in the admin interface under **Settings**, which validates each value, shows the affected services and rolls back on failure. This page is generated from `admin/src/schema.ts` when the docs are built, so it always matches the code.',
    advancedNote:
      'Settings marked **expert** only show in the interface when expert mode is on. **Required** settings are generated for you during first-run setup.',
    setting: 'Setting',
    value: 'Value',
    def: 'Default',
    desc: 'Description',
    services: 'Read by',
    none: 'empty',
    fallback: '_German text, English translation missing._',
    bool: 'true / false',
    int: 'integer',
    float: 'number',
    text: 'text',
    secret: 'secret',
    list: 'comma-separated list',
    phone: 'digits with country code',
    url: 'URL',
    enum: 'one of',
    required: 'required',
    expert: 'expert',
    initOnly: 'first start only',
    adminOnly: 'admin only',
    max: 'max',
    min: 'min',
  },
  de: {
    title: 'Einstellungen',
    description: 'Alle Einstellungen aus der .env, erzeugt aus dem Admin-Schema.',
    intro:
      'Alle Einstellungen stehen in der `.env`. Normalerweise änderst du sie in der Admin-Oberfläche unter **Einstellungen**: Sie prüft jeden Wert, zeigt die betroffenen Dienste und stellt bei Fehlern den alten Stand wieder her. Diese Seite wird beim Bauen der Doku aus `admin/src/schema.ts` erzeugt und passt deshalb immer zum Code.',
    advancedNote:
      'Mit **Experte** markierte Einstellungen erscheinen in der Oberfläche nur im Experten-Modus. **Pflicht**-Werte erzeugt die Ersteinrichtung für dich.',
    setting: 'Einstellung',
    value: 'Wert',
    def: 'Standard',
    desc: 'Beschreibung',
    services: 'Gelesen von',
    none: 'leer',
    fallback: '',
    bool: 'true / false',
    int: 'ganze Zahl',
    float: 'Zahl',
    text: 'Text',
    secret: 'Geheimnis',
    list: 'kommagetrennte Liste',
    phone: 'Ziffern mit Ländervorwahl',
    url: 'URL',
    enum: 'eine von',
    required: 'Pflicht',
    expert: 'Experte',
    initOnly: 'nur beim ersten Start',
    adminOnly: 'nur Oberfläche',
    max: 'max.',
    min: 'min.',
  },
}

const esc = (s) =>
  String(s)
    .replace(/\|/g, '\\|')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\n/g, ' ')

function valueText(f, t, lang) {
  if (f.type === 'enum') {
    const opts = f.options.map((o) => `\`${o.value || (lang === 'en' ? 'automatic' : 'automatisch')}\``).join(', ')
    return `${t.enum}: ${opts}`
  }
  let s = t[f.type] ?? f.type
  const range = []
  if (f.min !== undefined) range.push(`${t.min} ${f.min}`)
  if (f.max !== undefined && f.max < 1e8) range.push(`${t.max} ${f.max}`)
  if (range.length) s += ` (${range.join(', ')}${f.unit ? ' ' + f.unit : ''})`
  else if (f.unit) s += ` (${f.unit})`
  return s
}

function build(lang) {
  const t = T[lang]
  const out = []
  let missing = 0
  out.push('---', `title: ${t.title}`, `description: ${t.description}`, '---', '', t.intro, '', t.advancedNote, '')
  for (const g of GROUPS) {
    const fields = FIELDS.filter((f) => f.group === g.id && !f.managed)
    if (!fields.length) continue
    const [gl, gh] = lang === 'en' ? en.groups[g.id] ?? [g.label, g.help] : [g.label, g.help]
    out.push(`## ${esc(gl)}`, '', esc(gh), '')
    out.push(`| ${t.setting} | ${t.value} | ${t.def} | ${t.desc} |`, '|---|---|---|---|')
    for (const f of fields) {
      let label = f.label
      let help = f.help
      let note = ''
      if (lang === 'en') {
        const e = en.fields[f.key]
        if (e) [label, help] = e
        else {
          missing++
          note = ' ' + t.fallback
        }
      }
      const tags = []
      if (f.required) tags.push(t.required)
      if (f.advanced) tags.push(t.expert)
      if (f.initOnly) tags.push(t.initOnly)
      if (f.adminOnly) tags.push(t.adminOnly)
      const tagText = tags.length ? ` <br/>_${tags.join(', ')}_` : ''
      const def = f.default === '' ? `_${t.none}_` : `\`${esc(f.default)}\``
      const svc = f.services.length ? ` <br/>_${t.services}: ${f.services.join(', ')}_` : ''
      out.push(
        `| ${esc(label)} <br/>\`${f.key}\`${tagText} | ${esc(valueText(f, t, lang))} | ${def} | ${esc(help)}${note}${svc} |`,
      )
    }
    out.push('')
  }
  return { text: out.join('\n'), missing }
}

for (const lang of ['en', 'de']) {
  const dir = resolve(here, `../content/docs/${lang}`)
  mkdirSync(dir, { recursive: true })
  const { text, missing } = build(lang)
  writeFileSync(resolve(dir, 'settings.mdx'), text)
  console.log(`settings.mdx (${lang}): ${FIELDS.length} fields${missing ? `, ${missing} without English text` : ''}`)
}
