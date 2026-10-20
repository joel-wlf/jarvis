import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Auth } from './auth.js'
import { makeRedactor, readCurrent, secretValues, type Ctx } from './context.js'
import { FakeDb, PgAccess } from './db.js'
import { CliDocker, FakeDocker } from './docker.js'
import { EnvLinkError } from './envfile.js'
import { detectSelf } from './hostpaths.js'
import { JobRunner } from './jobs.js'
import { autoClearPairing } from './ops.js'
import { createApp } from './server.js'

const FAKE = process.env.JARVIS_FAKE_DOCKER === '1'
const PROJECT = process.env.JARVIS_PROJECT_DIR ?? '/project'
const DATA = process.env.ADMIN_DATA_DIR ?? '/data'
const PORT = Number(process.env.PORT ?? 8080)

const log = (m: string) => console.log(`[admin] ${m}`)

async function main() {
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 })
  const envPath = path.join(PROJECT, '.env')

  // Docker-Zugriff: echt über den Socket oder (Entwicklung) simuliert
  let docker: CliDocker | FakeDocker
  let self
  if (FAKE) {
    docker = new FakeDocker(fs.existsSync(envPath))
    docker.defaultEnvFile = envPath
    log('Entwicklungsmodus: Docker und Datenbank werden simuliert.')
  } else {
    const probe = new CliDocker(PROJECT, envPath)
    self = await detectSelf(probe, log)
    docker = new CliDocker(self?.projectHost ?? PROJECT, envPath)
  }

  // Neue Dateien sollen dem Besitzer des Projektordners gehören, nicht root
  let fallbackOwner: { uid: number; gid: number } | undefined
  try {
    const st = fs.statSync(PROJECT)
    fallbackOwner = { uid: st.uid, gid: st.gid }
  } catch {
    fallbackOwner = undefined
  }

  const ctxBase = {
    envPath,
    dataDir: DATA,
    docker,
    db: FAKE ? new FakeDb() : new PgAccess(),
    waStatusFile: process.env.WA_STATUS_FILE ?? '/wa-status/link.json',
    self,
    healthTimeoutMs: Number(process.env.ADMIN_HEALTH_TIMEOUT_MS ?? 240_000),
    pollMs: FAKE ? 500 : 3_000,
    stableMs: FAKE ? 1_500 : 15_000,
    fallbackOwner,
    fake: FAKE,
  }
  const jobs = new JobRunner(path.join(DATA, 'jobs'), makeRedactor(() => secretValues(ctx)))
  const ctx: Ctx = { ...ctxBase, jobs }

  // .env lesbar? (Tresor-Verweis ohne JARVIS_SECRETS_DIR wird in der Oberfläche erklärt)
  try {
    const cur = readCurrent(ctx)
    log(cur.exists ? `Einstellungen gefunden: ${envPath}` : 'Noch keine Einstellungen: die Einrichtung startet im Browser.')
  } catch (e) {
    if (e instanceof EnvLinkError) log(e.message)
    else throw e
  }

  const auth = new Auth(path.join(DATA, 'auth'))
  const app = createApp(ctx, auth)
  app.listen(PORT, () => {
    const hostIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address
    log(`Oberfläche läuft auf Port ${PORT} (im Container ${hostIp ?? ''}).`)
    if (!auth.isConfigured()) {
      const line = '='.repeat(64)
      console.log(`\n${line}\n  Jarvis-Einrichtung: im Browser http://<adresse-des-pi>:${process.env.ADMIN_PUBLIC_PORT ?? PORT} öffnen\n  Einrichtungscode:   ${auth.setupCode()}\n${line}\n`)
    }
  })

  // Kopplungsnummer nach erfolgreicher Verknüpfung automatisch entfernen
  setInterval(() => autoClearPairing(ctx), 15_000).unref()
}

process.on('unhandledRejection', (e) => console.error('[admin] Unbehandelter Fehler:', e))
main().catch((e) => {
  console.error('[admin] Start fehlgeschlagen:', (e as Error).message)
  process.exit(1)
})
