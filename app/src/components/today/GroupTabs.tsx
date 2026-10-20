import { ScrollView, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CardGroup } from '@jarvis/contract'
import { colors, fonts, groupColor, markGround, markInk, shadow } from '@/theme/tokens'
import { Press } from '../ui'

export type Filter = CardGroup | 'all'
const ORDER: CardGroup[] = ['reply', 'schedule', 'todo', 'know']

/** Tabs per group: underline in the group colour, count chip; empty groups are hidden. */
export function GroupTabs({ counts, value, onChange, padding }: { counts: Record<Filter, number>; value: Filter; onChange: (f: Filter) => void; padding: number }) {
  const { t } = useTranslation()
  const defs: { key: Filter; label: string; c: string }[] = [
    { key: 'all', label: t('today.allTab'), c: colors.ink },
    ...ORDER.filter((g) => counts[g] > 0).map((g) => ({ key: g, label: t(`groups.${g}`), c: groupColor[g] })),
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: padding, paddingBottom: 16 }} accessibilityRole="tablist">
      {defs.map((d) => {
        const on = value === d.key
        return (
          <Press
            key={d.key}
            onPress={() => onChange(d.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ hovered }) => [st.tab, { borderBottomColor: d.c }, on ? { boxShadow: shadow.card } : { opacity: hovered ? 0.95 : 0.78 }]}
          >
            <Text style={[st.label, on && { color: colors.ink }]}>{d.label}</Text>
            <Text style={[st.count, { color: d.key === 'all' ? colors.ink : markInk(d.c), backgroundColor: d.key === 'all' ? colors.ground2 : markGround(d.c) }]}>{counts[d.key]}</Text>
          </Press>
        )
      })}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  tab: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: colors.line, borderBottomWidth: 1.5, backgroundColor: colors.card, paddingTop: 8, paddingBottom: 7, paddingHorizontal: 12 },
  label: { fontFamily: fonts.italic, fontSize: 15, color: colors.ink2 },
  count: { fontFamily: fonts.medium, fontSize: 11.5, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
})
