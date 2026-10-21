// Type-specific pieces of the cards, one per prototype class (.datebig, .vmsg, .tl, .poll, …).
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Line, Path, Pattern, Polygon, Rect } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import type { Urgency, CodeData, ConflictData, LevyData, MentionData, PollData, RideData, SignupData, Stat } from '@jarvis/contract'
import { colors, fonts, groupColor, markGround, markInk, mix } from '@/theme/tokens'
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

/** Importance of a card in three steps. Small and quiet so it does not compete with the black action slab. */
export function Priority({ value, color, onChange }: { value: Urgency; color: string; onChange: (u: Urgency) => void }) {
  const { t } = useTranslation()
  const levels: [Urgency, string][] = [[1, t('card.priorityLow')], [2, t('card.priorityNormal')], [3, t('card.priorityHigh')]]
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }} accessibilityRole="radiogroup" accessibilityLabel={t('card.priority')}>
      <Micro>{t('card.priority')}</Micro>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        {levels.map(([u, label]) => {
          const on = value === u
          return (
            <Press key={u} onPress={() => onChange(u)} accessibilityRole="radio" accessibilityState={{ selected: on }} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} style={() => ({ paddingBottom: 3, borderBottomWidth: 2, borderBottomColor: on ? color : 'transparent' })}>
              <Text style={[type.small, { fontSize: 13.5, color: on ? colors.ink : colors.faint }]}>{label}</Text>
            </Press>
          )
        })}
      </View>
    </View>
  )
}

/** Two-letter square for a person: ink = driver or paid, soft = taken, ghost = open or unpaid, me = the owner. */
export function Chip({ label, tone = 'soft', accent }: { label: string; tone?: 'ink' | 'soft' | 'ghost' | 'me' | 'pick'; accent?: string }) {
  const base = { width: 24, height: 24, alignItems: 'center' as const, justifyContent: 'center' as const }
  const look =
    tone === 'ink' ? { backgroundColor: colors.ink }
    : tone === 'me' ? { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.ink }
    : tone === 'ghost' ? { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line2 }
    : tone === 'pick' ? { backgroundColor: markGround(accent ?? colors.ink), borderWidth: 1.5, borderColor: accent ?? colors.ink }
    : { backgroundColor: colors.ground2 }
  const ink = tone === 'ink' ? '#FFFFFF' : colors.ink2
  return (
    <View style={[base, look]}>
      <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: ink }}>{label}</Text>
    </View>
  )
}

/** Group chat excerpt: faded lines before, the addressed line marked with a coloured edge. */
export function Chat({ data, color }: { data: MentionData; color: string }) {
  const { before, hit } = data
  const parts = hit.mention && hit.text.includes(hit.mention) ? hit.text.split(hit.mention) : [hit.text]
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line }}>
      {before.map((m, i) => (
        <View key={`${m.who}-${i}`} style={[p.msg, i > 0 && p.hline]}>
          <Text style={type.tiny}>{m.who}</Text>
          <Text style={[type.body, { fontSize: 14, lineHeight: 19, color: colors.faint }]}>{m.text}</Text>
        </View>
      ))}
      <View style={[p.msg, p.hline, { backgroundColor: colors.ground2, paddingLeft: 14 }]}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: color }} />
        <Text style={[type.tiny, { color: colors.muted }]}>{`${hit.who} · ${hit.time}`}</Text>
        <Text style={[type.body, { fontSize: 15.5, lineHeight: 21, color: colors.ink }]}>
          {parts.map((part, i) => (
            <Text key={i}>
              {part}
              {i < parts.length - 1 ? <Text style={{ fontFamily: fonts.italic, backgroundColor: markGround(color), color: markInk(color) }}>{` ${hit.mention} `}</Text> : null}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  )
}

/** Cars with their seats. Tapping a car with a free seat picks it. */
export function Cars({ data, picked, onPick, color }: { data: RideData; picked: number | null; onPick: (i: number) => void; color: string }) {
  const { t } = useTranslation()
  return (
    <View style={{ gap: 14 }}>
      <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
        {data.cars.map((car, i) => {
          const free = car.seats - car.riders.length - (picked === i ? 1 : 0)
          const canPick = car.seats - car.riders.length > 0
          return (
            <Press key={car.driver.name} onPress={() => canPick && onPick(i)} disabled={!canPick} accessibilityRole="button" accessibilityState={{ selected: picked === i, disabled: !canPick }} accessibilityLabel={`${car.driver.name}, ${free > 0 ? t('card.seatsFree', { count: free }) : t('card.carFull')}`} style={({ pressed, hovered }) => [p.car, (pressed || hovered) && canPick && { backgroundColor: colors.ground2 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyItalic, { fontSize: 16 }]}>{car.driver.name}</Text>
                <Text style={type.small}>{free > 0 ? t('card.seatsFree', { count: free }) : t('card.carFull')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 3 }}>
                <Chip label={car.driver.initials} tone="ink" />
                {car.riders.map((r) => <Chip key={r.name} label={r.initials} />)}
                {Array.from({ length: car.seats - car.riders.length }, (_, k) => (k === 0 && picked === i ? <Chip key={`o${k}`} label={t('card.youShort')} tone="pick" accent={color} /> : <Chip key={`o${k}`} label="" tone="ghost" />))}
              </View>
            </Press>
          )
        })}
      </View>
      {data.without.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {data.without.filter((w) => picked === null || w.initials !== 'DU').map((w) => <Chip key={w.name} label={w.initials} tone="ghost" />)}
          </View>
          <Text style={type.small}>{t('card.noSeat')}</Text>
        </View>
      ) : null}
    </View>
  )
}

/** Sign-up lines with filled and open places. Tapping an open line picks it. */
export function Needs({ data, picked, onPick, color }: { data: SignupData; picked: string | null; onPick: (id: string) => void; color: string }) {
  const { t } = useTranslation()
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line }}>
      {data.needs.map((n) => {
        const full = n.have >= n.need
        const on = picked === n.id && !full
        const have = n.have + (on ? 1 : 0)
        return (
          <Press key={n.id} onPress={() => !full && onPick(n.id)} disabled={full} accessibilityRole="button" accessibilityState={{ selected: on, disabled: full }} accessibilityLabel={`${n.label}, ${full ? t('card.needFull') : t('card.haveOf', { have, need: n.need })}`} style={({ pressed, hovered }) => [p.need, on && { borderLeftWidth: 2, borderLeftColor: colors.ink, paddingLeft: 10 }, (pressed || hovered) && !full && { backgroundColor: colors.ground2 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[type.bodyItalic, { fontSize: 16 }, full && { color: colors.faint }]}>{n.label}</Text>
              {n.hint && !full ? <Text style={[type.small, { color: markInk(color) }]}>{n.hint}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: n.need }, (_, i) => {
                const filled = i < have
                const mine = on && i === have - 1
                return <View key={i} style={{ width: 14, height: 14, borderWidth: 1.5, borderColor: filled && !mine ? colors.ink : mine ? color : colors.line2, backgroundColor: filled && !mine ? colors.ink : mine ? markGround(color) : colors.card }} />
              })}
            </View>
            <Text style={[type.small, { width: 44, textAlign: 'right', fontSize: 13 }]}>{full ? t('card.needFull') : t('card.haveOf', { have, need: n.need })}</Text>
          </Press>
        )
      })}
    </View>
  )
}

/** Per-head collection: the amount, how to pay, and who has paid. */
export function Levy({ data }: { data: LevyData }) {
  const { t } = useTranslation()
  const paid = data.paid.filter((x) => x.paid).length
  return (
    <View style={{ gap: 14 }}>
      <DateBig big={data.amount} line={t('card.to', { name: data.payee.name })} small={data.reason} />
      <View style={p.way}>
        <Micro style={{ width: 84, paddingTop: 3 }}>{t('card.payWay')}</Micro>
        <Text style={[type.bodyItalic, { flex: 1 }]}>{data.way}</Text>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={type.small}>{t('card.paid')}</Text>
          <Text style={type.small}>{t('card.paidOf', { n: paid, total: data.paid.length })}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {data.paid.map((x) => <Chip key={x.person.name} label={x.person.initials} tone={x.paid ? 'ink' : x.me ? 'me' : 'ghost'} />)}
        </View>
      </View>
    </View>
  )
}

/** Code cells with a tap-to-hide link. */
export function Digits({ data }: { data: CodeData }) {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState(false)
  const chars = Array.from(data.code)
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 5 }} accessibilityLabel={hidden ? t('card.codeHidden') : data.code.split('').join(' ')}>
        {chars.map((c, i) => (
          <View key={i} style={p.cell}>
            {hidden ? <View style={{ width: 10, height: 2, backgroundColor: colors.ink }} /> : <Text style={{ fontFamily: fonts.thin, fontSize: chars.length > 5 ? 34 : 44, lineHeight: 48, color: colors.ink }}>{c}</Text>}
          </View>
        ))}
      </View>
      <Press onPress={() => setHidden((h) => !h)} accessibilityRole="button" hitSlop={8} style={() => ({ alignSelf: 'flex-start' })}>
        <Text style={[type.small, { fontSize: 13, textDecorationLine: 'underline' }]}>{hidden ? t('card.codeShow') : t('card.codeHide')}</Text>
      </Press>
    </View>
  )
}

/** A sheet of paper with a folded corner and the file type. */
export function Sheet({ ext }: { ext: string }) {
  return (
    <View style={{ width: 65, height: 85 }} aria-hidden>
      <Svg width={65} height={85}>
        <Polygon points="3,3 65,3 65,85 3,85" fill={colors.ground2} />
        <Path d="M0.5 0.5 H44.5 L61.5 17.5 V81.5 H0.5 Z" fill={colors.card} stroke={colors.line2} />
        <Path d="M44.5 0.5 V17.5 H61.5" fill={colors.ground2} stroke={colors.line2} />
        <Line x1={9} x2={40} y1={26} y2={26} stroke={colors.line} strokeWidth={2} />
        <Line x1={9} x2={52} y1={34} y2={34} stroke={colors.line} strokeWidth={2} />
        <Line x1={9} x2={32} y1={42} y2={42} stroke={colors.line} strokeWidth={2} />
      </Svg>
      <Text style={{ position: 'absolute', left: 9, bottom: 6, fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.1, color: colors.faint }}>{ext}</Text>
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
  msg: { paddingVertical: 9, paddingHorizontal: 12, gap: 1 },
  car: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  need: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.card },
  way: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  cell: { flex: 1, height: 62, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderTopWidth: 2, borderTopColor: colors.ink },
  boardTime: { fontFamily: fonts.thin, fontSize: 34, lineHeight: 36, letterSpacing: -0.7, color: colors.ink },
})
