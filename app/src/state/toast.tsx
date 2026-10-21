// One short confirmation at a time, as a black bar above the dock (prototype .toast).
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/components/Icon'
import { colors, fonts, layout, shadow } from '@/theme/tokens'

const Ctx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= layout.wideBreakpoint
  const show = useCallback((text: string) => {
    clearTimeout(timer.current)
    setMsg({ id: Date.now(), text })
    timer.current = setTimeout(() => setMsg(null), 2200)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: wide ? 28 : layout.navHeight + 74 + insets.bottom }]}>
          <Animated.View key={msg.id} entering={FadeInDown.duration(300)} exiting={FadeOut.duration(200)} style={st.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Icon name="check" size={16} color={colors.ok} />
            <Text style={st.text} numberOfLines={2}>
              {msg.text}
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)

const st = StyleSheet.create({
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.block, paddingVertical: 11, paddingHorizontal: 16, maxWidth: '90%', boxShadow: shadow.lift },
  text: { fontFamily: fonts.italic, fontSize: 14.5, color: colors.blockInk, flexShrink: 1 },
})
