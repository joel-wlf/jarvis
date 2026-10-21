import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderEnvExample } from '../scripts/gen-env-example.js'
import { FIELDS, GROUPS, normalizeInput, validateField, FIELD } from '../src/schema.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8')

/** Alle ${KEY…}-Interpolationen aus docker-compose.yml mit ihrem Standardwert (undefined = ohne :-). */
function composeVars() {
  const out = new Map<string, Set<string | undefined>>()
  for (const m of compose.matchAll(/\$\{([A-Z0-9_]+)(?::?-([^}]*))?\}/g)) {
    if (!out.has(m[1])) out.set(m[1], new Set())
    out.get(m[1])!.add(m[2])
  }
  return out
}

test('jede Variable in docker-compose.yml ist im Schema beschrieben', () => {
  const missing = [...composeVars().keys()].filter((k) => !FIELD.has(k))
  assert.deepEqual(missing, [], `Im Schema fehlen: ${missing.join(', ')}`)
})

test('jede Einstellung kommt in docker-compose.yml auch an', () => {
  const vars = composeVars()
  const missing = FIELDS.filter((f) => !f.managed && !f.adminOnly && !vars.has(f.key)).map((f) => f.key)
  assert.deepEqual(missing, [], `Nicht an Dienste durchgereicht: ${missing.join(', ')}`)
})

test('Standardwerte im Schema und in docker-compose.yml stimmen überein', () => {
  for (const [key, defaults] of composeVars()) {
    const f = FIELD.get(key)!
    for (const d of defaults) {
      if (d === undefined) continue
      assert.equal(d, f.default, `${key}: compose "${d}" vs. Schema "${f.default}"`)
    }
  }
})

test('Standardwerte sind gültig, Schlüssel eindeutig, Gruppen bekannt', () => {
  const groups = new Set(GROUPS.map((g) => g.id))
  assert.equal(new Set(FIELDS.map((f) => f.key)).size, FIELDS.length)
  for (const f of FIELDS) {
    assert.ok(groups.has(f.group), `${f.key}: Gruppe ${f.group}`)
    if (!f.required) assert.equal(validateField(f, f.default), null, `${f.key}: Standard "${f.default}" ungültig`)
    if (f.type === 'enum') assert.ok(f.options?.length, `${f.key}: keine Optionen`)
  }
})

test('Validierung fängt typische Fehler', () => {
  const v = (k: string, s: string) => validateField(FIELD.get(k)!, s)
  assert.equal(v('MCP_TOKEN', ''), 'Pflichtfeld.')
  assert.match(v('MCP_TOKEN', 'kurz')!, /32/)
  assert.equal(v('MCP_TOKEN', 'a'.repeat(48)), null)
  assert.match(v('POSTGRES_PASSWORD', 'pass/word-mit-zeichen')!, /Buchstaben und Ziffern/)
  assert.match(v('MAX_ACTIONS_PER_HOUR', '12x')!, /Ganze Zahl/)
  assert.match(v('MAX_ACTIONS_PER_HOUR', '9999')!, /Höchstens/)
  assert.equal(v('ORGANIZER_PRICE_IN', '0.15'), null)
  assert.match(v('IMAGE_DETAIL', 'ultra')!, /Auswahl/)
  assert.match(v('OWNER_NAME', "O'Neil")!, /Buchstaben/)
  assert.match(v('ORGANIZER_EXCLUDE_NAMES', 'Bank$')!, /Kommagetrennt/)
  assert.match(v('OWNER_NAME', 'a\nb')!, /Zeilenumbrüche/)
  assert.equal(v('WA_PAIRING_PHONE', '4915112345678'), null)
  assert.match(v('OPENAI_BASE_URL', 'ftp://x')!, /http/)
})

test('Eingaben werden bereinigt', () => {
  assert.equal(normalizeInput('CLOUDFLARE_TUNNEL_TOKEN', 'sudo cloudflared service install eyJhIjoiYWJjIiwidCI6Inh5eiJ9xxxxxxxx'), 'eyJhIjoiYWJjIiwidCI6Inh5eiJ9xxxxxxxx')
  assert.equal(normalizeInput('WA_PAIRING_PHONE', '+49 151 1234-5678'), '4915112345678')
  assert.equal(normalizeInput('WA_PAIRING_PHONE', '0049 151 12345678'), '4915112345678')
  assert.equal(normalizeInput('ORGANIZER_EXCLUDE_NAMES', ' Arzt ,Bank,, Anwalt '), 'Arzt,Bank,Anwalt')
  assert.equal(normalizeInput('ORGANIZER_PRICE_IN', '0,4'), '0.4')
  assert.equal(normalizeInput('MCP_PUBLIC_HOST', 'https://Jarvis.Example.com/t/x/mcp'), 'jarvis.example.com')
  assert.equal(normalizeInput('OPENAI_API_KEY', ' sk-abc \n'), 'sk-abc')
})

test('.env.example ist aktuell (sonst: cd admin && npm run gen-env-example)', () => {
  assert.equal(fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8'), renderEnvExample())
})

test('jedes Image in docker-compose.yml nutzt die Standard-Registry aus dem Schema', () => {
  const refs = [...compose.matchAll(/^\s+image: \$\{JARVIS_REGISTRY:-([^}]*)\}-([a-z-]+):\$\{JARVIS_VERSION:-([^}]*)\}$/gm)]
  for (const m of refs) {
    assert.equal(m[1], FIELD.get('JARVIS_REGISTRY')!.default, `${m[2]}: Registry`)
    assert.equal(m[3], FIELD.get('JARVIS_VERSION')!.default, `${m[2]}: Version`)
  }
  const services = ['admin', 'mcp-server', 'wa-ingest', 'embedder', 'organizer', 'app-web']
  assert.deepEqual(refs.map((m) => m[2]).sort(), services.sort())
})
