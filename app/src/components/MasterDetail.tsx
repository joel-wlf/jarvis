// Wide-screen shell shared by People and Memory: the list in a fixed column on the left,
// the selected item on the right. Phones never mount it; they keep list -> detail navigation.
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

interface Props {
  title: string
  sub?: string
  /** actions next to the title, e.g. "new" */
  right?: ReactNode
  /** pinned above the scrolling list, e.g. the search field */
  toolbar?: ReactNode
  master: ReactNode
  detail: ReactNode
}

export function MasterDetail({ title, sub, right, toolbar, master, detail }: Props) {
  return (
    <View style={st.root}>
      <View style={st.master}>
        <View style={st.head}>
          <View style={{ flex: 1 }}>
            <Text style={type.h1} accessibilityRole="header">
              {title}
            </Text>
            {sub ? <Text style={[type.sub, { marginTop: 6 }]}>{sub}</Text> : null}
          </View>
          {right}
        </View>
        {toolbar ? <View style={st.toolbar}>{toolbar}</View> : null}
        <ScrollView contentContainerStyle={st.masterBody} keyboardShouldPersistTaps="handled">
          {master}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={st.detailScroll} keyboardShouldPersistTaps="handled">
        <View style={st.detail}>{detail}</View>
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  master: { width: layout.masterWidth, flexGrow: 0, flexShrink: 0, backgroundColor: colors.feedWide, borderRightWidth: 1, borderRightColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 24, paddingTop: 24 },
  toolbar: { paddingHorizontal: 24, paddingTop: 18 },
  masterBody: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 40, gap: 22 },
  detailScroll: { paddingBottom: 40 },
  detail: { width: '100%', maxWidth: layout.detailMax + 56, paddingHorizontal: 28, paddingTop: 24, gap: 22 },
})
