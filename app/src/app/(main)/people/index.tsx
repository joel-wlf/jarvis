// People: everyone Jarvis knows, closest first. On wide screens the list lives in people/_layout
// next to the selected person, so this route only draws the phone list.
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Page } from '@/components/Page'
import { PeopleList, PeopleSearch, usePeopleList } from '@/components/people/PeopleList'
import { useWide } from '@/components/useWide'

export default function People() {
  const { t } = useTranslation()
  const router = useRouter()
  const wide = useWide()
  const list = usePeopleList()
  const [refreshing, setRefreshing] = useState(false)
  if (wide) return null
  return (
    <Page
      title={t('people.title')}
      sub={t('people.sub')}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true)
        await list.reload()
        setRefreshing(false)
      }}
    >
      <PeopleSearch q={list.q} setQ={list.setQ} />
      <PeopleList list={list} onSelect={(jid) => router.push({ pathname: '/people/[jid]', params: { jid } })} />
    </Page>
  )
}
