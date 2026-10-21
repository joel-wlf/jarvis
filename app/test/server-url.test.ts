import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parsePairing } from '../src/api/pairing'
import { normalizeUrl } from '../src/api/server-url'

test('URL QR codes and manual addresses resolve only the server origin', () => {
  assert.deepEqual(parsePairing('https://jarvis.example.com/'), { url: 'https://jarvis.example.com' })
  assert.deepEqual(parsePairing('192.168.1.20:8081'), { url: 'http://192.168.1.20:8081' })
  assert.deepEqual(parsePairing('http://jarvis.local:8081'), { url: 'http://jarvis.local:8081' })
  assert.equal(normalizeUrl(' jarvis.example.com/ '), 'https://jarvis.example.com')
})

test('old pairing QRs discard the authentication code and local override', () => {
  const legacy = 'jarvis:' + JSON.stringify({ v: 1, url: 'https://jarvis.example.com', code: 'SECRET-CODE', homeUrl: 'http://192.168.1.3:8080' })
  assert.deepEqual(parsePairing(legacy), { url: 'https://jarvis.example.com' })
  assert.ok(!JSON.stringify(parsePairing(legacy)).includes('SECRET'))
})

test('public HTTP, credentials, paths and malformed QR codes are rejected', () => {
  for (const value of ['http://jarvis.example.com', 'http://192.168.evil.example', 'http://fdesign.example', 'https://user:password@example.com', 'https://example.com/t/secret/mcp', 'https://example.com/?token=secret', 'https://example.com/#secret', 'jarvis:{broken', 'jarvis:{"v":2,"url":"https://example.com"}', 'file:///etc/passwd']) {
    assert.equal(parsePairing(value), null, value)
  }
})
