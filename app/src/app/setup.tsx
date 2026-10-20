// First-run setup, redesigned as calm full-screen steps: welcome, access, name, AI, remote, review.
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Job, PreviewResponse, SettingsResponse } from '@/api/admin'
import { Icon } from '@/components/Icon'
import { JarvisFigure } from '@/components/jarvis/JarvisFigure'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { JobView } from '@/components/system/JobView'
import { SettingInput } from '@/components/system/SettingInput'
import { BlockButton, Field, Micro, Notice, Press } from '@/components/ui'
import { errorText } from '@/i18n/format'
import { colors, fonts, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

type Step = 'welcome' | 'account' | 'name' | 'ai' | 'remote' | 'review'
const KEYS: Partial<Record<Step, string[]>> = { name: ['OWNER_NAME', 'OWN_NAMES'], ai: ['OPENAI_API_KEY'], remote: ['CLOUDFLARE_TUNNEL_TOKEN', 'MCP_PUBLIC_HOST'] }

export default function Setup() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { t } = useTranslation()
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[st.bar, { paddingTop: Math.max(12, insets.top) }]}>
        <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/system'))} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} style={({ hovered }) => [st.close, hovered && { backgroundColor: colors.card }]}>
          <Icon name="x" size={18} color={colors.ink2} />
        </Press>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={st.col}>
          <AdminGate allowUnconfigured>
            <Wizard />
          </AdminGate>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Wizard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { admin, state, refresh } = useAdmin()
  const steps: Step[] = state.configured ? ['welcome', 'name', 'ai', 'remote', 'review'] : ['welcome', 'account', 'name', 'ai', 'remote', 'review']
  const [i, setI] = useState(0)
  const step = steps[Math.min(i, steps.length - 1)]!
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [finished, setFinished] = useState<Job | null>(null)
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (state.loggedIn && !settings) void admin.settings().then(setSettings).catch((e) => setError(errorText(e)))
  }, [admin, state.loggedIn, settings])
  useEffect(() => {
    if (step === 'review') {
      setPreview(null)
      void admin.preview(changes, true).then(setPreview).catch((e) => setError(errorText(e)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (state.initialized && !job && !finished) {
    return (
      <View style={{ gap: 20, paddingTop: 24 }}>
        <Text style={type.h1}>{t('setup.welcome')}</Text>
        <Notice level="info" text={t('setup.already')} />
        <BlockButton label={t('system.settings')} onPress={() => router.replace('/system/settings')} />
      </View>
    )
  }

  const next = () => {
    setError(null)
    setI((n) => Math.min(n + 1, steps.length - 1))
  }
  const back = () => {
    setError(null)
    setI((n) => Math.max(0, n - 1))
  }
  const field = (key: string) => settings?.fields.find((f) => f.key === key)

  const account = async () => {
    setBusy(true)
    setError(null)
    try {
      await admin.setup(code.trim(), password)
      await refresh()
      next()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      setJob(await admin.apply(changes, true))
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  const titles: Record<Step, [string, string]> = {
    welcome: [t('setup.welcome'), t('setup.welcomeLead')],
    account: [t('setup.account'), t('setup.accountLead')],
    name: [t('setup.name'), t('setup.nameLead')],
    ai: [t('setup.ai'), t('setup.aiLead')],
    remote: [t('setup.remote'), t('setup.remoteLead')],
    review: [t('setup.review'), t('setup.reviewLead')],
  }

  if (job || finished) {
    const ok = finished?.status === 'ok'
    return (
      <View style={{ gap: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <JarvisFigure state={!finished ? 'thinking' : ok ? 'happy' : 'error'} size={150} />
        </View>
        <Text style={type.h1}>{t('setup.running')}</Text>
        {job ? <JobView admin={admin} job={job} onEnd={(j) => { setFinished(j); setBusy(false) }} /> : null}
        {ok ? (
          <>
            <Text style={[type.voice, { textAlign: 'left' }]}>{t('setup.done')}</Text>
            <BlockButton label={t('setup.toWa')} onPress={() => router.replace('/system/whatsapp')} />
          </>
        ) : null}
      </View>
    )
  }

  const [title, lead] = titles[step]
  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 10 }}>
        <Micro>{t('setup.step', { n: i + 1, total: steps.length })}</Micro>
        <View style={{ flexDirection: 'row', gap: 4 }} aria-hidden>
          {steps.map((s, k) => (
            <View key={s} style={{ flex: 1, height: 2, backgroundColor: k <= i ? colors.ink : colors.line2 }} />
          ))}
        </View>
      </View>
      {step === 'welcome' ? (
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <JarvisFigure state="idle" size={170} />
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        <Text style={st.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[type.body, { fontSize: 15.5, lineHeight: 23 }]}>{lead}</Text>
      </View>

      {step === 'account' ? (
        <View style={{ gap: 16 }}>
          <Field label={t('setup.code')} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
          <Field label={t('setup.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        </View>
      ) : null}

      {KEYS[step] && settings ? (
        <View style={{ gap: 18 }}>
          {KEYS[step]!.map((k) => {
            const f = field(k)
            if (!f) return null
            return <SettingInput key={k} f={f} value={changes[k] ?? (f.type === 'secret' ? '' : (settings.values[k] ?? ''))} secret={settings.secrets[k]} onChange={(v) => setChanges((c) => ({ ...c, [k]: v }))} />
          })}
          {step === 'ai' ? (
            <>
              <BlockButton
                label={t('setup.test')}
                variant="line"
                busy={busy}
                disabled={!changes.OPENAI_API_KEY && !settings.secrets.OPENAI_API_KEY?.set}
                onPress={() => {
                  setBusy(true)
                  void admin
                    .testOpenAi(changes.OPENAI_API_KEY || undefined)
                    .then(setTest)
                    .catch((e) => setTest({ ok: false, message: errorText(e) }))
                    .finally(() => setBusy(false))
                }}
              />
              {test ? <Notice level={test.ok ? 'ok' : 'error'} text={test.message} /> : null}
            </>
          ) : null}
        </View>
      ) : KEYS[step] ? (
        <Text style={type.sub}>{t('common.loading')}</Text>
      ) : null}

      {step === 'review' ? (
        !preview ? (
          <Text style={type.sub}>{t('common.loading')}</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {preview.diff.map((d) => (
              <View key={d.key} style={{ paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 2 }}>
                <Micro>{field(d.key)?.label ?? d.key}</Micro>
                <Text style={type.bodyItalic}>{d.to || '–'}</Text>
              </View>
            ))}
            {Object.entries(preview.errors).map(([k, m]) => (
              <Notice key={k} level="error" text={`${field(k)?.label ?? k}: ${m}`} />
            ))}
            {preview.checks.map((c) => (
              <Notice key={c.message} level={c.level} text={c.message} />
            ))}
          </View>
        )
      ) : null}

      {error ? <Notice level="error" text={error} /> : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {i > 0 ? <BlockButton label={t('common.back')} variant="line" onPress={back} style={{ flex: 1 }} /> : null}
        {step === 'welcome' ? (
          <BlockButton label={t('setup.start')} onPress={next} style={{ flex: 1 }} />
        ) : step === 'account' ? (
          <BlockButton label={t('common.continue')} busy={busy} disabled={!code.trim() || password.length < 8} onPress={() => void account()} style={{ flex: 1 }} />
        ) : step === 'review' ? (
          <BlockButton label={t('setup.finish')} busy={busy} disabled={!preview || Object.keys(preview.errors).length > 0} onPress={() => void finish()} style={{ flex: 1 }} />
        ) : step === 'ai' && !changes.OPENAI_API_KEY ? (
          <BlockButton label={t('setup.skip')} onPress={next} style={{ flex: 1 }} />
        ) : (
          <BlockButton label={t('common.continue')} onPress={next} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: layout.gutter, paddingBottom: 6 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  col: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: 8, gap: 22 },
  title: { fontFamily: fonts.light, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: colors.ink },
})
