// Building blocks of the prototype's visual language: marks, micro labels, meta rows, routes,
// black action slabs, segmented button rows, hairline lists, fields and toggles. All corners sharp.
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native'
import type { Stat } from '@jarvis/contract'
import { colors, fonts, markGround, markInk } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon, type IconName } from './Icon'

type PressState = { pressed: boolean; hovered?: boolean }
/** Pressable whose style callback also receives the web hover state. */
export function Press({ style, ...rest }: Omit<PressableProps, 'style'> & { style?: (s: PressState) => StyleProp<ViewStyle> }) {
  return <Pressable {...rest} style={style as PressableProps['style']} />
}

export function Micro({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.micro, style]}>{children}</Text>
}

/** Small tinted label in the card's group colour, e.g. "Frage". */
export function Mark({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: markGround(color), paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontFamily: fonts.italic, fontSize: 12.5, lineHeight: 16, color: markInk(color) }}>{label}</Text>
    </View>
  )
}

/** Three micro-labelled values in a row (the prototype's .meta). */
export function Meta({ stats, size = 21 }: { stats: Stat[]; size?: number }) {
  return (
    <View style={s.meta}>
      {stats.slice(0, 3).map((st) => (
        // Like CSS grid 1fr: equal columns, but a long micro label widens its column instead of wrapping.
        <View key={st.label} style={{ flexGrow: 1, flexBasis: 0, minWidth: st.label.length * 7.7 }}>
          <Micro>{st.label}</Micro>
          <Text style={[type.value, { fontSize: size, marginTop: 3 }]} numberOfLines={1} adjustsFontSizeToFit>
            {st.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** a ── icon ── b, used for question/answer and train legs. */
export function Route({ a, aSub, b, bSub, icon = 'chat', color, dotted = true, mid }: { a: string; aSub?: string; b: string; bSub?: string; icon?: IconName; color: string; dotted?: boolean; mid?: string }) {
  return (
    <View style={s.route}>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.routeB}>{a}</Text>
        {aSub ? <Text style={type.small}>{aSub}</Text> : null}
      </View>
      <View style={s.routeLine}>
        <View style={[s.routeRule, { borderColor: color, borderStyle: dotted ? 'dotted' : 'solid' }]} />
        {mid ? <Text style={[type.small, { color: colors.muted }]}>{mid}</Text> : <Icon name={icon} size={14} color={color} />}
        <View style={[s.routeRule, { borderColor: color, borderStyle: dotted ? 'dotted' : 'solid' }]} />
      </View>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
        <Text style={s.routeB}>{b}</Text>
        {bSub ? <Text style={type.small}>{bSub}</Text> : null}
      </View>
    </View>
  )
}

/** The black action bar at the bottom of a card: a big italic line and a dark-grey button. */
export function Slab({ big, button, onPress, busy }: { big: string; button: string; onPress: () => void; busy?: boolean }) {
  return (
    <View style={s.slab}>
      <Text style={s.slabBig} numberOfLines={2}>
        {big}
      </Text>
      <Press
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed, hovered }) => [s.slabBtn, (pressed || hovered) && { backgroundColor: colors.block3 }, busy && { opacity: 0.6 }]}
      >
        <Text style={s.slabBtnText} numberOfLines={1}>
          {button}
        </Text>
      </Press>
    </View>
  )
}

export interface SegItem { key: string; label: string; on?: boolean; onPress: () => void; accessibilityLabel?: string }
/** Row of equal buttons with hairline dividers; the "on" one is black. */
export function Seg({ items, style }: { items: SegItem[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.seg, style]}>
      {items.map((it, i) => (
        <Press
          key={it.key}
          onPress={it.onPress}
          accessibilityRole="button"
          accessibilityLabel={it.accessibilityLabel}
          accessibilityState={{ selected: !!it.on }}
          style={({ pressed, hovered }) => [s.segBtn, i > 0 && s.segDivider, it.on ? { backgroundColor: pressed ? colors.block2 : colors.block } : (pressed || hovered) && { backgroundColor: colors.ground2 }]}
        >
          <Text style={[s.segText, it.on && { color: colors.blockInk }]} numberOfLines={2}>
            {it.label}
          </Text>
        </Press>
      ))}
    </View>
  )
}

/** Row in a hairline list: label left, optional detail, chevron or custom right side. */
export function Row({ title, sub, right, onPress, icon, first }: { title: string; sub?: string; right?: ReactNode; onPress?: () => void; icon?: IconName; first?: boolean }) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={18} color={colors.ink2} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={type.bodyItalic} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[type.small, { marginTop: 2 }]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={15} color={colors.faint} /> : null)}
    </>
  )
  if (!onPress) return <View style={[s.row, !first && s.rowLine]}>{content}</View>
  return (
    <Press onPress={onPress} accessibilityRole="button" style={({ pressed, hovered }) => [s.row, !first && s.rowLine, (pressed || hovered) && { backgroundColor: colors.ground2 }]}>
      {content}
    </Press>
  )
}

/** White panel with the soft card shadow. */
export function Panel({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[s.panel, padded && { padding: 16 }, style]}>{children}</View>
}

export function BlockButton({ label, onPress, disabled, busy, icon, style, variant = 'block' }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>; variant?: 'block' | 'line' }) {
  const block = variant === 'block'
  return (
    <Press
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed, hovered }) => [
        s.btn,
        block ? { backgroundColor: pressed || hovered ? colors.block2 : colors.block } : { backgroundColor: pressed || hovered ? colors.ground2 : colors.card, borderWidth: 1, borderColor: colors.line2 },
        (disabled || busy) && { opacity: 0.5 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={block ? colors.blockInk : colors.ink} /> : null}
      <Text style={[s.btnText, { color: block ? colors.blockInk : colors.ink }]}>{label}</Text>
    </Press>
  )
}

export function Field({ label, help, error, style, ...rest }: TextInputProps & { label: string; help?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Micro>{label}</Micro>
      <TextInput
        placeholderTextColor={colors.faint}
        selectionColor={colors.blue}
        style={[s.input, rest.multiline && { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }, error ? { borderColor: colors.warn } : null, style]}
        accessibilityLabel={label}
        {...rest}
      />
      {error ? <Text style={[type.small, { color: colors.warn }]}>{error}</Text> : help ? <Text style={type.small}>{help}</Text> : null}
    </View>
  )
}

export function Toggle({ label, help, value, onChange }: { label: string; help?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Press onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={() => s.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={type.bodyItalic}>{label}</Text>
        {help ? <Text style={[type.small, { marginTop: 2 }]}>{help}</Text> : null}
      </View>
      <View style={[s.toggle, value && { backgroundColor: colors.block, borderColor: colors.block }]}>
        <View style={[s.knob, value ? { left: 21, backgroundColor: colors.blockInk } : { left: 3 }]} />
      </View>
    </Press>
  )
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.line }, style]} />
}

/** Notice line with a small square marker; level decides the marker colour, the text says the rest. */
export function Notice({ text, level = 'info' }: { text: string; level?: 'info' | 'warn' | 'error' | 'ok' }) {
  const c = { info: colors.faint, warn: '#E39A2D', error: colors.warn, ok: colors.green }[level]
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 6, height: 6, backgroundColor: c, marginTop: 7 }} />
      <Text style={[type.body, { flex: 1 }]}>{text}</Text>
    </View>
  )
}

export const s = StyleSheet.create({
  meta: { flexDirection: 'row', gap: 10 },
  route: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routeB: { fontFamily: fonts.italic, fontSize: 15, lineHeight: 19, color: colors.ink },
  routeLine: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeRule: { flex: 1, borderTopWidth: 1.5 },
  slab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: colors.block, marginHorizontal: -18, paddingVertical: 10, paddingRight: 10, paddingLeft: 18, minHeight: 60 },
  slabBig: { flex: 1, fontFamily: fonts.light, fontSize: 21, lineHeight: 24, letterSpacing: -0.2, color: colors.blockInk },
  slabBtn: { minHeight: 40, maxWidth: '55%', justifyContent: 'center', backgroundColor: colors.block2, paddingHorizontal: 16 },
  slabBtnText: { fontFamily: fonts.italic, fontSize: 14.5, color: colors.blockInk },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: colors.line },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, paddingHorizontal: 6 },
  segDivider: { borderLeftWidth: 1, borderLeftColor: colors.line },
  segText: { fontFamily: fonts.italic, fontSize: 14.5, lineHeight: 17, textAlign: 'center', color: colors.ink2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.card },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  panel: { backgroundColor: colors.card, boxShadow: '0px 1px 1px rgba(20, 26, 36, 0.03), 0px 8px 22px -12px rgba(20, 26, 36, 0.14)' },
  btn: { minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnText: { fontFamily: fonts.italic, fontSize: 16 },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.card, paddingHorizontal: 14, fontFamily: fonts.italic, fontSize: 16, color: colors.ink, borderRadius: 0 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8 },
  toggle: { width: 42, height: 24, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.ground2 },
  knob: { position: 'absolute', top: 3, width: 16, height: 16, backgroundColor: colors.faint },
})

/** Wrapping set of options; the chosen one is black. For choices with more options than a Seg holds. */
export function Choice<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T) => void; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Micro>{label}</Micro>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value
          return (
            <Press
              key={String(o.value)}
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={({ hovered }) => [{ minHeight: 38, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: on ? colors.block : colors.line2, backgroundColor: on ? colors.block : hovered ? colors.ground2 : colors.card }]}
            >
              <Text style={[s.segText, on && { color: colors.blockInk }]}>{o.label}</Text>
            </Press>
          )
        })}
      </View>
    </View>
  )
}

/** Five short bars for closeness; the count is also in the accessibility label. */
export function Closeness({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end' }} accessible accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ width: 4, height: 6 + i * 2, backgroundColor: i <= n ? colors.ink : colors.line2 }} />
      ))}
    </View>
  )
}

export function Avatar({ initials, size = 44 }: { initials: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground2, borderWidth: 1, borderColor: colors.line }}>
      <Text style={{ fontFamily: fonts.light, fontSize: size * 0.38, color: colors.ink2 }}>{initials}</Text>
    </View>
  )
}
