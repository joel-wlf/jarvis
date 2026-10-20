// Type-specific pieces of the cards, one per prototype class (.datebig, .vmsg, .tl, .poll, …).
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Line, Path, Pattern, Rect } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import type { ConflictData, PollData, Stat } from '@jarvis/contract'
import { colors, fonts, groupColor, markInk, mix } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon } from '../Icon'
import { Micro, Press } from '../ui'

export function Quote({ text }: { text: string }) {
  return <Text style={type.body}>{text}</Text>
}

/** Big thin number or time with two lines beside it. */
export function DateBig({ big, line, small }: { big: string; line?: string; small?: string }) {
  return (
    <View style={p.datebig}>
      <Text style={type.huge}>{big}</Text>
      <View style={{ flex: 1 }}>
        {line ? <Text style={type.bodyItalic}>{line}</Text> : null}
        {small ? <Text style={[type.sub, { marginTop: 2 }]}>{small}</Text> : null}
      </View>
    </View>
  )
}

function waveBars(seed: number, n = 48) {
  let s = seed
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280
    return 0.2 + (s / 233280) * 0.8
  })
}

export function VoiceRow({ seconds }: { seconds: number }) {
  const { t } = useTranslation()
  const bars = waveBars(7)
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <View style={p.vmsg}>
      {/* No audio URL in the contract yet, so playback is a disabled affordance. */}
      <View style={p.play} accessibilityRole="button" accessibilityLabel={t('card.play')} accessibilityState={{ disabled: true }}>
        <Icon name="play" size={12} />
      </View>
      <View style={p.wave} aria-hidden>
        {bars.map((v, i) => (
          <View key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, minHeight: 2, backgroundColor: i < 16 ? colors.ink : colors.line2 }} />
        ))}
      </View>
      <Text style={[type.small, { fontSize: 13 }]}>{mm}</Text>
    </View>
  )
}

export function Emojis({ emojis, onPick }: { emojis: string[]; onPick: (e: string) => void }) {
  const { t } = useTranslation()
  return (
    <View style={p.emojis} accessibilityRole="toolbar" accessibilityLabel={t('card.react')}>
      {emojis.map((e, i) => (
        <Press key={e} onPress={() => onPick(e)} accessibilityRole="button" accessibilityLabel={t('card.reactWith', { emoji: e })} style={({ pressed, hovered }) => [p.emoji, i > 0 && p.vline, (pressed || hovered) && { backgroundColor: colors.ground2 }]}>
          <Text style={{ fontSize: 23 }}>{e}</Text>
        </Press>
      ))}
    </View>
  )
}

/** Two time slots on one evening, with the overlap hatched in red. */
export function Timeline({ data }: { data: ConflictData }) {
  const [w, setW] = useState(0)
  const [a, b] = data.axis
  const x = (v: number) => ((v - a) / (b - a)) * w
  const ticks = Array.from({ length: Math.floor((b - a) / 2) + 1 }, (_, i) => a + i * 2)
  const [s0, s1] = data.slots
  const ov: [number, number] | null = s0 && s1 ? [Math.max(s0.from, s1.from), Math.min(s0.to, s1.to)] : null
  return (
    <View style={{ height: 76 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <>
          <Svg width={w} height={76} style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id="hatch" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <Rect width={3} height={7} fill="rgba(217, 72, 59, 0.2)" />
              </Pattern>
            </Defs>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <Line key={f} x1={w * f - 0.5} x2={w * f - 0.5} y1={0} y2={76} stroke={colors.line} strokeWidth={1} />
            ))}
            {ov && ov[1] > ov[0] ? (
              <>
                <Rect x={x(ov[0])} y={18} width={x(ov[1]) - x(ov[0])} height={52} fill="url(#hatch)" />
                <Line x1={x(ov[0])} x2={x(ov[0])} y1={18} y2={70} stroke={colors.warn} strokeWidth={1} />
                <Line x1={x(ov[1])} x2={x(ov[1])} y1={18} y2={70} stroke={colors.warn} strokeWidth={1} />
              </>
            ) : null}
          </Svg>
          {ticks.map((v, i) => (
            <Text key={v} style={[type.tiny, { position: 'absolute', top: 0, left: x(v), transform: [{ translateX: i === 0 ? 0 : i === ticks.length - 1 ? -34 : -17 }] }]}>
              {`${v}:00`}
            </Text>
          ))}
          {data.slots.map((sl, i) => {
            const c = groupColor[sl.group]
            return (
              <View key={sl.label} style={[p.slot, { top: 22 + i * 26, left: x(sl.from), width: x(sl.to) - x(sl.from), borderTopColor: c, backgroundColor: mix(c, 0.08, 'white') }]}>
                <Text style={[type.small, { color: colors.ink2, fontSize: 12 }]} numberOfLines={1}>
                  {sl.label}
                </Text>
              </View>
            )
          })}
        </>
      ) : null}
    </View>
  )
}

export function Ideas({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((x, i) => (
        <Text key={x} style={[type.body, { paddingVertical: 9, paddingTop: i ? 9 : 0 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
          {x}
        </Text>
      ))}
    </View>
  )
}

export function Numbered({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((x, i) => (
        <View key={x} style={{ flexDirection: 'row' }}>
          <Text style={[type.small, { width: 22, color: colors.faint, fontSize: 12, paddingTop: 2 }]}>{String(i + 1).padStart(2, '0')}</Text>
          <Text style={[type.body, { flex: 1 }]}>{x}</Text>
        </View>
      ))}
    </View>
  )
}

export function Mine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
      <View style={{ width: 6, height: 6, backgroundColor: groupColor.reply, transform: [{ translateY: -1 }] }} />
      <Text style={[type.bodyItalic, { fontSize: 14.5, flex: 1 }]}>{text}</Text>
    </View>
  )
}

export function Due({ fraction, label, color }: { fraction: number; label: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, height: 2, backgroundColor: colors.line }}>
        <View style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, height: 2, backgroundColor: color }} />
      </View>
      <Text style={[type.small, { fontSize: 13 }]}>{label}</Text>
    </View>
  )
}

export function Poll({ data, color, onVote }: { data: PollData; color: string; onVote: (option: string) => void }) {
  const { t } = useTranslation()
  const total = data.options.reduce((n, o) => n + o.votes, 0) + 1
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line }}>
      {data.options.map((o, i) => (
        <Press key={o.label} onPress={() => onVote(o.label)} accessibilityRole="button" accessibilityLabel={`${o.label}, ${t('card.votes', { count: o.votes })}`} style={({ pressed, hovered }) => [p.opt, i > 0 && p.hline, (pressed || hovered) && { backgroundColor: colors.ground2 }]}>
          <Text style={type.bodyItalic}>{o.label}</Text>
          {o.recommended ? <Text style={[type.small, { color: markInk(color) }]}>{t('card.suitsYou')}</Text> : null}
          <Text style={[type.body, { marginLeft: 'auto', fontSize: 13, color: colors.muted }]}>{o.votes}</Text>
          <View style={{ position: 'absolute', left: 0, bottom: -1, height: 2, width: `${(o.votes / total) * 100}%`, backgroundColor: color }} />
        </Press>
      ))}
    </View>
  )
}

export function Sources({ items }: { items: string[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
      {items.map((x) => (
        <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="link" size={13} color={colors.muted} />
          <Text style={[type.small, { fontSize: 13 }]}>{x}</Text>
        </View>
      ))}
    </View>
  )
}

export function CheckList({ items }: { items: { name: string; who?: string; done: boolean }[] }) {
  const { t } = useTranslation()
  // Ticking is local: the contract has no per-item action yet.
  const [got, setGot] = useState(() => items.map((i) => i.done))
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
      {items.map((it, i) => (
        <View key={it.name} style={p.check}>
          <Press
            onPress={() => setGot((g) => g.map((v, j) => (j === i ? !v : v)))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: got[i] }}
            accessibilityLabel={t('card.tick', { name: it.name })}
            hitSlop={12}
            style={() => [p.box, got[i] && { backgroundColor: colors.block, borderColor: colors.block }]}
          >
            {got[i] ? <Icon name="check" size={14} color="#FFFFFF" /> : null}
          </Press>
          <Text style={[p.checkName, got[i] && { color: colors.faint, textDecorationLine: 'line-through' }]}>{it.name}</Text>
          {it.who ? <Text style={type.small}>{it.who}</Text> : null}
        </View>
      ))}
    </View>
  )
}

export function openCount(items: { done: boolean }[]) {
  return items.filter((i) => !i.done).length
}

export function Steps({ steps, current, color }: { steps: string[]; current: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {steps.map((st, i) => {
        const past = i < current
        const now = i === current
        return (
          <View key={st} style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 2, backgroundColor: past || now ? color : colors.line }}>
              {now ? <View style={{ position: 'absolute', right: -1, top: -4, width: 2, height: 10, backgroundColor: color }} /> : null}
            </View>
            <Text style={[type.small, { color: past || now ? colors.ink : colors.faint }, now && { fontFamily: fonts.italic }]}>{st}</Text>
          </View>
        )
      })}
    </View>
  )
}

export function Ledger({ from, to, amount }: { from: string; to: string; amount: string }) {
  const { t } = useTranslation()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View>
        <Micro>{t('card.from')}</Micro>
        <Text style={p.ledgerName}>{from}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.line2 }} />
        <Text style={{ fontFamily: fonts.thin, fontSize: 30, lineHeight: 32, letterSpacing: -0.6, color: colors.ink }}>{amount}</Text>
        <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: colors.line2 }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Micro>{t('card.toLabel')}</Micro>
        <Text style={p.ledgerName}>{to}</Text>
      </View>
    </View>
  )
}

export function Promise_({ text, caption }: { text: string; caption: string }) {
  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.ground2 }}>
      <Text style={{ fontFamily: fonts.light, fontSize: 18, lineHeight: 24, color: colors.ink }}>{`„${text}“`}</Text>
      <Text style={[type.small, { marginTop: 6 }]}>{caption}</Text>
    </View>
  )
}

export function Board({ depart, arrive, fromCity, toCity, change, color }: { depart: string; arrive: string; fromCity: string; toCity: string; change: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View>
        <Text style={p.boardTime}>{depart}</Text>
        <Text style={[type.small, { marginTop: 4 }]}>{fromCity}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, borderTopWidth: 1.5, borderTopColor: color }} />
        <Text style={[type.small, { fontSize: 12 }]}>{change}</Text>
        <View style={{ flex: 1, borderTopWidth: 1.5, borderTopColor: color }} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={p.boardTime}>{arrive}</Text>
        <Text style={[type.small, { marginTop: 4 }]}>{toCity}</Text>
      </View>
    </View>
  )
}

/** Abstract street sketch with the route to the meeting point; no map tiles, nothing leaves the device. */
export function MiniMap({ color }: { color: string }) {
  const [w, setW] = useState(0)
  return (
    <View style={{ height: 96, backgroundColor: colors.ground2, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)} aria-hidden>
      {w > 0 ? (
        <Svg width={w} height={96} viewBox="0 0 200 60" preserveAspectRatio="none">
          <Path d="M0 30 L60 34 L120 20 L200 28" stroke="#FFFFFF" strokeWidth={8} fill="none" vectorEffect="non-scaling-stroke" />
          <Path d="M40 0 L52 60" stroke="#FFFFFF" strokeWidth={8} fill="none" vectorEffect="non-scaling-stroke" />
          <Path d="M150 0 L140 60" stroke="#FFFFFF" strokeWidth={8} fill="none" vectorEffect="non-scaling-stroke" />
          <Path d="M0 48 L200 44" stroke="#FFFFFF" strokeWidth={4} fill="none" vectorEffect="non-scaling-stroke" />
          <Path d="M20 52 L52 34 L118 22" stroke={color} strokeWidth={2} strokeDasharray="4 4" fill="none" vectorEffect="non-scaling-stroke" />
        </Svg>
      ) : null}
      <View style={{ position: 'absolute', left: '59%', top: '26%', width: 12, height: 12, marginLeft: -6, marginTop: -6, backgroundColor: color, borderWidth: 3, borderColor: '#FFFFFF', transform: [{ rotate: '45deg' }] }} />
    </View>
  )
}

export function Facts({ facts }: { facts: Stat[] }) {
  return (
    <View>
      {facts.map((f, i) => (
        <View key={f.label} style={[{ flexDirection: 'row', gap: 12, paddingVertical: 9 }, i === 0 ? { paddingTop: 0 } : { borderTopWidth: 1, borderTopColor: colors.line }]}>
          <Micro style={{ width: 84, paddingTop: 3 }}>{f.label}</Micro>
          <Text style={[type.bodyItalic, { flex: 1 }]}>{f.value}</Text>
        </View>
      ))}
    </View>
  )
}

export function Address({ lines }: { lines: string[] }) {
  return (
    <View style={{ gap: 2, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line }}>
      {lines.map((l, i) =>
        i === 0 ? (
          <Text key={l} style={[type.bodyItalic, { fontSize: 17 }]}>
            {l}
          </Text>
        ) : (
          <Text key={l} style={type.body}>
            {l}
          </Text>
        ),
      )}
    </View>
  )
}

export function LinkPreview({ domain, headline, readingTime }: { domain: string; headline: string; readingTime?: string }) {
  return (
    <View style={{ gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderTopWidth: 2, borderTopColor: colors.ink }}>
      <Text style={[type.small, { fontSize: 12 }]}>{domain}</Text>
      <Text style={{ fontFamily: fonts.light, fontSize: 20, lineHeight: 25, letterSpacing: -0.2, color: colors.ink }}>{headline}</Text>
      {readingTime ? <Text style={[type.small, { color: colors.faint }]}>{readingTime}</Text> : null}
    </View>
  )
}

export function Streak({ weeks, color }: { weeks: boolean[]; color: string }) {
  const { t } = useTranslation()
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {weeks.map((y, i) => {
        const last = i === weeks.length - 1
        return <View key={i} accessibilityLabel={t('card.week', { n: i + 1 })} style={{ flex: 1, height: 22, backgroundColor: last ? '#FFFFFF' : y ? color : colors.line, borderWidth: last ? 1.5 : 0, borderColor: colors.ink }} />
      })}
    </View>
  )
}

/** Photo placeholders; thumbnails are empty in the contract fixtures. */
export function Thumbs({ count }: { count: number }) {
  const tones = [['#CBD3DC', '#AEB8C4'], ['#D8D2C8', '#BDB4A6'], ['#C8D4CC', '#A9B9AE']] as const
  return (
    <View style={{ flexDirection: 'row', gap: 4, height: 112 }}>
      <View style={{ flex: 2, backgroundColor: tones[0][1] }} />
      <View style={{ flex: 2, gap: 4 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
          <View style={{ flex: 1, backgroundColor: tones[1][1] }} />
          <View style={{ flex: 1, backgroundColor: tones[2][1] }} />
        </View>
        <View style={{ flex: 1, backgroundColor: colors.block2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.light, fontSize: 22, color: '#FFFFFF' }}>{`+${Math.max(0, count - 3)}`}</Text>
        </View>
      </View>
    </View>
  )
}

const p = StyleSheet.create({
  datebig: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  vmsg: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { width: 38, height: 38, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingLeft: 2, opacity: 0.6 },
  wave: { flex: 1, height: 26, flexDirection: 'row', alignItems: 'center', gap: 2 },
  emojis: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line, marginBottom: 18 },
  emoji: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  vline: { borderLeftWidth: 1, borderLeftColor: colors.line },
  hline: { borderTopWidth: 1, borderTopColor: colors.line },
  slot: { position: 'absolute', height: 20, borderTopWidth: 2, justifyContent: 'center', paddingHorizontal: 6, overflow: 'hidden' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 12, backgroundColor: colors.card },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.line },
  box: { width: 20, height: 20, borderWidth: 1.5, borderColor: colors.line2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  checkName: { flex: 1, fontFamily: fonts.italic, fontSize: 16, color: colors.ink },
  ledgerName: { fontFamily: fonts.italic, fontSize: 17, color: colors.ink },
  boardTime: { fontFamily: fonts.thin, fontSize: 34, lineHeight: 36, letterSpacing: -0.7, color: colors.ink },
})
