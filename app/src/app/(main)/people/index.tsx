// People: everyone Jarvis knows, closest first.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PersonSummary } from '@jarvis/contract'
import { Page } from '@/components/Page'
import { Avatar, BlockButton, Closeness, Field, Panel, Press } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

export default function People() {
  const { t } = useTranslation()
  const { api } = useSession()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<PersonSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (query: string) => {
    try {
      setError(null)
      const r = await api.people(query || undefined)
      setPeople([...r.people].sort((a, b) => (b.closeness ?? 0) - (a.closeness ?? 0) || a.name.localeCompare(b.name)))
    } catch (e) {
      setError(errorText(e))
    }
  }, [api])

  useEffect(() => {
    const timer = setTimeout(() => void load(q), q ? 250 : 0)
    return () => clearTimeout(timer)
  }, [q, load])

  return (
    <Page
      title={t('people.title')}
      sub={t('people.sub')}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true)
        await load(q)
        setRefreshing(false)
      }}
    >
      <Field label={t('common.search')} value={q} onChangeText={setQ} placeholder={t('people.search')} autoCapitalize="none" autoCorrect={false} />
      {error ? (
        <View style={{ gap: 12 }}>
          <Text style={type.body}>{error}</Text>
          <BlockButton label={t('common.retry')} variant="line" onPress={() => void load(q)} />
        </View>
      ) : !people ? (
        <Text style={type.sub}>{t('common.loading')}</Text>
      ) : people.length === 0 ? (
        <Text style={type.body}>{t('common.empty')}</Text>
      ) : (
        <Panel padded={false}>
          {people.map((p, i) => {
            const sub = [p.relationship ? t(`people.relationship.${p.relationship}`) : null, p.lastContactAt ? t('people.lastContact', { when: ago(p.lastContactAt) }) : null].filter(Boolean).join(' · ')
            return (
              <Press
                key={p.jid}
                onPress={() => router.push({ pathname: '/people/[jid]', params: { jid: p.jid } })}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}, ${sub}`}
                style={({ pressed, hovered }) => [
                  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: pressed || hovered ? colors.ground2 : colors.card },
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                ]}
              >
                <Avatar initials={p.initials} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.bodyItalic, { fontSize: 17 }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[type.small, { marginTop: 2 }]} numberOfLines={1}>
                    {sub}
                  </Text>
                  {p.openCards ? <Text style={[type.small, { color: colors.ink2, marginTop: 2 }]}>{t('people.open', { count: p.openCards })}</Text> : null}
                </View>
                {p.closeness ? <Closeness n={p.closeness} label={t('people.closenessValue', { n: p.closeness })} /> : null}
              </Press>
            )
          })}
        </Panel>
      )}
    </Page>
  )
}
