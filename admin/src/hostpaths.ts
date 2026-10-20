import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SelfInfo } from './context.js'
import type { DockerApi } from './docker.js'

/**
 * Docker Compose im Container muss dieselben Pfade sehen wie der Docker-Daemon auf dem Host, sonst zeigen relative
 * Bind-Mounts (./outgoing, ./db/init) ins Leere. Deshalb: eigenen Container untersuchen, Host-Pfad des
 * /project-Mounts ermitteln und im Container einen Verweis <host-pfad> -> /project anlegen (ebenso für /secrets).
 */
export async function detectSelf(docker: DockerApi, log: (m: string) => void): Promise<SelfInfo | undefined> {
  const id = process.env.HOSTNAME || os.hostname()
  const r = await docker.docker(['inspect', id], { timeoutMs: 15_000 })
  if (r.code !== 0) {
    log(`Eigener Container nicht gefunden (${r.out.trim().slice(0, 200)}). Läuft die Oberfläche außerhalb von Docker?`)
    return undefined
  }
  let info: any
  try {
    info = JSON.parse(r.out)[0]
  } catch {
    return undefined
  }
  const mounts: { Source: string; Destination: string }[] = info?.Mounts ?? []
  const project = mounts.find((m) => m.Destination === '/project')?.Source
  if (!project) throw new Error('Der Projektordner ist nicht nach /project gemountet (docker-compose.yml prüfen).')
  linkHostPath(project, '/project')
  let secretsHost = mounts.find((m) => m.Destination === '/secrets')?.Source
  if (secretsHost && secretsHost !== project) linkHostPath(secretsHost, '/secrets')
  else secretsHost = undefined
  return { containerId: info.Id, image: info.Config?.Image ?? info.Image, projectHost: project, secretsHost }
}

function linkHostPath(hostPath: string, target: string) {
  if (hostPath === target) return
  try {
    const st = fs.lstatSync(hostPath)
    if (st.isSymbolicLink() && fs.readlinkSync(hostPath) === target) return
    throw new Error(`Pfad ${hostPath} existiert im Container bereits und kann nicht auf ${target} verweisen.`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  fs.mkdirSync(path.dirname(hostPath), { recursive: true })
  fs.symlinkSync(target, hostPath)
}
