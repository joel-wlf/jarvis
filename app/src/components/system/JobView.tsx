// Follows a long-running admin job (apply, restart, relink …) line by line until it ends.
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AdminApi, Job } from '@/api/admin'
import { clock } from '@/i18n/format'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Micro, Notice, Panel } from '../ui'

const LEVEL_COLOR = { info: colors.ink2, ok: colors.green, warn: '#B9771B', error: colors.warn, out: colors.muted } as const

export function JobView({ admin, job: initial, onEnd }: { admin: AdminApi; job: Job; onEnd?: (j: Job) => void }) {
  const { t } = useTranslation()
  const [job, setJob] = useState<Job>({ ...initial, lines: initial.lines ?? [] })

  useEffect(() => {
    let alive = true
    let since = initial.lines?.length ?? 0
    let lines = initial.lines ?? []
    const tick = async () => {
      try {
        const r = await admin.job(initial.id, since)
        if (!alive) return
        lines = [...lines, ...(r.job.lines ?? [])]
        since = r.total
        const next = { ...r.job, lines }
        setJob(next)
        if (next.status !== 'running') {
          onEnd?.(next)
          return
        }
      } catch {
        // keep polling; the admin service may be restarting itself
      }
      if (alive) setTimeout(() => void tick(), 1000)
    }
    void tick()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, initial.id])

  const done = job.status !== 'running'
  return (
    <Panel style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text style={[type.cardTitle, { flex: 1 }]}>{job.title}</Text>
        <Micro style={{ color: job.status === 'ok' ? colors.green : job.status === 'running' ? colors.faint : colors.warn }}>{t(`system.job.${job.status}`)}</Micro>
      </View>
      <View style={{ gap: 4 }} accessibilityLiveRegion="polite">
        {(job.lines ?? []).map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={[type.tiny, { width: 42 }]}>{clock(l.t)}</Text>
            <Text style={[type.body, { flex: 1, fontSize: 13.5, lineHeight: 19, color: LEVEL_COLOR[l.level] }]}>{l.msg}</Text>
          </View>
        ))}
        {!done ? <Text style={type.small}>…</Text> : null}
      </View>
      {job.status === 'rolled_back' ? <Notice level="warn" text={t('system.job.rolledBackHelp')} /> : null}
    </Panel>
  )
}
