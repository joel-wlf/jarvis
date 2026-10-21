// "Frag Jarvis": a thumb dock above the bottom bar (static under the modules on wide screens).
import { useState } from 'react'
import { StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import { colors, fonts, layout, shadow } from '@/theme/tokens'
import { Icon } from '../Icon'
import { Press } from '../ui'

export function AskDock({ onSubmit, onFocusChange, style, autoFocus }: { onSubmit: (q: string) => void; onFocusChange?: (focused: boolean) => void; style?: StyleProp<ViewStyle>; autoFocus?: boolean }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const submit = () => {
    const v = q.trim()
    if (!v) return
    setQ('')
    onSubmit(v)
  }
  return (
    <View style={[st.dock, { boxShadow: focus ? `inset 0px 0px 0px 1px ${colors.ink}, ${shadow.lift}` : shadow.lift }, style]} accessibilityRole="search">
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={submit}
        placeholder={t('ask.placeholder')}
        placeholderTextColor={colors.faint}
        selectionColor={colors.blue}
        accessibilityLabel={t('ask.label')}
        returnKeyType="send"
        autoFocus={autoFocus}
        onFocus={() => {
          setFocus(true)
          onFocusChange?.(true)
        }}
        onBlur={() => {
          setFocus(false)
          onFocusChange?.(false)
        }}
        style={st.input}
      />
      <View style={[st.btn, { backgroundColor: 'transparent' }]} accessibilityRole="button" accessibilityLabel={t('ask.mic')} accessibilityState={{ disabled: true }}>
        <Icon name="mic" size={18} color={colors.faint} />
      </View>
      <Press onPress={submit} accessibilityRole="button" accessibilityLabel={t('ask.send')} style={({ pressed, hovered }) => [st.btn, { backgroundColor: pressed || hovered ? colors.block2 : colors.block }]}>
        <Icon name="arrow" size={18} color={colors.blockInk} />
      </Press>
    </View>
  )
}

const st = StyleSheet.create({
  dock: { flexDirection: 'row', alignItems: 'center', gap: 4, height: layout.dockHeight, paddingLeft: 16, paddingRight: 5, backgroundColor: colors.card },
  input: { flex: 1, minWidth: 0, height: '100%', fontFamily: fonts.italic, fontSize: 16, color: colors.ink },
  btn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
})
