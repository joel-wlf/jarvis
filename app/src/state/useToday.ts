// State of the Today screen: home figures, the card feed, the figure's state and its sentence.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Card, CardAction, HomeResponse, JarvisState } from '@jarvis/contract'
import type { Filter } from '@/components/today/GroupTabs'
import { errorText } from '@/i18n/format'
import { useSession } from './session'
import { useToast } from './toast'

const byUrgency = (a: Card, b: Card) => b.urgency - a.urgency

export function useToday(wide: boolean) {
  const { t } = useTranslation()
  const { api } = useSession()
  const toast = useToast()
  const [home, setHome] = useState<HomeResponse | null>(null)
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [figure, setFigure] = useState<JarvisState>('idle')
  const [say, setSay] = useState('')
  const [afterSay, setAfterSay] = useState<JarvisState | null>(null)
  const [lastSource, setLastSource] = useState<string | undefined>()
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const revert = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const speakUntil = useRef(0)
  const cardsRef = useRef<Card[]>([])
  cardsRef.current = cards ?? []

  const summary = useCallback((list: Card[]) => (list[0] ? t('today.summary', { count: list.length, title: list[0].title }) : t('today.allDone')), [t])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [h, c] = await Promise.all([api.home(), api.cards()])
      const sorted = [...c.cards].sort(byUrgency)
      setHome(h)
      setCards(sorted)
      setFigure(h.jarvis.state)
      setSay(h.jarvis.say || summary(sorted))
    } catch (e) {
      setError(errorText(e))
      setFigure('error')
      setSay(errorText(e))
    }
  }, [api, summary])

  useEffect(() => {
    void load()
  }, [load])

  // Wide screens always have one card selected, like the prototype desktop.
  useEffect(() => {
    if (wide && cards?.length && !selected) select(cards[0]!.key, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, cards])

  // Live updates: refresh the figures after new messages, reload cards when counts change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refreshHome = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void api.home().then(setHome).catch(() => {}), 800)
    }
    const off = api.live((e) => {
      if (e.type === 'message') {
        setLastSource(e.source)
        setUpdatedAt(new Date())
        refreshHome()
      } else if (e.type === 'cards') {
        void api.cards().then((c) => setCards([...c.cards].sort(byUrgency))).catch(() => {})
        refreshHome()
      } else if (e.type === 'health' && !e.ok) {
        setFigure('error')
      }
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [api])

  const flash = (s: JarvisState, ms: number) => {
    clearTimeout(revert.current)
    setFigure(s)
    revert.current = setTimeout(() => setFigure('idle'), ms)
  }

  const select = useCallback(
    (key: string, keep = false) => {
      const next = selected === key && !wide && !keep ? null : key
      setSelected(next)
      const card = cardsRef.current.find((c) => c.key === next)
      clearTimeout(revert.current)
      if (!card) {
        setFigure('idle')
        setSay(summary(cardsRef.current))
        return
      }
      setFigure('speaking')
      setSay(card.say || card.title)
      // The sprites run at 2 fps: keep speaking for about the sentence's reading time, not the typing time.
      speakUntil.current = Date.now() + Math.min(6000, Math.max(2000, (card.say || card.title).length * 45))
      setAfterSay(card.urgency >= 3 ? 'notify' : 'idle')
    },
    [selected, wide, summary],
  )

  const onSayDone = useCallback(() => {
    if (!afterSay) return
    const next = afterSay
    setAfterSay(null)
    clearTimeout(revert.current)
    revert.current = setTimeout(() => setFigure(next), Math.max(0, speakUntil.current - Date.now()))
  }, [afterSay])

  const act = useCallback(
    async (card: Card, action: CardAction) => {
      if (action.kind === 'open') {
        void Linking.openURL(action.url)
        return
      }
      const before = cardsRef.current
      const rest = before.filter((c) => c.key !== card.key)
      setCards(rest)
      if (selected === card.key) setSelected(null)
      try {
        const res = await api.act(card.key, action)
        if (!res.removed) setCards(before)
        toast(res.message)
        flash('happy', 1600)
        setSay(rest.length ? t('today.afterAct', { message: res.message, summary: summary(rest) }) : t('today.allDone'))
        void api.home().then(setHome).catch(() => {})
      } catch (e) {
        setCards(before)
        toast(errorText(e))
        flash('error', 2400)
      }
    },
    [api, selected, summary, t, toast],
  )

  const counts = useMemo(() => {
    const list = cards ?? []
    const by = (g: Card['group']) => list.filter((c) => c.group === g).length
    return { all: list.length, reply: by('reply'), schedule: by('schedule'), todo: by('todo'), know: by('know') }
  }, [cards])

  const visible = useMemo(() => (cards ?? []).filter((c) => filter === 'all' || c.group === filter), [cards, filter])

  return {
    home, cards, visible, counts, error, reload: load,
    filter, setFilter, selected, select, act,
    figure, setFigure, say, setSay, onSayDone, lastSource, updatedAt,
  }
}
