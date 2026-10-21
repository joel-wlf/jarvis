// Phones: plain list -> detail navigation. Wide: the list stays on the left, the URL
// (/people/<jid>) says who is open on the right, so deep links and back both work.
import { useEffect } from 'react'
import { Slot, useGlobalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MasterDetail } from '@/components/MasterDetail'
import { PeopleList, PeopleSearch, usePeopleList } from '@/components/people/PeopleList'
import { useWide } from '@/components/useWide'

export default function PeopleLayout() {
  const wide = useWide()
  return wide ? <WideShell /> : <Slot />
}

function WideShell() {
  const { t } = useTranslation()
  const router = useRouter()
  const { jid } = useGlobalSearchParams<{ jid?: string }>()
  const list = usePeopleList()
  const first = list.people?.[0]?.jid

  // No empty right half: with nothing chosen, open the closest person.
  useEffect(() => {
    if (!jid && first) router.replace({ pathname: '/people/[jid]', params: { jid: first } })
  }, [jid, first, router])

  return (
    <MasterDetail
      title={t('people.title')}
      sub={t('people.sub')}
      toolbar={<PeopleSearch q={list.q} setQ={list.setQ} />}
      master={<PeopleList list={list} selected={jid} onSelect={(j) => router.replace({ pathname: '/people/[jid]', params: { jid: j } })} />}
      detail={<Slot />}
    />
  )
}
