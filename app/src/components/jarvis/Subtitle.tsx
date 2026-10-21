// Jarvis' line under the figure, typed out like Magic UI's Typing Animation: letter by letter with a caret.
// With several lines it holds each for a few seconds, deletes it and types the next one.
import { useEffect, useRef, useState } from 'react'
import { Text, View, type StyleProp, type TextStyle } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

const TYPE_MS = 28
const DELETE_MS = 12
const HOLD_MS = 4200

export function Subtitle({ text, lines, onDone, style }: { text: string; lines?: string[]; onDone?: () => void; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion()
  const all = [text, ...(lines ?? []).filter((l) => l && l !== text)].filter(Boolean)
  // The facts update in the background (counts, percentages); the rotation reads the newest ones without restarting
  const latest = useRef(all)
  latest.current = all
  const count = all.length
  const [shown, setShown] = useState(reduced ? all[0] ?? '' : '')
  const [index, setIndex] = useState(0)
  const [caret, setCaret] = useState(true)
  const done = useRef(onDone)
  done.current = onDone

  // A new main sentence (a card was picked, something was done) starts over with it
  useEffect(() => setIndex(0), [text])

  useEffect(() => {
    const all = latest.current
    const line = all[index % Math.max(1, all.length)] ?? ''
    if (reduced) {
      setShown(line)
      if (index === 0) done.current?.()
      if (all.length < 2) return
      const t = setTimeout(() => setIndex((i) => (i + 1) % all.length), HOLD_MS + 1500)
      return () => clearTimeout(t)
    }
    // Timers rather than requestAnimationFrame, so the line also completes in background tabs
    let timer: ReturnType<typeof setTimeout>
    let i = 0
    setShown('')
    const typeNext = () => {
      i += 1
      setShown(line.slice(0, i))
      if (i < line.length) timer = setTimeout(typeNext, TYPE_MS)
      else {
        if (index === 0) done.current?.()
        if (all.length > 1) timer = setTimeout(erase, HOLD_MS)
      }
    }
    const erase = () => {
      i -= 2
      setShown(line.slice(0, Math.max(0, i)))
      if (i > 0) timer = setTimeout(erase, DELETE_MS)
      else timer = setTimeout(() => setIndex((n) => (n + 1) % all.length), 240)
    }
    timer = setTimeout(typeNext, TYPE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, index, reduced, count > 1])

  // The caret blinks at a calm 1 Hz, only when motion is welcome
  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setCaret((c) => !c), 530)
    return () => clearInterval(t)
  }, [reduced])

  const current = all[index % Math.max(1, all.length)] ?? ''
  return (
    <View style={{ minHeight: 48, marginTop: 10 }}>
      <Text style={[type.voice, { maxWidth: 340 }, style]} accessibilityLiveRegion="polite" accessibilityLabel={current}>
        {shown}
        {reduced ? null : <Text style={{ color: caret ? colors.ink2 : 'transparent', fontStyle: 'normal' }}>|</Text>}
      </Text>
    </View>
  )
}
