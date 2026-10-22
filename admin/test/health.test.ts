import assert from 'node:assert/strict'
import { test } from 'node:test'
import { healthItems } from '../src/health.js'
import type { Job } from '../src/jobs.js'

const now = Date.parse('2026-10-22T12:00:00Z')
const up = (service: string, health = 'healthy') => ({ service, state: 'running', health })
const fine = { services: [up('postgres'), up('wa-ingest', ''), up('admin', '')], wa: { state: 'open', at: '2026-10-22T08:00:00Z' }, disk: { free: 20e9, total: 60e9 }, lastUpdate: null, now }
const ids = (i: Parameters<typeof healthItems>[0]) => healthItems(i).map((h) => h.id)

test('a healthy installation has nothing to report', () => assert.deepEqual(ids(fine), []))

test('a stopped service comes first and offers a restart', () => {
  const items = healthItems({ ...fine, services: [up('postgres', 'unhealthy'), { service: 'embedder', state: 'exited', health: '' }], disk: { free: 2.5e9, total: 20e9 } })
  assert.deepEqual(items.map((h) => h.id), ['serviceDown', 'serviceUnhealthy', 'diskLow'])
  assert.deepEqual(items[0].action, { kind: 'restart', service: 'embedder' })
})

test('WhatsApp: logged out at once, a short reconnect only after a while', () => {
  assert.deepEqual(ids({ ...fine, wa: { state: 'logged_out', at: '2026-10-22T11:59:00Z' } }), ['waLoggedOut'])
  assert.deepEqual(ids({ ...fine, wa: { state: 'closed', at: '2026-10-22T11:58:00Z' } }), [])
  assert.deepEqual(ids({ ...fine, wa: { state: 'closed', at: '2026-10-22T11:00:00Z' } }), ['waDisconnected'])
  assert.deepEqual(ids({ ...fine, wa: { state: 'qr', at: '2026-10-22T11:00:00Z' } }), ['waNotLinked'])
})

test('a failed nightly update is reported, a successful one not', () => {
  const job = (status: Job['status']) => ({ id: 'j', kind: 'update', title: '', status, startedAt: '', lines: [] }) as Job
  assert.deepEqual(ids({ ...fine, lastUpdate: job('rolled_back') }), ['updateFailed'])
  assert.deepEqual(ids({ ...fine, lastUpdate: job('ok') }), [])
})

test('almost no space left is an error', () => assert.deepEqual(ids({ ...fine, disk: { free: 0.5e9, total: 60e9 } }), ['diskFull']))
