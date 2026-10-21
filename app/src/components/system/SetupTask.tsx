// First-run task screen: operational logs belong in administration, not onboarding.
// A continuous bar with a percentage, the step it is in, and a changing verb so the owner sees that work is happening.
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AdminApi, Job } from '@/api/admin'
import { JarvisError } from '@/api/http'
import { setupTaskProgress } from '@/api/setup-task'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'
import { BlockButton, Notice } from '../ui'

const PHASES = ['prepare', 'install', 'start', 'finish'] as const

export function SetupTask({ admin, job: initial, onEnd, onSessionExpired }: { admin: AdminApi; job: Job; onEnd: (job: Job) => Promise<void>; onSessionExpired: () => void }) {
  const { t } = useTranslation()
  const [job, setJob] = useState(initial)
  const [offline, setOffline] = useState(false)
  const [longWait, setLongWait] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [verb, setVerb] = useState(0)
  const callbacks = useRef({ onEnd, onSessionExpired })
  useEffect(() => { callbacks.current = { onEnd, onSessionExpired } }, [onEnd, onSessionExpired])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      try {
        // Request the bounded full snapshot: line offsets become invalid when the server rotates logs.
        const response = await admin.job(initial.id)
        if (!active) return
        setOffline(false)
        setJob(response.job)
        setLongWait(Date.now() - Date.parse(response.job.startedAt) > 30 * 60_000)
        if (response.job.status !== 'running') {
          await callbacks.current.onEnd(response.job)
          return
        }
      } catch (error) {
        if (!active) return
        if (error instanceof JarvisError && error.status === 401) { callbacks.current.onSessionExpired(); return }
        setOffline(true)
      }
      if (active) timer = setTimeout(() => void tick(), 2500)
    }
    void tick()
    return () => { active = false; clearTimeout(timer) }
  }, [admin, initial.id, attempt])
  // The bar creeps between server signals and the verb changes every few seconds
  useEffect(() => {
    const a = setInterval(() => setNow(Date.now()), 1000)
    const b = setInterval(() => setVerb((v) => v + 1), 2800)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])

  const { fraction, stage, service } = setupTaskProgress(job, now)
  const pct = Math.round(fraction * 100)
  const verbs = t(`wizard.task.verbs.${PHASES[stage]}`, { returnObjects: true }) as unknown
  const list = Array.isArray(verbs) ? (verbs as string[]) : []
  const doing = offline ? t('wizard.task.reconnecting') : list.length ? list[verb % list.length]! : t('wizard.task.working')
  return <View style={{ gap: 24 }}>
    <Text accessibilityRole="header" style={type.h1}>{offline ? t('wizard.task.offlineTitle') : initial.kind === 'relink' ? t('wizard.task.relinkTitle') : initial.kind === 'setup' ? t('wizard.task.setupTitle') : t('wizard.task.applyTitle')}</Text>
    <Text style={type.body}>{offline ? t('wizard.task.offline') : initial.kind === 'relink' ? t('wizard.task.relink') : t(`wizard.task.explain.${PHASES[stage]}`)}</Text>
    {initial.kind !== 'relink' ? <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={[type.body, { flex: 1 }]} accessibilityLiveRegion="polite" numberOfLines={1}>{doing}{service && !offline ? ` · ${service}` : ''}</Text>
        <Text style={[type.big, { fontSize: 24 }]}>{pct} %</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={t('wizard.task.progress')} accessibilityValue={{ min: 0, max: 100, now: pct }} style={st.track}>
        <View style={[st.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: offline ? colors.line2 : colors.ink }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {PHASES.map((p, i) => <Text key={p} style={[type.tiny, { flex: 1, color: i === stage ? colors.ink : i < stage ? colors.ink2 : colors.muted }]}>{i < stage ? '✓ ' : ''}{t(`wizard.task.phase.${p}`)}</Text>)}
      </View>
    </View> : <Text style={[type.body]} accessibilityLiveRegion="polite">{doing}</Text>}
    {longWait && !offline ? <Notice level="info" text={t('wizard.task.long')} /> : null}
    <Text style={type.small}>{t('wizard.task.closeable')}</Text>
    {offline ? <BlockButton label={t('wizard.task.reconnect')} variant="line" onPress={() => setAttempt((n) => n + 1)} /> : null}
  </View>
}

const st = StyleSheet.create({
  track: { height: 8, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8 },
})
