import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { PGlite } from '@electric-sql/pglite'
import { auth, form, json, MCP_TOKEN, pkce, start, testDb, type Running } from './helpers.js'
import { setOwnerPassword } from '../src/app/store.js'

const PASSWORD = 'correct horse battery'
const REDIRECT = 'http://localhost:9999/callback'
const MCP_HEADERS = { Accept: 'application/json, text/event-stream' }
const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }

let pg: PGlite
let s: Running

before(async () => {
  pg = await testDb()
  s = await start()
  await setOwnerPassword(PASSWORD)
})
after(async () => {
  await s.close()
  await pg.close()
})

async function authorize(clientId: string, challenge: string, password = PASSWORD) {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'st-1', resource: `${s.url}/mcp` })
  const page = await fetch(`${s.url}/authorize?${q}`, { headers: { 'Accept-Language': 'en' } })
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /Allow access/)
  const requestId = html.match(/name="request_id" value="([^"]+)"/)![1]
  return fetch(`${s.url}/oauth/decision`, form({ request_id: requestId, password, decision: 'allow' }))
}

test('full OAuth flow: discovery, register, authorize with PKCE, token, /mcp, refresh, revoke', async () => {
  const meta = await (await fetch(`${s.url}/.well-known/oauth-authorization-server`)).json()
  assert.equal(meta.issuer, `${s.url}/`)
  assert.ok(meta.registration_endpoint && meta.token_endpoint && meta.revocation_endpoint)
  assert.deepEqual(meta.code_challenge_methods_supported, ['S256'])
  const prm = await (await fetch(`${s.url}/.well-known/oauth-protected-resource/mcp`)).json()
  assert.equal(prm.resource, `${s.url}/mcp`)
  assert.equal((await fetch(`${s.url}/.well-known/oauth-protected-resource`)).status, 200)

  const unauth = await fetch(`${s.url}/mcp`, json(INIT, MCP_HEADERS))
  assert.equal(unauth.status, 401)
  assert.match(unauth.headers.get('www-authenticate') ?? '', /resource_metadata="[^"]*oauth-protected-resource\/mcp"/)

  const reg = await fetch(`${s.url}/register`, json({ redirect_uris: [REDIRECT], client_name: 'Claude test', token_endpoint_auth_method: 'none' }))
  assert.equal(reg.status, 201)
  const client = await reg.json()
  assert.ok(client.client_id)

  const { verifier, challenge } = pkce()
  const wrong = await authorize(client.client_id, challenge, 'wrong password')
  assert.equal(wrong.status, 401)
  const ok = await authorize(client.client_id, challenge)
  assert.equal(ok.status, 302)
  const loc = new URL(ok.headers.get('location')!)
  assert.equal(loc.origin + loc.pathname, REDIRECT)
  assert.equal(loc.searchParams.get('state'), 'st-1')
  const code = loc.searchParams.get('code')!

  const badPkce = await fetch(`${s.url}/token`, form({ grant_type: 'authorization_code', code, code_verifier: pkce().verifier, client_id: client.client_id, redirect_uri: REDIRECT }))
  assert.equal(badPkce.status, 400)
  const tok = await fetch(`${s.url}/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT }))
  assert.equal(tok.status, 200)
  const t1 = await tok.json()
  assert.match(t1.access_token, /^jat_/)
  assert.match(t1.refresh_token, /^jrt_/)
  // codes are single use
  const again = await fetch(`${s.url}/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: client.client_id }))
  assert.equal(again.status, 400)

  const mcp = await fetch(`${s.url}/mcp`, json(INIT, { ...MCP_HEADERS, ...auth(t1.access_token) }))
  assert.equal(mcp.status, 200)
  assert.match(await mcp.text(), /jarvis-whatsapp/)

  // the OAuth token also works for the app API and shows up as a device
  const devs = await (await fetch(`${s.url}/api/v1/devices`, { headers: auth(t1.access_token) })).json()
  const mine = devs.devices.find((d: any) => d.id === client.client_id)
  assert.equal(mine.kind, 'oauth')
  assert.equal(mine.name, 'Claude test')
  assert.equal(mine.current, true)

  const ref = await fetch(`${s.url}/token`, form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id }))
  assert.equal(ref.status, 200)
  const t2 = await ref.json()
  assert.notEqual(t2.access_token, t1.access_token)
  // rotation: the old refresh and access tokens are gone
  const reuse = await fetch(`${s.url}/token`, form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id }))
  assert.equal(reuse.status, 400)
  assert.equal((await fetch(`${s.url}/mcp`, json(INIT, { ...MCP_HEADERS, ...auth(t1.access_token) }))).status, 401)
  assert.equal((await fetch(`${s.url}/mcp`, json(INIT, { ...MCP_HEADERS, ...auth(t2.access_token) }))).status, 200)

  const rev = await fetch(`${s.url}/revoke`, form({ token: t2.access_token, client_id: client.client_id }))
  assert.equal(rev.status, 200)
  assert.equal((await fetch(`${s.url}/mcp`, json(INIT, { ...MCP_HEADERS, ...auth(t2.access_token) }))).status, 401)
})

test('denying on the consent page redirects with access_denied', async () => {
  const client = await (await fetch(`${s.url}/register`, json({ redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }))).json()
  const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, code_challenge_method: 'S256', state: 's' })
  const html = await (await fetch(`${s.url}/authorize?${q}`)).text()
  assert.match(html, /Zugriff erlauben/) // German by default
  const id = html.match(/name="request_id" value="([^"]+)"/)![1]
  const r = await fetch(`${s.url}/oauth/decision`, form({ request_id: id, decision: 'deny' }))
  assert.equal(r.status, 302)
  assert.equal(new URL(r.headers.get('location')!).searchParams.get('error'), 'access_denied')
})

test('legacy MCP_TOKEN works on header and path, and can be switched off', async () => {
  assert.equal((await fetch(`${s.url}/mcp`, json(INIT, { ...MCP_HEADERS, ...auth(MCP_TOKEN) }))).status, 200)
  assert.equal((await fetch(`${s.url}/t/${MCP_TOKEN}/mcp`, json(INIT, MCP_HEADERS))).status, 200)
  assert.equal((await fetch(`${s.url}/t/nope${MCP_TOKEN}/mcp`, json(INIT, MCP_HEADERS))).status, 401)
  const off = await start({ legacyToken: false })
  try {
    assert.equal((await fetch(`${off.url}/mcp`, json(INIT, { ...MCP_HEADERS, ...auth(MCP_TOKEN) }))).status, 401)
    assert.equal((await fetch(`${off.url}/t/${MCP_TOKEN}/mcp`, json(INIT, MCP_HEADERS))).status, 401)
  } finally {
    await off.close()
  }
})
