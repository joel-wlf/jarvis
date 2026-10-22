import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { ApplyError } from '../src/apply.js'
import { crossChecks } from '../src/checks.js'
import { OPENROUTER_PENDING, OPENROUTER_SETTINGS, OpenRouterLogin } from '../src/openrouter.js'

const KEY = `sk-or-v1-${'a'.repeat(64)}`

test('sign-in sends a S256 challenge and swaps the code with the matching verifier', async () => {
  let sent: Record<string, string> = {}
  const login = new OpenRouterLogin(async (body) => {
    sent = body as Record<string, string>
    return new Response(JSON.stringify({ key: KEY }), { status: 200 })
  })
  const { url, state } = login.start('http://jarvis.local/setup')
  const u = new URL(url)
  assert.equal(u.origin + u.pathname, 'https://openrouter.ai/auth')
  assert.equal(u.searchParams.get('callback_url'), 'http://jarvis.local/setup')
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(u.searchParams.get('state'), state)
  await login.finish(state, 'code-123')
  assert.deepEqual(login.resolve({ OPENAI_API_KEY: OPENROUTER_PENDING, APP_MODEL: 'x' }), { OPENAI_API_KEY: KEY, APP_MODEL: 'x' })
  assert.equal(sent.code, 'code-123')
  assert.equal(createHash('sha256').update(sent.code_verifier).digest('base64url'), u.searchParams.get('code_challenge'))
})

test('without a callback OpenRouter shows the code instead', () => {
  const { url } = new OpenRouterLogin().start()
  assert.equal(new URL(url).searchParams.get('callback_url'), null)
})

test('a sign-in can be finished once, and only with a known state', async () => {
  const login = new OpenRouterLogin(async () => new Response(JSON.stringify({ key: KEY })))
  const { state } = login.start()
  await login.finish(state, 'abc')
  await assert.rejects(login.finish(state, 'abc'), ApplyError)
  await assert.rejects(login.finish('unknown', 'abc'), /abgelaufen/)
})

test('the held key replaces the placeholder until it is applied', async () => {
  const login = new OpenRouterLogin()
  assert.deepEqual(login.resolve({ OPENAI_API_KEY: 'sk-own' }), { OPENAI_API_KEY: 'sk-own' })
  assert.throws(() => login.resolve({ OPENAI_API_KEY: OPENROUTER_PENDING }), /nicht mehr gültig/)
  login.hold(KEY)
  login.resolve({ OPENAI_API_KEY: OPENROUTER_PENDING }, true)
  assert.throws(() => login.resolve({ OPENAI_API_KEY: OPENROUTER_PENDING }), ApplyError)
})

test('a rejected code or a strange answer becomes a readable error', async () => {
  const denied = new OpenRouterLogin(async () => new Response('{}', { status: 403 }))
  await assert.rejects(denied.finish(denied.start().state, 'abc'), /abgelehnt/)
  const odd = new OpenRouterLogin(async () => new Response(JSON.stringify({ key: 'nope' })))
  await assert.rejects(odd.finish(odd.start().state, 'abc'), /keinen gültigen Schlüssel/)
})

test('an OpenRouter key needs the OpenRouter address, local embeddings and no transcription', () => {
  const base = { POSTGRES_PASSWORD: 'a'.repeat(48), MCP_RO_PASSWORD: 'b'.repeat(48), MCP_TOKEN: 'c'.repeat(64) }
  const errors = (env: Record<string, string>) => crossChecks(env).filter((c) => c.level === 'error').map((c) => c.keys[0]).sort()
  assert.deepEqual(errors({ ...base, OPENAI_API_KEY: KEY }), ['EMBED_PROVIDER', 'OPENAI_BASE_URL', 'TRANSCRIBE_PROVIDER'])
  assert.deepEqual(errors({ ...base, OPENAI_API_KEY: KEY, ...OPENROUTER_SETTINGS }), [])
})
