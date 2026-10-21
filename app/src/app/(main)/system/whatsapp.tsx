// WhatsApp linking: current state, the QR code or pairing code while linking, and a guarded relink.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { RELINK_WORD, type Job, type WaLink } from '@/api/admin'
import { Page, Section } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { JobView } from '@/components/system/JobView'
import { BlockButton, Field, Notice, Panel, Press, Toggle } from '@/components/ui'
import { useRouter } from 'expo-router'
import { getItem, setItem } from '@/state/storage'
import { ago, errorText } from '@/i18n/format'
import { colors, fonts } from '@/theme/tokens'
import { type } from '@/theme/type'

const ACK_KEY = 'jarvis.waAck'

export default function WhatsApp() {
  const { t } = useTranslation()
  return (
    <Page title={t('wa.title')} back>
      <AdminGate>
        <Link />
      </AdminGate>
    </Page>
  )
}

function Link() {
  const { t } = useTranslation()
  const { admin } = useAdmin()
  const router = useRouter()
  // null while reading, then whether the owner has already acknowledged the unofficial connection
  const [acked, setAcked] = useState<boolean | null>(null)
  const [tick, setTick] = useState(false)
  useEffect(() => {
    void getItem(ACK_KEY).then((v) => setAcked(v === '1'))
  }, [])
  const [wa, setWa] = useState<WaLink | null>(null)
  const [phone, setPhone] = useState('')
  const [confirmWord, setConfirmWord] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setWa(await admin.wa())
    } catch (e) {
      setError(errorText(e))
    }
  }, [admin])

  // Poll quickly while a code is on screen, slowly otherwise.
  useEffect(() => {
    void load()
    const linking = wa?.state === 'qr' || wa?.state === 'pairing' || wa?.state === 'starting'
    const timer = setInterval(() => void load(), linking ? 2_000 : 10_000)
    return () => clearInterval(timer)
  }, [load, wa?.state])

  const relink = async () => {
    setBusy(true)
    setError(null)
    try {
      setJob(await admin.relink(confirmWord, phone || undefined))
      setConfirmWord('')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!wa) return error ? <Notice level="error" text={error} /> : <Text style={type.sub}>{t('common.loading')}</Text>
  return (
    <>
      <Panel style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 8, height: 8, backgroundColor: wa.state === 'open' ? colors.green : wa.state === 'qr' || wa.state === 'pairing' || wa.state === 'starting' ? '#E39A2D' : colors.warn }} />
          <Text style={[type.cardTitle, { flex: 1 }]}>{t(`wa.state.${wa.state}`)}</Text>
        </View>
        <Text style={type.small}>{[wa.user ? t('wa.as', { user: wa.user }) : null, wa.at ? ago(wa.at) : null].filter(Boolean).join(' · ')}</Text>
        {wa.error ? <Notice level="error" text={wa.error} /> : null}
      </Panel>

      {acked === false ? (
        <Panel style={{ gap: 16 }}>
          <Text style={type.body}>{t('wa.ackLead')}</Text>
          <Toggle label={t('wa.ack')} value={tick} onChange={setTick} />
          <Press onPress={() => router.push('/legal')} accessibilityRole="link" style={() => ({ alignSelf: 'flex-start' })}>
            <Text style={[type.small, { color: colors.ink, textDecorationLine: 'underline' }]}>{t('connect.legalLink')}</Text>
          </Press>
          <BlockButton
            label={t('wa.ackConfirm')}
            disabled={!tick}
            onPress={() => {
              void setItem(ACK_KEY, '1')
              setAcked(true)
            }}
          />
        </Panel>
      ) : null}

      {acked && wa.state === 'qr' ? (
        <Panel style={{ gap: 14, alignItems: 'center' }}>
          {wa.qrSvg ? <SvgXml xml={wa.qrSvg} width={240} height={240} /> : null}
          <Text style={[type.body, { textAlign: 'center' }]}>{wa.expired ? t('wa.qrExpired') : t('wa.qrHelp')}</Text>
        </Panel>
      ) : null}
      {acked && wa.state === 'pairing' && wa.pairingCode ? (
        <Panel style={{ gap: 12, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.thin, fontSize: 44, letterSpacing: 4, color: colors.ink }} selectable>
            {wa.pairingCode}
          </Text>
          <Text style={[type.body, { textAlign: 'center' }]}>{t('wa.pairingHelp')}</Text>
        </Panel>
      ) : null}

      {job ? <JobView admin={admin} job={job} onEnd={() => void load()} /> : null}

      {acked ? <Section title={t('wa.relink')}>
        <Panel style={{ gap: 16 }}>
          <Text style={type.body}>{t('wa.relinkLead')}</Text>
          <Field label={t('wa.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+49…" />
          <Field label={t('wa.confirm', { word: RELINK_WORD })} value={confirmWord} onChangeText={setConfirmWord} autoCapitalize="characters" autoCorrect={false} />
          {error ? <Notice level="error" text={error} /> : null}
          <BlockButton label={t('wa.start')} busy={busy} disabled={confirmWord.trim().toUpperCase() !== RELINK_WORD} onPress={() => void relink()} />
        </Panel>
      </Section> : null}
    </>
  )
}
