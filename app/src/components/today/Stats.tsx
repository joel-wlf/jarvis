import { StyleSheet, Text, View } from 'react-native'
import type { Stat } from '@jarvis/contract'
import { colors, shadow } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Micro } from '../ui'

/** Three key figures in a white strip with hairline dividers. */
export function StatsStrip({ stats }: { stats: Stat[] }) {
  return (
    <View style={st.strip}>
      {stats.slice(0, 3).map((s, i) => (
        <View key={s.label} style={[st.cell, i > 0 && st.divider]} accessible accessibilityLabel={`${s.label}: ${s.value}`}>
          <Micro>{s.label}</Micro>
          <Text style={[type.big, { marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
            {s.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

const st = StyleSheet.create({
  strip: { flexDirection: 'row', backgroundColor: colors.card, boxShadow: shadow.card },
  cell: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  divider: { borderLeftWidth: 1, borderLeftColor: colors.line },
})
