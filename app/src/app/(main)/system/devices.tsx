// Paired devices and OAuth clients (Claude and others), with revoke.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Device } from '@jarvis/contract'
import { confirm } from '@/components/confirm'
import { Page, Section } from '@/components/Page'
import { BlockButton, Micro, Notice, Panel } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { useToast } from '@/state/toast'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

export default function Devices() {
  const { t } = useTranslation()
  const { api } = useSession()
  const toast = useToast()
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setDevices((await api.devices()).devices)
    } catch (e) {
      setError(errorText(e))
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])

  const revoke = async (d: Device) => {
    if (!(await confirm(t('devices.revokeConfirm', { name: d.name }), t('devices.revoke'), t('common.cancel')))) return
    try {
      await api.revokeDevice(d.id)
      setDevices((all) => all?.filter((x) => x.id !== d.id) ?? null)
      toast(t('devices.revoked'))
    } catch (e) {
      toast(errorText(e))
    }
  }

  const list = (items: Device[]) =>
    items.length === 0 ? (
      <Text style={type.body}>{t('devices.empty')}</Text>
    ) : (
      <Panel padded={false}>
        {items.map((d, i) => (
          <View key={d.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={[type.bodyItalic, { fontSize: 16 }]}>{d.name}</Text>
                <Micro>{d.platform}</Micro>
              </View>
              <Text style={type.small}>
                {[d.current ? t('devices.current') : null, t('devices.lastSeen', { when: d.lastSeenAt ? ago(d.lastSeenAt) : t('devices.never') }), t('devices.added', { when: ago(d.createdAt) })].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {!d.current ? <BlockButton label={t('devices.revoke')} variant="line" onPress={() => void revoke(d)} style={{ minHeight: 36, paddingHorizontal: 14 }} /> : null}
          </View>
        ))}
      </Panel>
    )

  return (
    <Page title={t('devices.title')} back>
      {error ? <Notice level="error" text={error} /> : null}
      {!devices ? (
        !error ? <Text style={type.sub}>{t('common.loading')}</Text> : null
      ) : (
        <>
          <Section title={t('devices.devices')}>{list(devices.filter((d) => d.kind === 'device'))}</Section>
          <Section title={t('devices.oauth')}>{list(devices.filter((d) => d.kind === 'oauth'))}</Section>
        </>
      )}
    </Page>
  )
}
