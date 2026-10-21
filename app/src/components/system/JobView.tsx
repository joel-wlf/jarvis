// Follows a long-running admin job (apply, restart, relink …) line by line until it ends.
import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AdminApi, Job } from '@/api/admin'
import { clock } from '@/i18n/format'
import { setupTaskProgress } from '@/api/setup-task'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'
import { BlockButton, Micro, Notice, Panel } from '../ui'

const LEVEL_COLOR = { info: colors.ink2, ok: colors.green, warn: '#B9771B', error: colors.warn, out: colors.muted } as const

export function JobView({ admin, job: initial, onEnd }: { admin: AdminApi; job: Job; onEnd?: (j: Job) => void }) {
  const { t } = useTranslation()
  const [details, setDetails] = useState(false)
  const [disconnected, setDisconnected] = useState(false)
  const [job, setJob] = useState<Job>({ ...initial, lines: initial.lines ?? [] })

  useEffect(() => {
    let alive = true
    let since = initial.lines?.length ?? 0
    let lines = initial.lines ?? []
    const tick = async () => {
      try {
        const r = await admin.job(initial.id, since)
        if (!alive) return
        setDisconnected(false)
        lines = [...lines, ...(r.job.lines ?? [])]
        since = r.total
        const next = { ...r.job, lines }
        setJob(next)
        if (next.status !== 'running') {
          onEnd?.(next)
          return
        }
      } catch {
        if (alive) setDisconnected(true)
        // Keep polling across temporary network interruptions.
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
  const lines = job.lines ?? []
  const setup = job.kind === 'setup' || job.kind === 'apply'
  const phases = [t('wizard.task.phase.prepare'), t('wizard.task.phase.install'), t('wizard.task.phase.start'), t('wizard.task.phase.finish')]
  const progress = setupTaskProgress(job)
  const phase = progress.stage
  const error = [...lines].reverse().find((line) => line.level === 'error')
  const status = done ? t(`system.job.${job.status}`) : setup ? phases[phase] : t('system.job.running')

  return (
    <Panel style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <Text style={[type.cardTitle, { flex: 1 }]}>{job.title}</Text>
        <Micro style={{ color: job.status === 'ok' ? colors.green : job.status === 'running' ? colors.faint : colors.warn }}>{t(`system.job.${job.status}`)}</Micro>
      </View>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!done ? <ActivityIndicator size="small" color={colors.ink} /> : null}
          <Text style={type.body} accessibilityLiveRegion="polite">{status}</Text>
        </View>
        {setup ? (
          <View accessibilityRole="progressbar" accessibilityLabel={t('wizard.task.progress')} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress.fraction * 100) }} style={{ height: 6, backgroundColor: colors.line }}>
            <View style={{ height: 6, width: `${Math.max(2, Math.round((job.status === 'ok' ? 1 : progress.fraction) * 100))}%`, backgroundColor: job.status === 'ok' ? colors.green : colors.ink }} />
          </View>
        ) : null}
        {disconnected ? <Notice level="warn" text={t('system.job.disconnected')} /> : null}
        {done && job.status !== 'ok' && error ? <Notice level="warn" text={error.msg} /> : null}
      </View>
      <BlockButton variant="line" label={details ? t('system.job.hideDetails') : t('system.job.showDetails')} onPress={() => setDetails(!details)} />
      {details ? <ScrollView style={{ height: 240, flexGrow: 0 }} nestedScrollEnabled contentContainerStyle={{ gap: 4 }}>
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={[type.tiny, { width: 42 }]}>{clock(l.t)}</Text>
            <Text style={[type.body, { flex: 1, fontSize: 13.5, lineHeight: 19, color: LEVEL_COLOR[l.level] }]}>{l.msg}</Text>
          </View>
        ))}
      </ScrollView> : null}
      {job.status === 'rolled_back' ? <Notice level="warn" text={t('system.job.rolledBackHelp')} /> : null}
    </Panel>
  )
}
