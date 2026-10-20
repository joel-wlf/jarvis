import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { EnvLinkError, listBackups, parseEnv, quote, readEnvFile, serializeEnv, writeEnvAtomic } from '../src/envfile.js'

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-env-'))

test('parseEnv liest Compose-Syntax', () => {
  const env = parseEnv(
    [
      '# Kommentar',
      '',
      'A=1',
      'export B=zwei',
      'C=wert # Kommentar',
      'D=a#b',
      "E='mit # und $X'",
      'F="say \\"hi\\" \\\\ ok"',
      'G=',
      '  H = leer drum  ',
      'kaputt',
      '1X=nein',
    ].join('\n'),
  )
  assert.deepEqual(env, { A: '1', B: 'zwei', C: 'wert', D: 'a#b', E: 'mit # und $X', F: 'say "hi" \\ ok', G: '', H: 'leer drum' })
})

test('quote nur wenn nötig, Roundtrip bleibt gleich', () => {
  assert.equal(quote('abc123'), 'abc123')
  assert.equal(quote('tunnel,organizer'), 'tunnel,organizer')
  assert.equal(quote('https://api.openai.com/v1'), 'https://api.openai.com/v1')
  for (const v of ['Arzt, Bank', 'a # b', "it's", 'x$y', 'Jöl', 'say "hi" \\']) {
    const back = parseEnv(`K=${quote(v)}\n`).K
    assert.equal(back, v, `Roundtrip für ${v}`)
  }
})

test('serializeEnv: Schema-Reihenfolge, leere Werte weg, unbekannte Schlüssel bleiben', () => {
  const text = serializeEnv({ MCP_TOKEN: 'x'.repeat(40), OWNER_NAME: 'Alex Muster', ZZZ_EIGEN: 'bleibt', CLOUDFLARE_TUNNEL_TOKEN: '' })
  const env = parseEnv(text)
  assert.deepEqual(env, { OWNER_NAME: 'Alex Muster', MCP_TOKEN: 'x'.repeat(40), ZZZ_EIGEN: 'bleibt' })
  assert.ok(text.indexOf('OWNER_NAME') < text.indexOf('MCP_TOKEN'))
  assert.match(text, /Weitere Einstellungen/)
})

test('writeEnvAtomic schreibt mit Rechten 600 und legt Sicherungen an', () => {
  const dir = tmpdir()
  const envPath = path.join(dir, '.env')
  const backups = path.join(dir, '.env-backups')
  assert.equal(writeEnvAtomic(envPath, 'A=1\n', { backupDir: backups }), null)
  assert.equal(fs.statSync(envPath).mode & 0o777, 0o600)
  for (let i = 2; i <= 5; i++) writeEnvAtomic(envPath, `A=${i}\n`, { backupDir: backups, keepBackups: 3 })
  assert.equal(readEnvFile(envPath).env.A, '5')
  const list = listBackups(backups)
  assert.equal(list.length, 3)
  assert.equal(fs.readFileSync(path.join(backups, list[0].name), 'utf8'), 'A=4\n')
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.includes('tmp')), [])
})

test('writeEnvAtomic ersetzt das Ziel eines Verweises, nicht den Verweis', () => {
  const dir = tmpdir()
  const vault = path.join(dir, 'vault')
  fs.mkdirSync(vault)
  fs.writeFileSync(path.join(vault, '.env'), 'A=alt\n')
  const link = path.join(dir, '.env')
  fs.symlinkSync(path.join(vault, '.env'), link)
  writeEnvAtomic(link, 'A=neu\n', { backupDir: path.join(vault, '.env-backups') })
  assert.ok(fs.lstatSync(link).isSymbolicLink())
  assert.equal(fs.readFileSync(path.join(vault, '.env'), 'utf8'), 'A=neu\n')
  assert.equal(listBackups(path.join(vault, '.env-backups')).length, 1)
})

test('nicht erreichbares Verweisziel gibt eine verständliche Meldung', () => {
  const dir = tmpdir()
  const link = path.join(dir, '.env')
  fs.symlinkSync('/gibt/es/nicht/.env', link)
  assert.throws(() => readEnvFile(link), (e: unknown) => e instanceof EnvLinkError && /JARVIS_SECRETS_DIR=\/gibt\/es\/nicht/.test(e.message))
})

test('fehlende .env ist kein Fehler', () => {
  const r = readEnvFile(path.join(tmpdir(), '.env'))
  assert.equal(r.exists, false)
  assert.deepEqual(r.env, {})
})
