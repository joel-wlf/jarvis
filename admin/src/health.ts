// Plain-language state of the installation for the system overview: what is wrong, in words an owner without
// technical knowledge understands, and the one action that fixes it. The app holds the texts (health.<id> in its
// locales); this only decides which items apply.
import type { ServiceState } from './docker.js'
import type { Job } from './jobs.js'

export type HealthAction =
  | { kind: 'route'; to: '/system/whatsapp' | '/system/maintenance' | '/system/settings' }
  | { kind: 'restart'; service: string }

export interface HealthItem {
  id: string
  level: 'error' | 'warn'
  /** values for the text, e.g. the service */
  params?: Record<string, string>
  action?: HealthAction
}

export interface HealthInput {
  services: ServiceState[] | null
  wa: { state: string; at?: string }
  disk: { free: number; total: number } | null
  /** the last nightly update, if there was one */
  lastUpdate: Job | null
  now?: number
}

/** A WhatsApp state older than this counts as lasting, not as a short reconnect */
const WA_GRACE_MS = 10 * 60_000
const GB = 1024 ** 3

export function healthItems(i: HealthInput): HealthItem[] {
  const items: HealthItem[] = []
  const now = i.now ?? Date.now()
  const running = (name: string) => i.services?.some((s) => s.service === name && s.state === 'running')

  if (i.services) {
    for (const s of i.services) {
      if (s.service === 'app-web' || s.service === 'admin') continue
      if (s.state !== 'running') items.push({ id: 'serviceDown', level: 'error', params: { service: s.service }, action: { kind: 'restart', service: s.service } })
      else if (s.health === 'unhealthy') items.push({ id: 'serviceUnhealthy', level: 'warn', params: { service: s.service }, action: { kind: 'restart', service: s.service } })
    }
  }

  const lasting = !i.wa.at || now - Date.parse(i.wa.at) > WA_GRACE_MS
  if (i.wa.state === 'logged_out') items.push({ id: 'waLoggedOut', level: 'error', action: { kind: 'route', to: '/system/whatsapp' } })
  else if ((i.wa.state === 'qr' || i.wa.state === 'pairing') && lasting) items.push({ id: 'waNotLinked', level: 'warn', action: { kind: 'route', to: '/system/whatsapp' } })
  else if ((i.wa.state === 'closed' || i.wa.state === 'starting') && lasting && running('wa-ingest')) items.push({ id: 'waDisconnected', level: 'warn', action: { kind: 'route', to: '/system/whatsapp' } })

  if (i.disk && i.disk.total > 0) {
    const share = i.disk.free / i.disk.total
    if (i.disk.free < GB || share < 0.05) items.push({ id: 'diskFull', level: 'error' })
    else if (i.disk.free < 3 * GB || share < 0.15) items.push({ id: 'diskLow', level: 'warn' })
  }

  if (i.lastUpdate && (i.lastUpdate.status === 'failed' || i.lastUpdate.status === 'rolled_back'))
    items.push({ id: 'updateFailed', level: 'warn', action: { kind: 'route', to: '/system/maintenance' } })

  return items.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1))
}
