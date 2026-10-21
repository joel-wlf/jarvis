// Today: Jarvis on his stage, the day's figures, and the feed of decisions.
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CardView } from '@/components/cards/CardView'
import { Floor } from '@/components/jarvis/Floor'
import { JarvisFigure } from '@/components/jarvis/JarvisFigure'
import { Subtitle } from '@/components/jarvis/Subtitle'
import { AskDock } from '@/components/today/AskDock'
import { GroupTabs } from '@/components/today/GroupTabs'
import { Modules } from '@/components/today/Modules'
import { Processing } from '@/components/today/Processing'
import { StatsStrip } from '@/components/today/Stats'
import { BlockButton, Micro } from '@/components/ui'
import { useWide } from '@/components/useWide'
import { clock, longDate } from '@/i18n/format'
import { useSession } from '@/state/session'
import { useToday } from '@/state/useToday'
import { colors, fonts, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

export default function Today() {
  const { t } = useTranslation()
  const wide = useWide()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height, width } = useWindowDimensions()
  const { session } = useSession()
  const s = useToday(wide)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const pad = wide ? 28 : layout.gutter

  const ask = (q: string) => router.push({ pathname: '/ask', params: { q } })
  const figureSize = wide ? Math.min(height * 0.3, 300) : Math.min(width * 0.54, 230)

  const header = (
    <View style={[st.top, { paddingHorizontal: pad, paddingTop: wide ? 24 : Math.max(18, insets.top) }]}>
      <View>
        <Text style={type.h1} accessibilityRole="header">
          {t('today.title')}
        </Text>
        <Text style={[type.sub, { marginTop: 6 }]}>{longDate()}</Text>
      </View>
      <Text style={[type.sub, { color: colors.ink2, fontSize: 13, paddingBottom: 3 }]}>{s.updatedAt ? t('today.updatedAt', { time: clock(s.updatedAt) }) : t('today.updatedNow')}</Text>
    </View>
  )

  const stageView = (
    <View
      style={[st.stage, wide ? { flex: 1, minHeight: 0 } : { height: Math.max(330, height * 0.46) }]}
      onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Floor width={stage.w} height={stage.h} />
      <JarvisFigure state={s.figure} size={figureSize} />
      <Subtitle text={s.say} lines={s.lines} onDone={s.onSayDone} style={wide ? { fontSize: 22, lineHeight: 29, maxWidth: 460 } : undefined} />
    </View>
  )

  const statsView = s.home ? (
    <View style={{ marginHorizontal: pad }}>
      <StatsStrip stats={s.home.stats} />
    </View>
  ) : null
  const modulesView = s.home ? <Modules modules={s.home.modules} lastSource={s.lastSource} wide={wide} /> : null
  // While Jarvis is still reading in, show how far it is (import, transcripts, search index, sorting)
  const processingView = s.status?.busy ? (
    <View style={{ marginHorizontal: pad, marginTop: 14 }}>
      <Processing status={s.status} />
    </View>
  ) : null

  const feed = (
    <View style={{ paddingTop: wide ? 28 : 26 }} accessibilityLabel={t('today.feedLabel')}>
      <View style={[st.feedHead, { paddingHorizontal: wide ? 24 : layout.gutter }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <Text style={type.h2} accessibilityRole="header">
            {t('today.feed')}
          </Text>
          <Text style={st.count}>{s.counts.all}</Text>
        </View>
        {session?.mode === 'mock' ? <Micro style={st.demo}>{t('common.demo')}</Micro> : null}
      </View>
      <GroupTabs counts={s.counts} value={s.filter} onChange={s.setFilter} padding={wide ? 24 : layout.gutter} />
      <View style={{ gap: 14, paddingHorizontal: wide ? 24 : layout.gutter, paddingBottom: wide ? 40 : 24 }}>
        {s.error && !s.cards ? (
          <View style={{ gap: 14 }}>
            <Text style={type.body}>{s.error}</Text>
            <BlockButton label={t('common.retry')} onPress={() => void s.reload()} variant="line" />
          </View>
        ) : !s.cards ? (
          <Text style={type.sub}>{t('common.loading')}</Text>
        ) : s.visible.length === 0 ? (
          <Text style={[type.body, { paddingVertical: 12 }]}>{s.counts.all ? t('today.emptyGroup') : t('today.emptyAll')}</Text>
        ) : (
          s.visible.map((c) => <CardView key={c.key} card={c} extra={s.extras[c.key]} suggesting={s.suggesting === c.key} selected={s.selected === c.key} onSelect={s.select} act={s.act} priority={s.priorityOf(c)} onPriority={s.setPriority} onChatRule={s.setChatRule} />)
        )}
      </View>
    </View>
  )

  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, minWidth: 0, paddingBottom: 20 }}>
          {header}
          {stageView}
          {statsView}
          {processingView}
          {modulesView}
          <AskDock onSubmit={ask} onFocusChange={(f) => s.setFigure(f ? 'listening' : 'idle')} style={{ marginTop: 14, marginHorizontal: 28 }} />
        </View>
        <ScrollView style={st.feedWide} contentContainerStyle={{ paddingBottom: 20 }}>
          {feed}
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: layout.navHeight + 76 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {header}
        {stageView}
        {statsView}
        {processingView}
        {modulesView}
        {feed}
      </ScrollView>
      <AskDock
        onSubmit={ask}
        onFocusChange={(f) => s.setFigure(f ? 'listening' : 'idle')}
        style={{ position: 'absolute', zIndex: 19, left: 12, right: 12, bottom: layout.navHeight + 10 + insets.bottom }}
      />
    </View>
  )
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  stage: { position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingTop: 8, paddingHorizontal: 20, paddingBottom: 18 },
  feedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 },
  count: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.block, color: colors.blockInk, overflow: 'hidden' },
  demo: { borderWidth: 1, borderColor: colors.line2, paddingHorizontal: 7, paddingVertical: 3 },
  feedWide: { width: '34%', minWidth: 400, flexGrow: 0, backgroundColor: colors.feedWide, borderLeftWidth: 1, borderLeftColor: colors.line },
})
