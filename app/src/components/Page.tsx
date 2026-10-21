// Frame for the secondary screens: italic title, a calm sub line, optional back link,
// and a scrolling column that clears the bottom bar on phones.
import type { ReactNode } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, layout } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon } from './Icon'
import { Press } from './ui'
import { useWide } from './useWide'

interface Props {
  title: string
  sub?: string
  back?: boolean
  right?: ReactNode
  children: ReactNode
  /** extra content pinned under the scroll area, e.g. a save bar */
  footer?: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  /** full-screen pages (ask, setup) have no bottom bar to clear */
  bare?: boolean
}

export function Page({ title, sub, back, right, children, footer, refreshing, onRefresh, bare }: Props) {
  const { t } = useTranslation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const wide = useWide()
  const pad = wide ? 28 : layout.gutter
  const bottom = wide || bare ? 40 + insets.bottom : layout.navHeight + 32 + insets.bottom
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottom }}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.faint} /> : undefined}
      >
        <View style={[st.inner, wide && { maxWidth: 820 }]}>
          <View style={[st.top, { paddingHorizontal: pad, paddingTop: wide ? 24 : Math.max(18, insets.top) }]}>
            {back ? (
              <Press
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
                hitSlop={8}
                style={({ hovered }) => [st.back, hovered && { opacity: 0.7 }]}
              >
                <Icon name="back" size={18} color={colors.ink2} />
                <Text style={[type.sub, { color: colors.ink2 }]}>{t('common.back')}</Text>
              </Press>
            ) : null}
            <View style={st.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={type.h1} accessibilityRole="header">
                  {title}
                </Text>
                {sub ? <Text style={[type.sub, { marginTop: 6 }]}>{sub}</Text> : null}
              </View>
              {right}
            </View>
          </View>
          <View style={{ paddingHorizontal: pad, paddingTop: 22, gap: 22 }}>{children}</View>
        </View>
      </ScrollView>
      {footer}
    </View>
  )
}

/** A titled group of content on a page. */
export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.micro]} accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  )
}

const st = StyleSheet.create({
  inner: { width: '100%' },
  top: { gap: 14 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
})
