// System overview: services, WhatsApp, database and storage at a glance, then the admin areas.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import Constants from 'expo-constants'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { API_VERSION, type ServerInfo } from '@jarvis/contract'
import type { StatusResponse } from '@/api/admin'
import { fetchInfo } from '@/api/client'
import { Page, Section } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { BlockButton, Meta, Notice, Panel, Row } from '@/components/ui'
import { ago, bytes, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

export default function System() {
  const { t } = useTranslation()
  return (
    <Page title={t('system.title')} sub={t('system.sub')}>
      <AdminGate>
        <Overview />
      </AdminGate>
    </Page>
  )
}

function ServiceRow({ name, state, health, first }: { name: string; state: string; health: string; first: boolean }) {
  const { t } = useTranslation()
  const ok = state === 'running' && health !== 'unhealthy'
  const label = state !== 'running' ? t('system.stopped') : health === 'unhealthy' ? t('system.unhealthy') : t('system.running')
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 }, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <View style={{ width: 6, height: 6, backgroundColor: ok ? colors.green : colors.warn }} />
      <Text style={[type.bodyItalic, { flex: 1 }]}>{name}</Text>
      <Text style={[type.small, !ok && { color: colors.warn }]}>{label}</Text>
    </View>
  )
}

function Overview() {
  const { t } = useTranslation()
  const router = useRouter()
  const { admin } = useAdmin()
  const { session, signOut } = useSession()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<ServerInfo | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setStatus(await admin.status())
    } catch (e) {
      setError(errorText(e))
    }
  }, [admin])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => clearInterval(timer)
  }, [load])
  useEffect(() => {
    if (session?.mode === 'live') void fetchInfo(session.baseUrl).then(setInfo).catch(() => {})
  }, [session])

  const areas: { href: Href; title: string; sub: string }[] = [
    { href: '/system/settings', title: t('system.settings'), sub: t('system.settingsSub') },
    { href: '/system/whatsapp', title: t('system.wa'), sub: t('system.waSub') },
    { href: '/system/devices', title: t('system.devices'), sub: t('system.devicesSub') },
    { href: '/system/logs', title: t('system.logs'), sub: t('system.logsSub') },
    { href: '/system/maintenance', title: t('system.maintenance'), sub: t('system.maintenanceSub') },
    { href: '/setup', title: t('system.setup'), sub: t('system.setupSub') },
  ]

  return (
    <>
      <Section title={t('system.status')}>
        {error ? <Notice level="error" text={error} /> : null}
        {!status ? (
          <Text style={type.sub}>{t('common.loading')}</Text>
        ) : (
          <>
            <Panel>
              <Meta
                stats={[
                  { label: t('system.messages'), value: status.db ? status.db.messages.toLocaleString() : '–' },
                  { label: t('system.pending'), value: status.db ? String((status.db.embedPending ?? 0) + (status.db.audioPending ?? 0) + (status.db.outboxPending ?? 0)) : '–' },
                  { label: t('system.tokens'), value: status.db?.tokensToday != null ? `${Math.round(status.db.tokensToday / 1000)}k` : '–' },
                ]}
              />
            </Panel>
            <Panel style={{ paddingVertical: 8 }}>
              <ServiceRow first name={t('system.whatsapp')} state={status.wa.state === 'open' ? 'running' : 'exited'} health="" />
              {status.services.map((s) => (
                <ServiceRow key={s.service} name={s.service} state={s.state} health={s.health} first={false} />
              ))}
              {status.servicesError ? <Notice level="error" text={status.servicesError} /> : null}
            </Panel>
            {status.disk ? <Text style={type.small}>{`${t('system.disk')}: ${t('system.diskFree', { free: bytes(status.disk.free), total: bytes(status.disk.total) })}`}</Text> : null}
            {status.db?.lastMessage ? <Text style={type.small}>{t('today.modules.last', { source: ago(status.db.lastMessage) })}</Text> : null}
            {status.checks.map((c) => (
              <Notice key={c.message} level={c.level} text={c.message} />
            ))}
          </>
        )}
      </Section>

      <Section title={t('system.areas')}>
        <Panel padded={false}>
          {areas.map((a, i) => (
            <Row key={a.title} first={i === 0} title={a.title} sub={a.sub} onPress={() => router.push(a.href)} />
          ))}
        </Panel>
      </Section>

      <Section title={t('system.versions')}>
        <Panel>
          <Meta
            stats={[
              { label: t('system.appVersion'), value: Constants.expoConfig?.version ?? '–' },
              { label: t('system.serverVersion'), value: session?.mode === 'mock' ? t('common.demo') : (info?.version ?? '–') },
              { label: t('system.apiVersion'), value: `v${info?.apiVersion ?? API_VERSION}` },
            ]}
          />
        </Panel>
      </Section>

      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <BlockButton
          label={t('system.logout')}
          variant="line"
          onPress={() =>
            void admin
              .logout()
              .catch(() => {})
              .then(() => router.replace('/'))
          }
        />
        <BlockButton label={t('common.signOut')} variant="line" onPress={() => void signOut()} />
      </View>
    </>
  )
}
