// "What is this about?": the conversation a card comes from, loaded when the owner asks for it.
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CardContextResponse } from '@jarvis/contract'
import { clock, errorText, weekday } from '@/i18n/format'
import { useSession } from '@/state/session'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon } from '../Icon'
import { Micro, Press } from '../ui'

export function Background({ cardKey, color }: { cardKey: string; color: string }) {
  const { t } = useTranslation()
  const { api } = useSession()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<CardContextResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next || data || busy) return
    setBusy(true)
    setError(null)
    try {
      setData(await api.context(cardKey))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={st.wrap}>
      <Press onPress={() => void toggle()} accessibilityRole="button" accessibilityState={{ expanded: open }} style={({ hovered }) => [st.head, hovered && { backgroundColor: colors.ground2 }]}>
        <Micro style={{ flex: 1 }}>{t('card.background')}</Micro>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="arrow" size={14} color={colors.faint} />
        </View>
      </Press>
      {open ? (
        <View style={st.body}>
          {busy ? <ActivityIndicator color={colors.ink} style={{ alignSelf: 'flex-start' }} /> : null}
          {error ? <Text style={[type.small, { color: colors.warn }]}>{error}</Text> : null}
          {data?.topic ? (
            <View style={{ gap: 2 }}>
              <Text style={[type.small, { color: colors.ink }]}>{t('card.topic', { title: data.topic.title })}</Text>
              {data.topic.summary ? <Text style={type.small}>{data.topic.summary}</Text> : null}
            </View>
          ) : null}
          {data?.summary ? <Text style={[type.bodyItalic, { fontSize: 14.5, color: colors.ink2 }]}>{data.summary}</Text> : null}
          {data && data.messages.length ? (
            <View style={{ gap: 8 }}>
              {data.chat ? <Micro>{t('card.inChatNamed', { chat: data.chat })}</Micro> : null}
              {data.messages.map((m, i) => {
                const at = new Date(m.at)
                return (
                  <View key={i} style={[st.msg, m.highlight && { borderLeftColor: color }, m.fromMe && { backgroundColor: colors.ground2 }]}>
                    <Text style={[type.tiny, { color: colors.ink2 }]}>
                      {m.who} · {weekday(at)} {clock(at)}
                    </Text>
                    <Text style={[type.body, { fontSize: 14.5, lineHeight: 20 }]}>{m.text}</Text>
                  </View>
                )
              })}
            </View>
          ) : data && !busy ? (
            <Text style={type.small}>{t('card.noBackground')}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const st = StyleSheet.create({
  wrap: { marginHorizontal: -18, borderTopWidth: 1, borderTopColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18 },
  body: { paddingHorizontal: 18, paddingBottom: 14, gap: 12 },
  msg: { borderLeftWidth: 2, borderLeftColor: colors.line2, paddingLeft: 10, paddingVertical: 4, gap: 2 },
})
