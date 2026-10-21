// Legal notes: reachable before pairing (outside the tab group) and from System.
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Page } from '@/components/Page'
import { Panel } from '@/components/ui'
import { type } from '@/theme/type'

export default function Legal() {
  const { t } = useTranslation()
  const sections = t('legal.sections', { returnObjects: true }) as { title: string; body: string }[]
  return (
    <Page title={t('legal.title')} sub={t('legal.sub')} back bare wideMax={720}>
      <Panel style={{ gap: 22 }}>
        {sections.map((s) => (
          <View key={s.title} style={{ gap: 6 }}>
            <Text style={type.cardTitle} accessibilityRole="header">
              {s.title}
            </Text>
            <Text style={type.body}>{s.body}</Text>
          </View>
        ))}
      </Panel>
    </Page>
  )
}
