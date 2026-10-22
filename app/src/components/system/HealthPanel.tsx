// The plain-language state at the top of the system overview: either "everything runs", or what is wrong with the
// one action that fixes it. The admin decides which items apply (admin/src/health.ts); the texts live in health.*.
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { AdminApi, HealthItem, Job, StatusResponse } from '@/api/admin'
import { JobView } from '@/components/system/JobView'
import { BlockButton, Notice, Panel } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

export function HealthPanel({ admin, status, onChanged }: { admin: AdminApi; status: StatusResponse; onChanged: () => void }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const items = status.health ?? []
  const service = (name: string) => t(`health.services.${name}`, { defaultValue: name })

  const act = (item: HealthItem) => {
    const a = item.action
    if (!a) return
    if (a.kind === 'route') return router.push(a.to as Href)
    setError(null)
    void admin.restart(a.service).then(setJob).catch((e) => setError(errorText(e)))
  }

  if (!items.length) return (
    <Panel style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 6, height: 6, backgroundColor: colors.green }} />
        <Text style={type.cardTitle}>{t('health.allGood')}</Text>
      </View>
      <Text style={type.small}>
        {status.lastUpdate?.status === 'ok' ? t('health.lastUpdate', { when: ago(status.lastUpdate.at) }) : t('health.allGoodSub')}
      </Text>
    </Panel>
  )

  return (
    <View style={{ gap: 10 }}>
      {items.map((item) => (
        <Panel key={item.id + (item.params?.service ?? '')} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 6, height: 6, backgroundColor: item.level === 'error' ? colors.warn : '#E39A2D' }} />
            <Text style={[type.cardTitle, { flex: 1 }]}>{t(`health.${item.id}.title`, { service: service(item.params?.service ?? '') })}</Text>
          </View>
          <Text style={type.body}>{t(`health.${item.id}.detail`, { service: service(item.params?.service ?? '') })}</Text>
          {item.action ? <BlockButton label={t(`health.${item.id}.action`)} variant="line" disabled={job?.status === 'running'} onPress={() => act(item)} /> : null}
        </Panel>
      ))}
      {error ? <Notice level="error" text={error} /> : null}
      {job ? <JobView key={job.id} admin={admin} job={job} onEnd={(j) => { setJob(j); onChanged() }} /> : null}
    </View>
  )
}
