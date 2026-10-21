import { useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { SettingsField } from '@/api/admin'
import { type } from '@/theme/type'
import { colors } from '@/theme/tokens'
import { Choice, Field, Press, Toggle } from '../ui'
import { ListInput, NumberSlider } from './Controls'

/** One field, rendered by its schema type. Secrets are never shown, only replaced. */
/** Where message content leaves the Pi: the key and provider fields carry a one-line note and the legal link. */
const sendsContent = (f: SettingsField) => f.group === 'ai' && (f.type === 'secret' || /PROVIDER/i.test(f.key))

export function SettingInput(props: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const input = <SettingField {...props} />
  if (!sendsContent(props.f)) return input
  return (
    <View style={{ gap: 6 }}>
      {input}
      <Press onPress={() => router.push('/legal')} accessibilityRole="link" style={() => ({ alignSelf: 'flex-start' })}>
        <Text style={type.small}>
          {t('settings.aiNote')} <Text style={{ color: colors.ink, textDecorationLine: 'underline' }}>{t('connect.legalLink')}</Text>
        </Text>
      </Press>
    </View>
  )
}

interface Props { f: SettingsField; value: string; secret?: { set: boolean; hint?: string }; onChange: (v: string) => void; error?: string }

function SettingField({ f, value, secret, onChange, error }: Props) {
  const { t } = useTranslation()
  if (f.type === 'bool') return <Toggle label={f.label} help={f.help} value={(value || f.default) === 'true'} onChange={(v) => onChange(v ? 'true' : 'false')} />
  if (f.type === 'enum' && f.options) {
    return (
      <View style={{ gap: 6 }}>
        <Choice label={f.label} options={f.options} value={value || f.default} onChange={onChange} />
        <Text style={type.small}>{f.help}</Text>
      </View>
    )
  }
  if (f.type === 'secret') {
    return (
      <Field
        label={`${f.label} · ${secret?.set ? t('settings.secretSet', { hint: secret.hint ?? '••••' }) : t('settings.secretUnset')}`}
        help={f.help}
        error={error}
        value={value}
        onChangeText={onChange}
        placeholder={t('settings.secretNew')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
    )
  }
  if (f.presets?.length) return <PresetInput f={f} value={value} onChange={onChange} error={error} />
  if (f.type === 'list') return <ListInput label={f.label} help={f.help} value={value} placeholder={f.placeholder} onChange={onChange} error={error} />
  const numeric = f.type === 'int' || f.type === 'float'
  // A slider where the range is small enough to pick a value by hand; huge ranges (ports, character limits) stay typed
  if (numeric && f.min !== undefined && f.max !== undefined && f.max - f.min <= 1000) {
    return <NumberSlider label={f.label} help={f.help} value={value} fallback={f.default} min={f.min} max={f.max} int={f.type === 'int'} unit={f.unit} onChange={onChange} error={error} />
  }
  return (
    <Field
      label={f.label}
      help={f.default && !value ? `${f.help} ${t('settings.default', { value: f.default })}` : f.help}
      error={error}
      value={value}
      onChangeText={onChange}
      placeholder={f.placeholder ?? f.default}
      keyboardType={numeric ? 'decimal-pad' : f.type === 'url' ? 'url' : f.type === 'phone' ? 'phone-pad' : 'default'}
      autoCapitalize="none"
      autoCorrect={false}
      maxLength={f.maxLength}
    />
  )
}

/** Common values as choices, and "Other" for anything else that is valid. */
function PresetInput({ f, value, onChange, error }: { f: SettingsField; value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useTranslation()
  const current = value === '' && !f.presets!.some((p) => p.value === '') ? f.default : value
  const known = f.presets!.some((p) => p.value === current)
  const [custom, setCustom] = useState(!known)
  const options = [...f.presets!.map((p) => ({ value: p.value, label: p.value === f.default ? `${p.label} · ${t('settings.recommended')}` : p.label })), { value: '\u0000custom', label: t('settings.custom') }]
  return (
    <View style={{ gap: 8 }}>
      <Choice label={f.label} options={options} value={custom ? '\u0000custom' : current} onChange={(v) => { if (v === '\u0000custom') setCustom(true); else { setCustom(false); onChange(v) } }} />
      {custom ? (
        <Field label={t('settings.customValue')} value={value} onChangeText={onChange} placeholder={f.placeholder ?? f.default} autoCapitalize="none" autoCorrect={false} error={error} help={f.patternHelp} maxLength={f.maxLength} />
      ) : error ? <Text style={[type.small, { color: colors.warn }]}>{error}</Text> : null}
      <Text style={type.small}>{f.help}</Text>
    </View>
  )
}
