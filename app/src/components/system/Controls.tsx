// Inputs for non-technical owners: a slider with steppers for numbers, and a chip editor for comma separated lists.
import { useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View, type GestureResponderEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import { colors, fonts } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon } from '../Icon'
import { Micro, Press, s as ui } from '../ui'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Step that gives the slider about a hundred positions, rounded to 1, 2 or 5 times a power of ten. */
export function niceStep(min: number, max: number, int: boolean) {
  const raw = (max - min) / 100
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / p
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
  return int ? Math.max(1, Math.round(step)) : step
}

const fmt = (v: number, step: number) => {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)))
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })
}

export function NumberSlider({ label, help, value, fallback, min, max, int, unit, onChange, error }: {
  label: string; help?: string; value: string; fallback: string; min: number; max: number; int: boolean; unit?: string; onChange: (v: string) => void; error?: string
}) {
  const { t } = useTranslation()
  const step = niceStep(min, max, int)
  const current = Number(value !== '' ? value : fallback !== '' ? fallback : min)
  const v = Number.isFinite(current) ? clamp(current, min, max) : min
  const width = useRef(0)
  const set = (n: number) => {
    const snapped = clamp(Math.round((n - min) / step) * step + min, min, max)
    onChange(int ? String(Math.round(snapped)) : String(Number(snapped.toFixed(4))))
  }
  const fromTouch = (e: GestureResponderEvent) => {
    if (width.current > 0) set(min + (clamp(e.nativeEvent.locationX, 0, width.current) / width.current) * (max - min))
  }
  const f = (v - min) / (max - min || 1)
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={[type.bodyItalic, { flex: 1 }]}>{label}</Text>
        <Text style={[type.big, { fontSize: 20 }]}>
          {value === '' && fallback === '' ? t('settings.auto') : fmt(v, step)}
          {unit && !(value === '' && fallback === '') ? <Text style={type.small}> {unit}</Text> : null}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Press onPress={() => set(v - step)} accessibilityRole="button" accessibilityLabel={t('settings.less')} style={({ hovered }) => [st.step, hovered && { backgroundColor: colors.ground2 }]}>
          <Text style={st.stepText}>−</Text>
        </Press>
        <View
          style={st.rail}
          onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={fromTouch}
          onResponderMove={fromTouch}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: v, text: `${fmt(v, step)}${unit ? ` ${unit}` : ''}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? v + step : v - step)}
        >
          <View pointerEvents="none" style={st.track}>
            <View style={[st.fill, { width: `${f * 100}%` }]} />
          </View>
          <View pointerEvents="none" style={[st.thumb, { left: `${f * 100}%` }]} />
        </View>
        <Press onPress={() => set(v + step)} accessibilityRole="button" accessibilityLabel={t('settings.more')} style={({ hovered }) => [st.step, hovered && { backgroundColor: colors.ground2 }]}>
          <Text style={st.stepText}>+</Text>
        </Press>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={type.tiny}>{fmt(min, step)}</Text>
        {value !== '' && value !== fallback ? (
          <Press onPress={() => onChange(fallback)} accessibilityRole="button" hitSlop={8} style={() => ({})}>
            <Text style={[type.tiny, { textDecorationLine: 'underline' }]}>{fallback === '' ? t('settings.resetAuto') : t('settings.resetTo', { value: fallback })}</Text>
          </Press>
        ) : null}
        <Text style={type.tiny}>{fmt(max, step)}</Text>
      </View>
      {help ? <Text style={type.small}>{help}</Text> : null}
      {error ? <Text style={[type.small, { color: colors.warn }]}>{error}</Text> : null}
    </View>
  )
}

/** Comma separated words as removable chips plus an input that adds on Enter or comma. */
export function ListInput({ label, help, value, placeholder, onChange, error }: { label: string; help?: string; value: string; placeholder?: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const items = value.split(',').map((x) => x.trim()).filter(Boolean)
  const add = (raw: string) => {
    const next = raw.split(',').map((x) => x.trim()).filter((x) => x && !items.some((i) => i.toLowerCase() === x.toLowerCase()))
    if (next.length) onChange([...items, ...next].join(','))
    setDraft('')
  }
  return (
    <View style={{ gap: 8 }}>
      <Micro>{label}</Micro>
      {items.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {items.map((it) => (
            <View key={it} style={st.chip}>
              <Text style={[type.body, { fontSize: 14.5 }]}>{it}</Text>
              <Press onPress={() => onChange(items.filter((x) => x !== it).join(','))} accessibilityRole="button" accessibilityLabel={t('settings.removeItem', { item: it })} hitSlop={8} style={() => ({ padding: 2 })}>
                <Icon name="x" size={13} color={colors.faint} />
              </Press>
            </View>
          ))}
        </View>
      ) : null}
      <TextInput
        style={ui.input}
        value={draft}
        onChangeText={(v) => (v.endsWith(',') ? add(v) : setDraft(v))}
        onSubmitEditing={() => add(draft)}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={placeholder ? placeholder.replace(/^(z\.B\.|e\.g\.)\s*/, '') : t('settings.addItem')}
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel={t('settings.addItemTo', { label })}
      />
      <Text style={type.small}>{help ? `${help} ` : ''}{t('settings.listHint')}</Text>
      {error ? <Text style={[type.small, { color: colors.warn }]}>{error}</Text> : null}
    </View>
  )
}

const st = StyleSheet.create({
  rail: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 4, backgroundColor: colors.line2 },
  fill: { height: 4, backgroundColor: colors.ink },
  thumb: { position: 'absolute', top: 8, width: 20, height: 20, marginLeft: -10, backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink },
  step: { width: 36, height: 36, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  stepText: { fontFamily: fonts.medium, fontSize: 18, color: colors.ink, lineHeight: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingLeft: 10, paddingRight: 6, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.ground2 },
})
