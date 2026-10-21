// Maintenance: restart a service, rebuild, estimate costs, restore settings backups.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SERVICES, type Backup, type Job } from '@/api/admin'
import { confirm } from '@/components/confirm'
import { Page, Section } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { JobView } from '@/components/system/JobView'
import { BlockButton, Choice, Notice, Panel } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

export default function Maintenance() {
  const { t } = useTranslation()
  return (
    <Page title={t('maintenance.title')} back>
      <AdminGate>
        <Tools />
      </AdminGate>
    </Page>
  )
}

function Tools() {
  const { t } = useTranslation()
  const { admin } = useAdmin()
  const [svc, setSvc] = useState<string>('wa-ingest')
  const [job, setJob] = useState<Job | null>(null)
  const [backups, setBackups] = useState<Backup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadBackups = useCallback(async () => {
    try {
      setBackups(await admin.backups())
    } catch (e) {
      setError(errorText(e))
    }
  }, [admin])
  useEffect(() => {
    void loadBackups()
  }, [loadBackups])

  const run = async (fn: () => Promise<Job>) => {
    setError(null)
    try {
      setJob(await fn())
    } catch (e) {
      setError(errorText(e))
    }
  }
  const running = job?.status === 'running'

  return (
    <>
      {error ? <Notice level="error" text={error} /> : null}
      {job ? <JobView key={job.id} admin={admin} job={job} onEnd={(j) => { setJob(j); void loadBackups() }} /> : null}

      <Section title={t('maintenance.restart')}>
        <Panel style={{ gap: 14 }}>
          <Choice label={t('system.services')} options={SERVICES.filter((s) => s !== 'admin').map((s) => ({ value: s, label: s }))} value={svc} onChange={setSvc} />
          <BlockButton label={t('maintenance.restartOne', { service: svc })} disabled={running} onPress={() => void run(() => admin.restart(svc))} />
        </Panel>
      </Section>

      <Section title={t('maintenance.rebuild')}>
        <Panel style={{ gap: 12 }}>
          <Text style={type.body}>{t('maintenance.rebuildHelp')}</Text>
          <BlockButton label={t('maintenance.rebuild')} variant="line" disabled={running} onPress={() => void run(() => admin.rebuild())} />
        </Panel>
      </Section>

      <Section title={t('maintenance.estimate')}>
        <Panel style={{ gap: 12 }}>
          <Text style={type.body}>{t('maintenance.estimateHelp')}</Text>
          <BlockButton label={t('maintenance.estimate')} variant="line" disabled={running} onPress={() => void run(() => admin.estimate())} />
        </Panel>
      </Section>

      <Section title={t('maintenance.backups')}>
        {!backups ? (
          <Text style={type.sub}>{t('common.loading')}</Text>
        ) : backups.length === 0 ? (
          <Text style={type.body}>{t('maintenance.noBackups')}</Text>
        ) : (
          <Panel padded={false}>
            {backups.map((b, i) => (
              <View key={b.name} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={type.bodyItalic}>{ago(b.at)}</Text>
                  <Text style={type.small} numberOfLines={2}>
                    {t('maintenance.changed', { keys: b.changed.join(', ') || '–' })}
                  </Text>
                </View>
                <BlockButton
                  label={t('maintenance.restore')}
                  variant="line"
                  disabled={running}
                  style={{ minHeight: 36, paddingHorizontal: 14 }}
                  onPress={() =>
                    void confirm(t('maintenance.restoreConfirm', { when: ago(b.at) }), t('maintenance.restore'), t('common.cancel')).then((ok) => { if (ok) void run(() => admin.restore(b.name)) })
                  }
                />
              </View>
            ))}
          </Panel>
        )}
      </Section>
    </>
  )
}
