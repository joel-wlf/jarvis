// First-run setup as calm full-screen steps: welcome, access, database, name, AI provider, models, privacy, features, remote, review.
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
import { BlockButton, Choice, Field, Micro, Notice, Press, Toggle } from '@/components/ui'
import { MODEL_ROLES, PROVIDERS, detectProvider, formatUsd, monthlyCost, providerById, providerChanges, type ProviderId } from '@/components/system/providers'
import { errorText } from '@/i18n/format'
import { colors, fonts, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

type Step = 'welcome' | 'consent' | 'account' | 'database' | 'name' | 'provider' | 'models' | 'privacy' | 'features' | 'remote' | 'review'
// Steps that are plain setting fields; provider, models and features have their own controls.
const KEYS: Partial<Record<Step, string[]>> = {
  database: ['POSTGRES_PASSWORD', 'MCP_RO_PASSWORD'],
  name: ['OWNER_NAME', 'OWN_NAMES'],
  privacy: ['ORGANIZER_EXCLUDE_NAMES', 'ORGANIZER_REDACT'],
  remote: ['CLOUDFLARE_TUNNEL_TOKEN', 'MCP_PUBLIC_HOST', 'APP_PUBLIC_URL'],
}
const FEATURES = ['ORGANIZER_ENABLED', 'IMAGE_DESCRIBE', 'ENABLE_ACTIONS', 'REQUIRE_CONFIRM', 'ENABLE_MEMORY'] as const

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
  const [hasOldDb, setHasOldDb] = useState(false)
  const [provider, setProvider] = useState<ProviderId | null>(null)
  const steps: Step[] = [
    'welcome',
    'consent',
    ...(state.configured ? [] : (['account'] as Step[])),
    ...(hasOldDb ? (['database'] as Step[]) : []),
    'name',
    'provider',
    ...(provider === 'none' ? [] : (['models'] as Step[])),
    'privacy',
    'features',
    'remote',
    'review',
  ]
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
  const [ack, setAck] = useState({ whatsapp: false, ai: false })

  useEffect(() => {
    if (!state.loggedIn || settings) return
    void admin.settings().then((s) => {
      setSettings(s)
      setProvider((p) => p ?? detectProvider(s.values.OPENAI_BASE_URL, !!s.secrets.OPENAI_API_KEY?.set))
    }).catch((e) => setError(errorText(e)))
    void admin.setupInfo().then((x) => setHasOldDb(x.pgdataExists)).catch(() => {})
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
  const value = (key: string) => changes[key] ?? settings?.values[key] ?? field(key)?.default ?? ''
  const set = (patch: Record<string, string>) => setChanges((c) => ({ ...c, ...patch }))

  const chooseProvider = (id: ProviderId) => {
    const p = providerById(id)
    setProvider(id)
    setTest(null)
    const models: Record<string, string> = {}
    for (const r of MODEL_ROLES) if (p.models[r.key][0]) models[r.key] = p.models[r.key][0]!
    set({ ...providerChanges(p), ...models })
  }
  const p = provider ? providerById(provider) : null
  const keySet = !!changes.OPENAI_API_KEY || !!settings?.secrets.OPENAI_API_KEY?.set
  const providerReady = !!p && (p.id === 'none' || ((!p.key || keySet) && (p.id !== 'custom' || /^https?:\/\//.test(value('OPENAI_BASE_URL')))))

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
  const runTest = () => {
    setBusy(true)
    void admin
      .testOpenAi(changes.OPENAI_API_KEY || undefined, value('OPENAI_BASE_URL') || undefined)
      .then(setTest)
      .catch((e) => setTest({ ok: false, message: errorText(e) }))
      .finally(() => setBusy(false))
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

  const title = t(`setup.steps.${step}.title`)
  const lead = t(`setup.steps.${step}.lead`)
  const canContinue = step === 'provider' ? providerReady : step === 'consent' ? ack.whatsapp && ack.ai : true

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

      {step === 'consent' ? (
        <View style={{ gap: 16 }}>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
            {(['whatsapp', 'ai'] as const).map((k) => (
              <Press
                key={k}
                onPress={() => setAck((a) => ({ ...a, [k]: !a[k] }))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: ack[k] }}
                style={({ hovered }) => [st.option, { alignItems: 'flex-start', backgroundColor: hovered ? colors.ground2 : 'transparent' }]}
              >
                <View style={[st.radio, { marginTop: 2 }, ack[k] && { borderColor: colors.ink, backgroundColor: colors.ink }]}>{ack[k] ? <Icon name="check" size={14} color={colors.blockInk} /> : null}</View>
                <Text style={[type.body, { flex: 1, lineHeight: 22 }]}>{t(`setup.consent.${k}`)}</Text>
              </Press>
            ))}
          </View>
          <Text style={type.small}>{t('setup.consent.responsibility')}</Text>
          <Press onPress={() => router.push('/legal' as never)} accessibilityRole="link" style={() => ({ alignSelf: 'flex-start' })}>
            <Text style={[type.bodyItalic, { textDecorationLine: 'underline' }]}>{t('setup.consent.legal')}</Text>
          </Press>
        </View>
      ) : null}

      {step === 'account' ? (
        <View style={{ gap: 16 }}>
          <Field label={t('setup.code')} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
          <Field label={t('setup.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        </View>
      ) : null}

      {step === 'provider' && settings ? (
        <View style={{ gap: 18 }}>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line }} accessibilityRole="radiogroup" accessibilityLabel={t('setup.steps.provider.title')}>
            {PROVIDERS.map((x) => {
              const on = x.id === provider
              return (
                <Press
                  key={x.id}
                  onPress={() => chooseProvider(x.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={({ hovered }) => [st.option, { backgroundColor: on ? colors.card : hovered ? colors.ground2 : 'transparent' }]}
                >
                  <View style={[st.radio, on && { borderColor: colors.ink }]}>{on ? <View style={st.radioDot} /> : null}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[type.bodyItalic, { fontSize: 17 }]}>{t(`setup.providers.${x.id}.name`)}</Text>
                    <Text style={type.small}>{t(`setup.providers.${x.id}.desc`)}</Text>
                  </View>
                </Press>
              )
            })}
          </View>
          {p && p.id !== 'none' ? (
            <View style={{ gap: 16 }}>
              <Text style={type.small}>{t('setup.consent.providerNote', { provider: t(`setup.providers.${p.id}.name`) })}</Text>
              {p.id === 'custom' || p.id === 'ollama' ? (
                <Field label={t('setup.baseUrl')} help={t(p.id === 'ollama' ? 'setup.baseUrlOllama' : 'setup.baseUrlHelp')} value={value('OPENAI_BASE_URL')} onChangeText={(v) => set({ OPENAI_BASE_URL: v.trim() })} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              ) : null}
              {p.key ? (
                <Field label={t('setup.apiKey')} help={p.keyUrl ? t('setup.keyWhere', { url: p.keyUrl }) : undefined} value={changes.OPENAI_API_KEY ?? ''} placeholder={settings.secrets.OPENAI_API_KEY?.set ? t('settings.secretSet', { hint: settings.secrets.OPENAI_API_KEY.hint ?? '' }) : ''} onChangeText={(v) => set({ OPENAI_API_KEY: v.trim() })} secureTextEntry autoCapitalize="none" autoCorrect={false} />
              ) : null}
              {p.key ? <BlockButton label={t('setup.test')} variant="line" busy={busy} disabled={!keySet} onPress={runTest} /> : null}
              {test ? <Notice level={test.ok ? 'ok' : 'error'} text={test.message} /> : null}
              {!p.audioAndEmbeddings ? <Notice level="info" text={t('setup.localServices')} /> : null}
            </View>
          ) : p?.id === 'none' ? (
            <Notice level="info" text={t('setup.noAi')} />
          ) : null}
        </View>
      ) : null}

      {step === 'models' && p ? (
        <View style={{ gap: 22 }}>
          {MODEL_ROLES.map((r) => {
            const cur = value(r.key)
            const presets = p.models[r.key]
            const custom = !presets.includes(cur)
            return (
              <View key={r.key} style={{ gap: 10, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                <View style={{ gap: 2 }}>
                  <Text style={[type.bodyItalic, { fontSize: 17 }]}>{t(`setup.roles.${r.i18n}.title`)}</Text>
                  <Text style={type.small}>{t(`setup.roles.${r.i18n}.desc`)}</Text>
                </View>
                {presets.length ? (
                  <Choice label={t('setup.suggested')} options={[...presets.map((m) => ({ value: m, label: m })), { value: '__custom', label: t('setup.otherModel') }]} value={custom ? '__custom' : cur} onChange={(v) => set({ [r.key]: v === '__custom' ? '' : v })} />
                ) : null}
                {custom || !presets.length ? <Field label={t('setup.modelId')} value={cur} onChangeText={(v) => set({ [r.key]: v.trim() })} autoCapitalize="none" autoCorrect={false} /> : null}
                <CostLine cost={monthlyCost(p.id, r.key, cur)} />
              </View>
            )
          })}
          <CostTotal costs={MODEL_ROLES.map((r) => monthlyCost(p.id, r.key, value(r.key)))} />
          <Text style={type.small}>{t('setup.modelsNote')}</Text>
        </View>
      ) : null}

      {step === 'features' && settings ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
          {FEATURES.filter((k) => provider !== 'none' || (k !== 'ORGANIZER_ENABLED' && k !== 'IMAGE_DESCRIBE')).map((k) => (
            <View key={k} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Toggle label={t(`setup.features.${k}.title`)} help={t(`setup.features.${k}.desc`)} value={value(k) === 'true'} onChange={(v) => set({ [k]: String(v) })} />
            </View>
          ))}
        </View>
      ) : null}

      {KEYS[step] && settings ? (
        <View style={{ gap: 18 }}>
          {KEYS[step]!.map((k) => {
            const f = field(k)
            if (!f) return null
            return <SettingInput key={k} f={f} value={changes[k] ?? (f.type === 'secret' ? '' : (settings.values[k] ?? ''))} secret={settings.secrets[k]} onChange={(v) => setChanges((c) => ({ ...c, [k]: v }))} />
          })}
        </View>
      ) : (KEYS[step] || step === 'provider' || step === 'features') && !settings ? (
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
        ) : (
          <BlockButton label={t('common.continue')} disabled={!canContinue} onPress={next} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  )
}

function CostLine({ cost }: { cost: number | null }) {
  const { t, i18n } = useTranslation()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Micro>{t('setup.cost.perMonth')}</Micro>
      <Text style={type.bodyItalic}>{cost === null ? t('setup.cost.unknown') : `≈ ${formatUsd(cost, i18n.language)}`}</Text>
    </View>
  )
}

/** Black slab with the monthly total, the same visual weight as a card's primary action. */
function CostTotal({ costs }: { costs: (number | null)[] }) {
  const { t, i18n } = useTranslation()
  const known = costs.filter((c): c is number => c !== null)
  const sum = known.reduce((a, b) => a + b, 0)
  return (
    <View style={st.total}>
      <View style={{ gap: 2 }}>
        <Text style={[type.small, { color: colors.blockInk, opacity: 0.7 }]}>{t('setup.cost.total')}</Text>
        <Text style={st.totalBig}>≈ {formatUsd(sum, i18n.language)}</Text>
      </View>
      <Text style={[type.small, { color: colors.blockInk, opacity: 0.7, flex: 1, textAlign: 'right' }]}>
        {known.length < costs.length ? t('setup.cost.partial') : t('setup.cost.basis')}
      </Text>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: layout.gutter, paddingBottom: 6 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  col: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: layout.gutter, paddingTop: 8, gap: 22 },
  title: { fontFamily: fonts.light, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: colors.ink },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  radio: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, backgroundColor: colors.ink },
  total: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.block, paddingVertical: 14, paddingHorizontal: 18 },
  totalBig: { fontFamily: fonts.light, fontSize: 26, color: colors.blockInk, letterSpacing: -0.4 },
})
