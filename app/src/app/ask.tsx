// Ask Jarvis: a full-screen conversation, streamed from POST /ask as Server-Sent Events.
// The figure listens, thinks and speaks; answers name their sources. No speech bubbles.
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { JarvisState } from '@jarvis/contract'
import { Icon } from '@/components/Icon'
import { JarvisFigure } from '@/components/jarvis/JarvisFigure'
import { AskDock } from '@/components/today/AskDock'
import { BlockButton, Micro, Press } from '@/components/ui'
import { useWide } from '@/components/useWide'
import { ago, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { colors, fonts, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

interface Turn { id: number; question: string; answer: string; sources: { label: string; at?: string }[]; status: 'streaming' | 'done' | 'error'; error?: string }

export default function Ask() {
  const { t } = useTranslation()
  const { api } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const wide = useWide()
  const params = useLocalSearchParams<{ q?: string }>()
  const [turns, setTurns] = useState<Turn[]>([])
  const [figure, setFigure] = useState<JarvisState>('idle')
  const conversation = useRef<string | undefined>(undefined)
  const abort = useRef<AbortController | null>(null)
  const scroll = useRef<ScrollViewInstance>(null)
  const started = useRef(false)

  const patch = (id: number, fn: (t: Turn) => Turn) => setTurns((all) => all.map((x) => (x.id === id ? fn(x) : x)))

  const ask = async (question: string) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    const id = Date.now()
    setTurns((all) => [...all, { id, question, answer: '', sources: [], status: 'streaming' }])
    setFigure('thinking')
    try {
      await api.ask({ question, conversationId: conversation.current }, (e) => {
        if (e.type === 'state') setFigure(e.state)
        else if (e.type === 'delta') patch(id, (x) => ({ ...x, answer: x.answer + e.text }))
        else if (e.type === 'source') patch(id, (x) => ({ ...x, sources: [...x.sources, { label: e.label, at: e.at }] }))
        else if (e.type === 'done') {
          conversation.current = e.conversationId
          patch(id, (x) => ({ ...x, status: 'done' }))
        } else if (e.type === 'error') {
          patch(id, (x) => ({ ...x, status: 'error', error: e.message }))
          setFigure('error')
        }
      }, ctrl.signal)
      patch(id, (x) => (x.status === 'streaming' ? { ...x, status: 'done' } : x))
      setFigure((f) => (f === 'error' ? f : 'idle'))
    } catch (e) {
      if (ctrl.signal.aborted) {
        patch(id, (x) => ({ ...x, status: 'done' }))
        setFigure('idle')
        return
      }
      patch(id, (x) => ({ ...x, status: 'error', error: errorText(e) }))
      setFigure('error')
    }
  }

  useEffect(() => {
    if (!started.current && params.q) {
      started.current = true
      void ask(params.q)
    }
    return () => abort.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const streaming = turns.some((x) => x.status === 'streaming')
  const pad = wide ? 28 : layout.gutter
  const examples = t('ask.examples', { returnObjects: true }) as string[]

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[st.bar, { paddingTop: Math.max(12, insets.top), paddingHorizontal: pad }]}>
        <Text style={[type.h2, { flex: 1 }]} accessibilityRole="header">
          {t('ask.title')}
        </Text>
        <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel={t('common.close')} hitSlop={8} style={({ hovered }) => [st.close, hovered && { backgroundColor: colors.card }]}>
          <Icon name="x" size={18} color={colors.ink2} />
        </Press>
      </View>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={[wide ? st.wideRow : st.col, { paddingHorizontal: pad }]}>
          {wide ? (
            <View style={st.figureCol}>
              <View style={st.figureSticky}>
                <JarvisFigure state={figure} size={190} />
              </View>
            </View>
          ) : null}
          <View style={wide ? st.reading : { width: '100%' }}>
          {wide ? null : (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <JarvisFigure state={figure} size={132} />
            </View>
          )}
          {turns.length === 0 ? (
            <View style={{ gap: 18 }}>
              <Text style={[type.voice, wide ? { textAlign: 'left', fontSize: 24, lineHeight: 31, paddingTop: 28 } : { alignSelf: 'center', maxWidth: 420 }]}>{t('ask.intro')}</Text>
              <View style={st.examples}>
                {examples.map((ex, i) => (
                  <Press key={ex} onPress={() => void ask(ex)} accessibilityRole="button" style={({ pressed, hovered }) => [st.example, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, (pressed || hovered) && { backgroundColor: colors.ground2 }]}>
                    <Text style={[type.bodyItalic, { flex: 1 }]}>{ex}</Text>
                    <Icon name="arrow" size={15} color={colors.faint} />
                  </Press>
                ))}
              </View>
            </View>
          ) : (
            turns.map((x) => (
              <View key={x.id} style={st.turn}>
                <View style={{ gap: 4 }}>
                  <Micro>{t('ask.you')}</Micro>
                  <Text style={[type.bodyItalic, { fontSize: 17, lineHeight: 23 }]}>{x.question}</Text>
                </View>
                <View style={{ gap: 6 }}>
                  <Micro>{t('ask.jarvis')}</Micro>
                  {x.answer ? <Text style={st.answer}>{x.answer}</Text> : x.status === 'streaming' ? <Text style={[st.answer, { color: colors.faint }]}>…</Text> : null}
                  {x.status === 'error' ? <Text style={[type.body, { color: colors.warn }]}>{x.error ?? t('ask.failed')}</Text> : null}
                </View>
                {x.sources.length ? (
                  <View style={{ gap: 8 }}>
                    <Micro>{t('ask.sources')}</Micro>
                    {x.sources.map((s) => (
                      <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Icon name="link" size={13} color={colors.muted} />
                        <Text style={[type.small, { fontSize: 13, flex: 1 }]}>{s.label}</Text>
                        {s.at ? <Text style={type.tiny}>{ago(s.at)}</Text> : null}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
          </View>
        </View>
      </ScrollView>
      <View style={[wide ? st.wideRow : st.col, { paddingHorizontal: wide ? 28 : 12, paddingBottom: Math.max(12, insets.bottom) }]}>
        {wide ? <View style={st.figureCol} /> : null}
        <View style={[wide ? st.reading : { width: '100%' }, { gap: 10 }]}>
          {streaming ? <BlockButton label={t('ask.stop')} icon="stop" variant="line" onPress={() => abort.current?.abort()} /> : null}
          <AskDock onSubmit={(q) => void ask(q)} onFocusChange={(f) => !streaming && setFigure(f ? 'listening' : 'idle')} autoFocus={!params.q && Platform.OS === 'web'} />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 6 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  col: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  // Wide: the figure keeps watch on the left while the answer reads in a ~720px column.
  wideRow: { width: '100%', maxWidth: layout.readingMax + 200 + 40 + 56, alignSelf: 'center', flexDirection: 'row', gap: 40 },
  figureCol: { width: 200, flexShrink: 0 },
  figureSticky: { alignItems: 'center', paddingTop: 20, ...({ position: 'sticky', top: 0 } as object) },
  reading: { flex: 1, minWidth: 0, maxWidth: layout.readingMax },
  examples: { backgroundColor: colors.card, boxShadow: '0px 1px 1px rgba(20, 26, 36, 0.03), 0px 8px 22px -12px rgba(20, 26, 36, 0.14)' },
  example: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, backgroundColor: colors.card },
  turn: { gap: 16, paddingVertical: 20, borderTopWidth: 1, borderTopColor: colors.line2 },
  answer: { fontFamily: fonts.light, fontSize: 20, lineHeight: 28, letterSpacing: -0.2, color: colors.ink },
})
