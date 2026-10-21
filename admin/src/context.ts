import path from 'node:path'
import type { DbAccess } from './db.js'
import type { DockerApi } from './docker.js'
import { readEnvFile, resolveEnvPath } from './envfile.js'
import type { JobRunner } from './jobs.js'

export interface SelfInfo {
  containerId: string
  image: string
  /** Host-Pfad des Projektordners */
  projectHost: string
  /** Host-Pfad von JARVIS_SECRETS_DIR, falls gesetzt und anders als das Projekt */
  secretsHost?: string
}

export interface Ctx {
  envPath: string
  dataDir: string
  docker: DockerApi
  db: DbAccess
  jobs: JobRunner
  waStatusFile: string
  self?: SelfInfo
  healthTimeoutMs: number
  pollMs: number
  /** So lange müssen alle Dienste ununterbrochen gesund sein */
  stableMs: number
  fallbackOwner?: { uid: number; gid: number }
  fake: boolean
}

export const backupDir = (ctx: Ctx) => path.join(path.dirname(resolveEnvPath(ctx.envPath)), '.env-backups')

export const readCurrent = (ctx: Ctx) => readEnvFile(ctx.envPath)

/** Alle Geheimnisse aus .env, damit sie in Logs und Protokollen geschwärzt werden. */
export function secretValues(ctx: Ctx): string[] {
  try {
    const { env } = readCurrent(ctx)
    return ['POSTGRES_PASSWORD', 'MCP_RO_PASSWORD', 'MCP_TOKEN', 'OPENAI_API_KEY', 'CLOUDFLARE_TUNNEL_TOKEN', 'ADMIN_INTERNAL_SECRET']
      .map((k) => env[k])
      .filter((v): v is string => !!v && v.length >= 8)
  } catch {
    return []
  }
}

export function makeRedactor(getSecrets: () => string[]) {
  return (s: string) => {
    let out = s
    for (const v of getSecrets()) out = out.split(v).join('••••')
    return out
      .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-••••')
      .replace(/eyJ[A-Za-z0-9+/=_-]{40,}/g, 'eyJ••••')
      .replace(/(postgres:\/\/[^:\s]+:)[^@\s]+@/g, '$1••••@')
      .replace(/\/t\/[A-Za-z0-9_-]{16,}\//g, '/t/••••/')
  }
}
