// The three swipeable modules under the stats: message flow chart, this week, system.
import { useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import type { HomeResponse } from '@jarvis/contract'
import { colors, fonts, layout, shadow } from '@/theme/tokens'
import { type } from '@/theme/type'

type Mods = HomeResponse['modules']

function Module({ title, sub, children, style }: { title: string; sub: string; children: ReactNode; style?: object }) {
  return (
    <View style={[st.mod, style]}>
      <Text style={st.title}>{title}</Text>
      <Text style={[type.small, { marginTop: 2 }]}>{sub}</Text>
      <View style={{ marginTop: 'auto' }}>{children}</View>
    </View>
  )
}

function MessagesChart({ m }: { m: Mods['messages'] }) {
  const { t } = useTranslation()
  const [w, setW] = useState(0)
  const H = 72
  const max = Math.max(1, ...m.incoming, ...m.handled) * 1.15
  const n = Math.max(1, m.days.length - 1)
  const pts = (arr: number[]) => arr.map((v, i) => [(i * w) / n, H - (v / max) * H] as const)
  const path = (arr: number[]) =>
    pts(arr).reduce((d, [x, y], i, a) => (i ? `${d} C${(a[i - 1]![0] + x) / 2} ${a[i - 1]![1]} ${(a[i - 1]![0] + x) / 2} ${y} ${x} ${y}` : `M${x} ${y}`), '')
  const hi = Math.max(0, m.incoming.length - 2)
  const point = pts(m.incoming)[hi]
  const delta = m.deltaPct
  return (
    <>
      <View style={{ paddingTop: 12 }} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={`${t('today.modules.incoming')}: ${m.incoming.join(', ')}. ${t('today.modules.handled')}: ${m.handled.join(', ')}`}>
        {w > 0 ? (
          <Svg width={w} height={H} style={{ overflow: 'visible' }}>
            {[0.33, 0.66].map((f) => (
              <Line key={f} x1={0} x2={w} y1={H * f} y2={H * f} stroke={colors.line} strokeWidth={1} strokeDasharray="2 4" />
            ))}
            <Path d={path(m.handled)} stroke={colors.green} strokeWidth={2} fill="none" />
            <Path d={path(m.incoming)} stroke={colors.blue} strokeWidth={2} fill="none" />
            {point ? <Circle cx={point[0]} cy={point[1]} r={4} fill="#FFFFFF" stroke={colors.blue} strokeWidth={2} /> : null}
          </Svg>
        ) : (
          <View style={{ height: H }} />
        )}
        {delta !== undefined ? (
          <View style={st.tip}>
            <Text style={{ fontFamily: fonts.light, fontSize: 18, lineHeight: 20, color: colors.ink }}>{t('today.modules.delta', { sign: delta >= 0 ? '+' : '−', pct: Math.abs(delta) })}</Text>
            <Text style={type.tiny}>{t('today.modules.deltaSub')}</Text>
          </View>
        ) : null}
      </View>
      <View style={st.days}>
        {m.days.map((d) => (
          <Text key={d} style={type.tiny}>
            {d}
          </Text>
        ))}
      </View>
    </>
  )
}

function Week({ m }: { m: Mods['week'] }) {
  return (
    <View style={st.week}>
      {m.counts.map((c, i) => {
        const today = i === m.todayIndex
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
            <View style={{ width: '100%', maxWidth: 22, height: 8 + c * 9, backgroundColor: today ? colors.block : '#D6DBE2' }} />
            <Text style={[type.tiny, today && { color: colors.ink }]}>{m.days[i]}</Text>
          </View>
        )
      })}
    </View>
  )
}

function System({ m, last }: { m: Mods['system']; last?: string }) {
  const { t } = useTranslation()
  return (
    <>
      {last ?? m.lastSource ? <Text style={[type.bodyItalic, { fontSize: 13.5, color: colors.ink2 }]}>{t('today.modules.last', { source: last ?? m.lastSource })}</Text> : null}
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: m.servicesTotal }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 4, backgroundColor: i < m.servicesOk ? colors.green : colors.warn }} />
        ))}
      </View>
    </>
  )
}

export function Modules({ modules, lastSource, wide }: { modules: Mods; lastSource?: string; wide: boolean }) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const sys = modules.system
  const items = [
    <Module key="m" title={t('today.modules.messages')} sub={t('today.modules.messagesSub')} style={wide ? { flex: 1.4 } : undefined}>
      <MessagesChart m={modules.messages} />
    </Module>,
    <Module key="w" title={t('today.modules.week')} sub={t('today.modules.weekSub', { count: modules.week.total })} style={wide ? { flex: 1 } : undefined}>
      <Week m={modules.week} />
    </Module>,
    <Module
      key="s"
      title={t('today.modules.system')}
      sub={sys.servicesOk === sys.servicesTotal ? t('today.modules.systemAllOk', { count: sys.servicesTotal }) : t('today.modules.systemSub', { ok: sys.servicesOk, total: sys.servicesTotal })}
      style={wide ? { flex: 1 } : undefined}
    >
      <System m={sys} last={lastSource} />
    </Module>,
  ]
  if (wide) return <View style={{ flexDirection: 'row', gap: 12, paddingTop: 14, paddingHorizontal: 28 }}>{items}</View>
  const itemW = (width - layout.gutter * 2) * 0.82
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={itemW + 12}
      decelerationRate="fast"
      contentContainerStyle={{ gap: 12, paddingTop: 14, paddingBottom: 4, paddingHorizontal: layout.gutter }}
    >
      {items.map((it) => (
        <View key={it.key} style={{ width: itemW }}>
          {it}
        </View>
      ))}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  mod: { flex: 1, backgroundColor: colors.card, boxShadow: shadow.card, paddingVertical: 14, paddingHorizontal: 16, minHeight: 168 },
  title: { fontFamily: fonts.italic, fontSize: 17, color: colors.ink },
  tip: { position: 'absolute', right: '14%', top: 0, paddingVertical: 6, paddingHorizontal: 9, backgroundColor: '#EEF3FF', boxShadow: shadow.card },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  week: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
})
