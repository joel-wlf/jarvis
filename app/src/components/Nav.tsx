// Navigation: black bottom bar on phones, vertical tile rail on wide screens (prototype .rail).
import { StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '@/state/session'
import { colors, fonts, layout } from '@/theme/tokens'
import { Icon, type IconName } from './Icon'
import { Press } from './ui'

interface Item { href: Href; match: (p: string) => boolean; icon: IconName; label: string; end?: boolean }

export function useNavItems(): Item[] {
  const { t } = useTranslation()
  const { admin } = useSession()
  const items: Item[] = [
    { href: '/', match: (p) => p === '/', icon: 'home', label: t('nav.today') },
    { href: '/people', match: (p) => p.startsWith('/people'), icon: 'people', label: t('nav.people') },
    { href: '/memory', match: (p) => p.startsWith('/memory'), icon: 'memory', label: t('nav.memory') },
  ]
  if (admin) items.push({ href: '/system', match: (p) => p.startsWith('/system'), icon: 'system', label: t('nav.system'), end: true })
  return items
}

export function BottomBar() {
  const items = useNavItems()
  const path = usePathname()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  return (
    <View style={[st.bar, { height: layout.navHeight + insets.bottom, paddingBottom: insets.bottom }]} accessibilityRole="tablist" accessibilityLabel={t('nav.areas')}>
      {items.map((it) => {
        const on = it.match(path)
        return (
          <Press key={it.label} onPress={() => router.navigate(it.href)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={() => [st.barBtn, on && st.barOn]}>
            <Icon name={it.icon} size={21} color={on ? '#FFFFFF' : colors.navIdle} />
            <Text style={[st.barLabel, { color: on ? '#FFFFFF' : colors.navIdle }]}>{it.label}</Text>
          </Press>
        )
      })}
    </View>
  )
}

export function Rail() {
  const items = useNavItems()
  const path = usePathname()
  const router = useRouter()
  const { t } = useTranslation()
  const main = items.filter((i) => !i.end)
  const end = items.filter((i) => i.end)
  const tile = (it: Item) => {
    const on = it.match(path)
    return (
      <Press
        key={it.label}
        onPress={() => router.navigate(it.href)}
        accessibilityRole="tab"
        accessibilityLabel={it.label}
        accessibilityState={{ selected: on }}
        style={({ hovered }) => [st.tile, on ? st.tileOn : hovered && { borderColor: colors.line2 }]}
      >
        <Icon name={it.icon} size={20} color={on ? colors.blockInk : colors.ink2} />
      </Press>
    )
  }
  return (
    <View style={st.rail} accessibilityRole="tablist" accessibilityLabel={t('nav.areas')}>
      <Text style={st.logo} aria-hidden>
        J
      </Text>
      {main.map(tile)}
      <View style={{ flex: 1 }} />
      {end.map(tile)}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 20, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4, paddingHorizontal: 4, backgroundColor: colors.block },
  barBtn: { flex: 1, maxWidth: 96, alignItems: 'center', justifyContent: 'center', gap: 3 },
  barOn: { borderTopWidth: 2, borderTopColor: '#FFFFFF' },
  barLabel: { fontFamily: fonts.italic, fontSize: 11.5 },
  rail: { width: layout.railWidth, alignItems: 'center', gap: 8, paddingVertical: 18 },
  logo: { width: 40, height: 40, marginBottom: 18, textAlign: 'center', fontFamily: fonts.light, fontSize: 30, lineHeight: 40, color: colors.ink },
  tile: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  tileOn: { backgroundColor: colors.block, borderColor: colors.block },
})
