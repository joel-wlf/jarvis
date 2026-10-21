import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepare } from '../src/apply.js'
import { crossChecks, deriveProfiles, transcribeMode } from '../src/checks.js'

const base = { POSTGRES_PASSWORD: 'a'.repeat(48), MCP_RO_PASSWORD: 'b'.repeat(48), MCP_TOKEN: 'c'.repeat(64) }

test('Profile werden aus den Schaltern abgeleitet, fremde Profile bleiben', () => {
  assert.equal(deriveProfiles({ ...base, OPENAI_API_KEY: 'sk-x' }), '')
  assert.equal(deriveProfiles({ ...base }), '')
  assert.equal(deriveProfiles({ ...base, TRANSCRIBE_PROVIDER: 'off' }), '')
  assert.equal(deriveProfiles({ ...base, OPENAI_API_KEY: 'sk-x', ORGANIZER_ENABLED: 'true', CLOUDFLARE_TUNNEL_TOKEN: 'eyJ…', COMPOSE_PROFILES: 'organizer,eigenes' }), 'tunnel,organizer,eigenes')
  assert.equal(deriveProfiles({ ...base, OPENAI_API_KEY: 'sk-x', COMPOSE_PROFILES: 'tunnel,organizer' }), '')
})

test('Transkriptionsmodus wie in wa-ingest', () => {
  assert.equal(transcribeMode({}), 'off')
  assert.equal(transcribeMode({ OPENAI_API_KEY: 'sk-1' }), 'openai')
  assert.equal(transcribeMode({ OPENAI_API_KEY: 'sk-1', TRANSCRIBE_PROVIDER: 'local' }), 'off')
})

test('blockierende Prüfungen', () => {
  const errors = (env: Record<string, string>) => crossChecks(env).filter((c) => c.level === 'error').map((c) => c.keys[0])
  assert.deepEqual(errors({ ...base, ORGANIZER_ENABLED: 'true' }), ['ORGANIZER_ENABLED'])
  assert.deepEqual(errors({ ...base, TRANSCRIBE_PROVIDER: 'openai' }), ['TRANSCRIBE_PROVIDER'])
  assert.deepEqual(errors({ ...base, MCP_RO_PASSWORD: base.POSTGRES_PASSWORD }), ['POSTGRES_PASSWORD'])
  assert.deepEqual(errors({ ...base, OPENAI_API_KEY: 'sk-' + 'x'.repeat(30), ORGANIZER_ENABLED: 'true' }), [])
})

test('Warnung bei Schlüssel ohne Ausschlüsse', () => {
  const w = crossChecks({ ...base, OPENAI_API_KEY: 'sk-x' }).find((c) => c.keys.includes('ORGANIZER_EXCLUDE_NAMES'))
  assert.equal(w?.level, 'warn')
  assert.ok(!crossChecks({ ...base, OPENAI_API_KEY: 'sk-x', ORGANIZER_EXCLUDE_NAMES: 'Arzt' }).some((c) => c.keys.includes('ORGANIZER_EXCLUDE_NAMES')))
})

test('prepare: Ersteinrichtung erzeugt Geheimnisse und Profile', () => {
  const p = prepare({}, { OWNER_NAME: 'Alex', TRANSCRIBE_PROVIDER: 'off' }, { initial: true })
  assert.deepEqual(p.errors, {})
  assert.match(p.next.POSTGRES_PASSWORD, /^[0-9a-f]{48}$/)
  assert.match(p.next.MCP_TOKEN, /^[0-9a-f]{64}$/)
  assert.notEqual(p.next.POSTGRES_PASSWORD, p.next.MCP_RO_PASSWORD)
  assert.equal(p.next.COMPOSE_PROFILES, undefined)
})

test('prepare: initOnly-Werte lassen sich später nicht einfach ändern', () => {
  const p = prepare(base, { POSTGRES_PASSWORD: 'z'.repeat(40) })
  assert.match(p.errors.POSTGRES_PASSWORD, /Wechseln/)
})

test('prepare: verwaltete und unbekannte Schlüssel werden abgelehnt, null setzt zurück', () => {
  const p = prepare({ ...base, MAX_ACTIONS_PER_HOUR: '10' }, { COMPOSE_PROFILES: 'x', FOO: 'bar', MAX_ACTIONS_PER_HOUR: null })
  assert.ok(p.errors.COMPOSE_PROFILES && p.errors.FOO)
  assert.equal(p.next.MAX_ACTIONS_PER_HOUR, undefined)
  assert.ok(p.changed.includes('MAX_ACTIONS_PER_HOUR'))
})

test('prepare: Eingaben werden bereinigt und geprüft', () => {
  const p = prepare(base, { WA_PAIRING_PHONE: '+49 151 12345678', MAX_ACTIONS_PER_HOUR: 'viele' })
  assert.equal(p.next.WA_PAIRING_PHONE, '4915112345678')
  assert.ok(p.errors.MAX_ACTIONS_PER_HOUR)
  assert.deepEqual(p.services.sort(), ['mcp-server', 'wa-ingest'])
})


test('retired local transcription never opts an existing installation into the API', () => {
  const p = prepare({ ...base, OPENAI_API_KEY: 'sk-' + 'x'.repeat(30), TRANSCRIBE_PROVIDER: 'local', WHISPER_LANG: 'en', WHISPER_MODEL: 'small', COMPOSE_PROFILES: 'local-whisper,eigenes' }, {})
  assert.equal(p.next.TRANSCRIBE_PROVIDER, 'off')
  assert.equal(p.next.TRANSCRIBE_LANG, 'en')
  assert.equal(p.next.WHISPER_LANG, undefined)
  assert.equal(p.next.WHISPER_MODEL, undefined)
  assert.equal(p.next.COMPOSE_PROFILES, 'eigenes')
  assert.equal(transcribeMode(p.next), 'off')
  assert.ok(prepare(base, { TRANSCRIBE_PROVIDER: 'local' }).errors.TRANSCRIBE_PROVIDER)
})
