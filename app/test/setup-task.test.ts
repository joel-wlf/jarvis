import assert from 'node:assert/strict'
import { test } from 'node:test'
import { previousSetupStep, setupTaskFailure, setupTaskStage } from '../src/api/setup-task'
import type { Job } from '../src/api/admin'

const job = (status: Job['status'], messages: string[] = []): Job => ({ id: 'setup', kind: 'setup', title: 'internal', status, startedAt: new Date().toISOString(), lines: messages.map((msg) => ({ t: '', level: 'error', msg })) })

test('setup recovery never exposes raw infrastructure errors or credentials', () => {
  const message = setupTaskFailure(job('failed', ['docker failed: password=secret; POSTGRES_PASSWORD=secret']))
  assert.doesNotMatch(JSON.stringify(message), /docker|secret|POSTGRES/)
  assert.match(message.message, /erneut|zurück/)
  assert.match(setupTaskFailure(job('interrupted')).message, /neu gestartet/)
  assert.match(setupTaskFailure(job('rolled_back')).message, /vorherigen Zustand/)
  assert.match(setupTaskFailure(job('failed', ['ENOSPC'])).title, /Speicherplatz/)
  assert.match(setupTaskFailure(job('failed', ['EAI_AGAIN'])).message, /Internet/)
})

test('setup progress follows confirmed stages, not noisy container output', () => {
  const value = job('running')
  value.lines = [
    { t: '', level: 'info', msg: 'Starte Dienste: postgres' },
    { t: '', level: 'out', msg: 'Prüfe die Datenbank-Anmeldungen …' },
  ]
  assert.equal(setupTaskStage(value), 1)
  value.lines.push({ t: '', level: 'info', msg: 'Warte, bis alle Dienste stabil laufen …' })
  assert.equal(setupTaskStage(value), 2)
  value.lines.push({ t: '', level: 'info', msg: 'Prüfe die Datenbank-Anmeldungen …' })
  assert.equal(setupTaskStage(value), 3)
})

test('back navigation skips an integration the owner chose to connect later', () => {
  assert.equal(previousSetupStep('settings', 'later'), 'source')
  assert.equal(previousSetupStep('settings', 'whatsapp'), 'whatsapp')
  assert.equal(previousSetupStep('account', 'later'), 'name')
  assert.equal(previousSetupStep('name', 'later'), 'name')
})
