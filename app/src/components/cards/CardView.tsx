// One decision card: head (mark, title, source), a lean type-specific middle, micro stats,
// and a black action slab or a segmented row. The selected card shows the other suggestions.
import { memo, type ReactNode } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Card, CardAction, Suggestion } from '@jarvis/contract'
import { colors, groupColor, shadow } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon } from '../Icon'
import { Mark, Meta, Micro, Press, Route, Seg, Slab, type SegItem } from '../ui'
import * as P from './parts'

export type ActFn = (card: Card, action: CardAction) => void

interface Spec {
  /** replaces "chat · when" under the title */
  sub?: string
  body: ReactNode
  /** black slab: big line; the button is the primary suggestion */
  headline?: string
  /** segmented row instead of the slab */
  seg?: SegItem[]
  /** no footer at all (reaction cards act through their emoji row) */
  bare?: boolean
}

const primaryOf = (c: Card): Suggestion | undefined => c.suggestions.find((s) => s.primary) ?? c.suggestions[0]

/** Buttons for segmented cards: extra actions and the non-primary suggestions, then the primary in black. */
function segFor(card: Card, act: ActFn, extra: { key: string; label: string; action: CardAction }[] = []): SegItem[] {
  const primary = primaryOf(card)
  const rest = card.suggestions.filter((s) => s !== primary)
  return [
    ...extra.map((x) => ({ key: x.key, label: x.label, onPress: () => act(card, x.action) })),
    ...rest.map((s) => ({ key: s.id, label: s.label, onPress: () => act(card, s.action) })),
    ...(primary ? [{ key: primary.id, label: primary.label, on: true, onPress: () => act(card, primary.action) }] : []),
  ]
}

function spec(card: Card, act: ActFn, t: TFunction): Spec {
  const c = groupColor[card.group]
  switch (card.type) {
    case 'question': {
      const d = card.data
      return {
        body: (
          <>
            <Route a={d.person.name} aSub={card.source.when} b={t('card.answer')} bSub={t('card.repliesReady', { count: card.suggestions.length })} color={c} />
            <P.Quote text={d.quote} />
            <Meta stats={d.stats} />
          </>
        ),
        headline: t('card.repliesReady', { count: card.suggestions.length }),
      }
    }
    case 'voice': {
      const d = card.data
      return {
        sub: `${d.person.name} · ${card.source.when}`,
        body: (
          <>
            <P.VoiceRow seconds={d.durationSec} />
            <P.Quote text={d.summary} />
            <Meta stats={d.stats} />
          </>
        ),
        headline: t('card.replyPrepared'),
      }
    }
    case 'reaction': {
      const d = card.data
      return { bare: true, body: <P.Emojis emojis={d.emojis} onPick={(emoji) => act(card, { kind: 'react', emoji, messageId: d.messageId })} /> }
    }
    case 'event': {
      const d = card.data
      return {
        body: (
          <>
            <P.DateBig big={d.day} line={`${d.weekday} · ${d.month}`} small={d.place} />
            <Meta stats={d.stats} />
          </>
        ),
        headline: `${d.weekday} ${d.time}`,
      }
    }
    case 'conflict': {
      const d = card.data
      return {
        body: (
          <>
            <P.Timeline data={d} />
            <Meta stats={d.stats} />
          </>
        ),
        headline: d.free ? t('card.free', { when: d.free }) : undefined,
      }
    }
    case 'birthday': {
      const d = card.data
      return {
        body: (
          <>
            <P.DateBig big={d.age !== undefined ? String(d.age) : d.date} line={d.age !== undefined ? t('card.years', { date: d.date }) : undefined} small={d.note} />
            <P.Ideas items={d.ideas} />
          </>
        ),
        headline: t('card.congrats'),
      }
    }
    case 'reminder': {
      const d = card.data
      return {
        body: <P.DateBig big={d.time} line={card.source.when} small={d.note} />,
        seg: segFor(
          card,
          act,
          d.snoozeOptions.map((o) => ({ key: `snooze-${o.label}`, label: o.label, action: { kind: 'snooze', until: o.until } as CardAction })),
        ),
      }
    }
    case 'task': {
      const d = card.data
      return {
        body: (
          <>
            {d.amount ? <P.DateBig big={d.amount} line={d.recipient ? t('card.to', { name: d.recipient }) : undefined} small={d.note} /> : d.note ? <P.Quote text={d.note} /> : null}
            {d.daysLeft !== undefined && d.daysTotal ? <P.Due fraction={1 - d.daysLeft / d.daysTotal} label={t('card.daysLeft', { count: d.daysLeft })} color={c} /> : null}
          </>
        ),
        headline: card.source.when,
      }
    }
    case 'poll': {
      const d = card.data
      const rec = d.options.find((o) => o.recommended)
      return {
        sub: `${card.source.chat} · ${t('card.votedOf', { voted: d.voted })}`,
        body: <P.Poll data={d} color={c} onVote={(option) => act(card, { kind: 'vote', option, pollId: d.pollId })} />,
        headline: rec ? t('card.suits', { option: rec.label }) : undefined,
      }
    }
    case 'insight': {
      const d = card.data
      return {
        body: (
          <>
            <P.Quote text={d.text} />
            <P.Sources items={d.sources} />
          </>
        ),
      }
    }
    case 'digest': {
      const d = card.data
      return {
        body: (
          <>
            <P.Numbered items={d.bullets} />
            {d.mine ? <P.Mine text={d.mine} /> : null}
          </>
        ),
        seg: segFor(card, act),
      }
    }
    case 'shopping': {
      const d = card.data
      return { body: <P.CheckList items={d.items} />, headline: t('card.openItems', { count: P.openCount(d.items) }) }
    }
    case 'parcel': {
      const d = card.data
      return {
        body: (
          <>
            <P.Steps steps={d.steps} current={d.current} color={c} />
            <Meta stats={d.stats} />
          </>
        ),
        headline: d.window ?? card.source.when,
      }
    }
    case 'money': {
      const d = card.data
      return {
        body: (
          <>
            <P.Ledger from={d.from} to={d.to} amount={d.amount} />
            {d.note ? <P.Quote text={d.note} /> : null}
          </>
        ),
        seg: segFor(card, act),
      }
    }
    case 'followup': {
      const d = card.data
      return {
        body: (
          <>
            <P.DateBig big={String(d.days)} line={t('card.daysNoReply')} small={d.note} />
            <P.Promise_ text={d.promise} caption={d.promisedAt} />
          </>
        ),
        headline: t('card.replyPrepared'),
      }
    }
    case 'trip': {
      const d = card.data
      return {
        sub: `${card.source.when} · ${t('card.with', { name: card.source.chat })}`,
        body: (
          <>
            <P.Board depart={d.depart} arrive={d.arrive} fromCity={d.fromCity} toCity={d.toCity} change={d.change} color={c} />
            <Meta
              stats={[
                { label: t('card.track'), value: d.track ?? '–' },
                { label: t('card.delay'), value: d.delayMin ? t('card.delayMin', { min: d.delayMin }) : t('card.onTime') },
                { label: t('card.duration'), value: d.duration ?? '–' },
              ]}
            />
          </>
        ),
      }
    }
    case 'place': {
      const d = card.data
      return {
        body: (
          <>
            <P.MiniMap color={c} />
            <View>
              <Text style={[type.bodyItalic, { fontSize: 16, marginBottom: 2 }]}>{d.name}</Text>
              {d.detail ? <P.Quote text={d.detail} /> : null}
            </View>
          </>
        ),
        headline: card.source.when,
      }
    }
    case 'person':
      return { body: <P.Facts facts={card.data.facts} /> }
    case 'address':
      return { body: <P.Address lines={card.data.lines} />, seg: segFor(card, act, [{ key: 'dismiss', label: t('card.notNeeded'), action: { kind: 'dismiss' } }]) }
    case 'link': {
      const d = card.data
      return { body: <P.LinkPreview domain={d.domain} headline={d.headline} readingTime={d.readingTime} />, seg: segFor(card, act, [{ key: 'open', label: t('card.open'), action: { kind: 'open', url: d.url } }]) }
    }
    case 'routine': {
      const d = card.data
      return {
        body: (
          <>
            <P.Streak weeks={d.weeks} color={c} />
            <Meta stats={d.stats} />
          </>
        ),
      }
    }
    case 'photos': {
      const d = card.data
      return {
        body: (
          <>
            <P.Thumbs count={d.count} />
            <Meta
              stats={[
                { label: t('card.photos'), value: String(d.count) },
                { label: t('card.withYou'), value: String(d.withOwner) },
                { label: t('card.album'), value: card.source.chat },
              ]}
            />
          </>
        ),
        headline: t('card.photosWithYou', { count: d.withOwner }),
      }
    }
  }
}

interface Props {
  card: Card
  selected: boolean
  onSelect: (key: string) => void
  act: ActFn
}

export const CardView = memo(function CardView({ card, selected, onSelect, act }: Props) {
  const { t } = useTranslation()
  const c = groupColor[card.group]
  const sp = spec(card, act, t)
  const primary = primaryOf(card)
  const others = sp.seg || sp.bare ? [] : card.suggestions.filter((s) => s !== primary)
  const label = t(`cardType.${card.type}`)

  const head =
    card.type === 'person' ? (
      <View style={[st.head, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View style={st.avatar}>
          <Text style={st.avatarText}>{card.data.person.initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Mark label={label} color={c} />
          <Text style={[type.cardTitle, { marginTop: 8 }]}>{card.title}</Text>
          <Text style={[type.sub, { marginTop: 3 }]}>{card.source.chat}</Text>
        </View>
      </View>
    ) : (
      <View style={st.head}>
        <Mark label={label} color={c} />
        <Text style={[type.cardTitle, { marginTop: 8 }]}>{card.title}</Text>
        <Text style={[type.sub, { marginTop: 3 }]}>{sp.sub ?? `${card.source.chat} · ${card.source.when}`}</Text>
      </View>
    )

  // Short labels fit the slab button; long ones (a full reply) become the verb, the reply text is in the card.
  const verb = primary ? t(card.group === 'reply' && primary.action.kind === 'send' ? 'verb.reply' : `verb.${primary.action.kind}`) : ''
  return (
    <Press
      onPress={() => onSelect(card.key)}
      // On web a role of button would render a <button>, which cannot contain the card's own buttons.
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${card.title}`}
      style={({ hovered }) => [st.card, { boxShadow: selected ? `inset 0px 0px 0px 1px ${colors.line2}, ${shadow.lift}` : hovered ? shadow.lift : shadow.card }]}
    >
      {selected ? <View style={[st.selBar, { backgroundColor: c }]} /> : null}
      <View>
        {head}
        <Press onPress={() => act(card, { kind: 'dismiss' })} accessibilityRole="button" accessibilityLabel={t('card.dismiss')} hitSlop={6} style={({ hovered }) => [st.dismiss, hovered && { opacity: 1 }]}>
          {(state) => <Icon name="x" size={15} color={(state as { hovered?: boolean }).hovered ? colors.ink : colors.faint} />}
        </Press>
      </View>
      {sp.body}
      {selected && card.context ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
          <View style={{ width: 6, height: 6, backgroundColor: c, transform: [{ translateY: -1 }] }} />
          <Text style={[type.bodyItalic, { fontSize: 14.5, flex: 1, color: colors.ink2 }]}>{card.context}</Text>
        </View>
      ) : null}
      {selected && others.length ? (
        <View style={st.more}>
          <Micro style={{ paddingTop: 12, paddingBottom: 4, paddingHorizontal: 18 }}>{t('card.otherSuggestions')}</Micro>
          {others.map((s, i) => (
            <Press key={s.id} onPress={() => act(card, s.action)} accessibilityRole="button" style={({ pressed, hovered }) => [st.moreBtn, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, (pressed || hovered) && { backgroundColor: colors.ground2 }]}>
              <Text style={[type.body, { fontSize: 15, flex: 1 }]}>{s.action.kind === 'send' ? s.action.text : s.label}</Text>
              <Icon name="arrow" size={15} color={colors.faint} />
            </Press>
          ))}
        </View>
      ) : null}
      {sp.seg ? <Seg items={sp.seg} style={{ marginBottom: 18 }} /> : null}
      {!sp.seg && !sp.bare && primary ? (
        <Slab big={sp.headline ?? primary.label} button={sp.headline && primary.label.length <= 18 ? primary.label : verb} onPress={() => act(card, primary.action)} />
      ) : null}
      {!sp.seg && !sp.bare && !primary ? <View style={{ height: 4 }} /> : null}
    </Press>
  )
})

const st = StyleSheet.create({
  card: { position: 'relative', backgroundColor: colors.card, paddingTop: 16, paddingHorizontal: 18, gap: 14 },
  selBar: { position: 'absolute', left: 0, right: 0, top: 0, height: 2, zIndex: 1 },
  head: { paddingRight: 34, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  dismiss: { position: 'absolute', top: -6, right: -8, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground2 },
  avatarText: { fontFamily: 'Urbanist-LightItalic', fontSize: 20, color: colors.ink2 },
  more: { marginHorizontal: -18, borderTopWidth: 1, borderTopColor: colors.line },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, backgroundColor: colors.card },
})
