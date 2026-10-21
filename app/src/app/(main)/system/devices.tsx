// Paired devices and OAuth clients (Claude and others), with revoke.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import type { PairingCode } from '@/api/admin'
import { useTranslation } from 'react-i18next'
import type { Device } from '@jarvis/contract'
import { confirm } from '@/components/confirm'
import { Page, Section } from '@/components/Page'
import { BlockButton, Field, Micro, Notice, Panel } from '@/components/ui'
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
      <Pairing />
      {error ? <Notice level="error" text={error} /> : null}
      {!devices ? (
        !error ? <Text style={type.sub}>{t('common.loading')}</Text> : null
      ) : (
        <>
          <Section title={t('devices.devices')}>{list(devices.filter((d) => d.kind === 'device'))}</Section>
          <Section title={t('devices.oauth')}>{list(devices.filter((d) => d.kind === 'oauth'))}</Section>
        </>
      )}
      <OwnerPassword />
    </Page>
  )
}

/** One-time pairing QR for a new phone or browser; needs the admin interface (home network). */
function Pairing() {
  const { t, i18n } = useTranslation()
  const { admin } = useSession()
  const [code, setCode] = useState<PairingCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!admin) return <Section title={t('devices.pair')}><Text style={type.sub}>{t('devices.pairOnlyHome')}</Text></Section>
  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      setCode(await admin.pairing())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const until = code ? new Date(code.expiresAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <Section title={t('devices.pair')}>
      <Panel>
        <View style={{ gap: 14 }}>
          <Text style={type.body}>{t('devices.pairHelp')}</Text>
          {code ? (
            <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <View style={{ width: 168, height: 168, padding: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }}>
                <SvgXml xml={code.qrSvg} width="100%" height="100%" />
              </View>
              <View style={{ gap: 4, flex: 1, minWidth: 140 }}>
                <Micro>{t('devices.pairCode')}</Micro>
                <Text selectable style={[type.big, { fontSize: 30 }]}>{code.code}</Text>
                <Text style={type.small}>{t('devices.pairExpires', { time: until })}</Text>
              </View>
            </View>
          ) : null}
          {error ? <Notice level="error" text={error} /> : null}
          <BlockButton label={t('devices.pairCreate')} onPress={() => void create()} busy={busy} variant={code ? 'line' : 'block'} />
        </View>
      </Panel>
    </Section>
  )
}

/** The owner password for the app login and the OAuth consent page, set through the admin interface. */
function OwnerPassword() {
  const { t } = useTranslation()
  const { admin } = useSession()
  const toast = useToast()
  const [adminPw, setAdminPw] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!admin) return null
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await admin.ownerPassword(adminPw, pw)
      setAdminPw('')
      setPw('')
      toast(t('devices.ownerSaved'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title={t('devices.owner')}>
      <Panel>
        <View style={{ gap: 14 }}>
          <Text style={type.body}>{t('devices.ownerHelp')}</Text>
          <Field label={t('devices.ownerAdmin')} value={adminPw} onChangeText={setAdminPw} secureTextEntry autoComplete="current-password" />
          <Field label={t('devices.ownerNew')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
          {error ? <Notice level="error" text={error} /> : null}
          <BlockButton label={t('devices.ownerSave')} onPress={() => void save()} busy={busy} disabled={!adminPw || pw.length < 10} />
        </View>
      </Panel>
    </Section>
  )
}
