import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const installer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../install.sh')

test('GitHub installer pins sources, launches the shared wizard, and resumes without overwriting data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-installer-'))
  try {
    const bin = path.join(dir, 'bin')
    const fixture = path.join(dir, 'fixture')
    fs.mkdirSync(bin)
    fs.mkdirSync(path.join(fixture, 'jarvis'), { recursive: true })
    fs.writeFileSync(path.join(fixture, 'jarvis', 'docker-compose.yml'), 'services: {}\n')
    const archive = path.join(dir, 'fixture.tar.gz')
    assert.equal(spawnSync('tar', ['-czf', archive, '-C', fixture, 'jarvis']).status, 0)
    const script = (name: string, source: string) => fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\nset -eu\n${source}\n`, { mode: 0o700 })
    script('uname', 'echo Linux')
    script('hostname', 'echo 192.168.1.50')
    script('ss', 'if [[ ${TEST_OCCUPIED:-0} == 1 ]]; then echo LISTEN; fi')
    script('docker', 'printf "%s\\n" "$*" >> "$TEST_DOCKER_LOG"')
    script('curl', 'if [[ "$*" == *api.github.com* ]]; then printf \'  "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",\\n\'; else cp "$TEST_ARCHIVE" "${!#}"; fi')
    const target = path.join(dir, 'My Jarvis')
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_ARCHIVE: archive, TEST_DOCKER_LOG: path.join(dir, 'docker.log'), SSH_CONNECTION: 'test' }
    const run = (...args: string[]) => spawnSync('bash', [installer, '--accept-risks', '--dir', target, ...args], { env, encoding: 'utf8' })
    const first = run('--port', '18081', '--version', 'v1')
    assert.equal(first.status, 0, first.stderr)
    assert.equal(fs.readFileSync(path.join(target, '.jarvis-install-version'), 'utf8').trim(), 'a'.repeat(40))
    assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), 'APP_WEB_PORT=18081\nAPP_HOME_URL=http://192.168.1.50:18081\n')
    assert.match(fs.readFileSync(env.TEST_DOCKER_LOG, 'utf8'), /compose up -d admin app-web/)
    assert.match(first.stdout, /192\.168\.1\.50:18081/)
    const saved = 'APP_WEB_PORT=18082\nMCP_TOKEN=test-secret-do-not-overwrite\n'
    fs.writeFileSync(path.join(target, '.env'), saved)
    assert.equal(run().status, 0)
    assert.equal(fs.readFileSync(path.join(target, '.env'), 'utf8'), saved)
    const other = path.join(dir, 'existing')
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(other, 'important.txt'), 'keep')
    const refused = spawnSync('bash', [installer, '--accept-risks', '--dir', other], { env, encoding: 'utf8' })
    assert.equal(refused.status, 1)
    assert.equal(fs.readFileSync(path.join(other, 'important.txt'), 'utf8'), 'keep')
    const occupied = spawnSync('bash', [installer, '--accept-risks', '--dir', path.join(dir, 'occupied')], { env: { ...env, TEST_OCCUPIED: '1' }, encoding: 'utf8' })
    assert.equal(occupied.status, 1)
    assert.match(occupied.stderr, /belegt/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
