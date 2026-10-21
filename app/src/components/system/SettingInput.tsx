import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { SettingsField } from '@/api/admin'
import { type } from '@/theme/type'
import { Choice, Field, Toggle } from '../ui'

/** One field, rendered by its schema type. Secrets are never shown, only replaced. */
export function SettingInput({ f, value, secret, onChange, error }: { f: SettingsField; value: string; secret?: { set: boolean; hint?: string }; onChange: (v: string) => void; error?: string }) {
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
  const numeric = f.type === 'int' || f.type === 'float'
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
