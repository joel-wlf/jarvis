// One calm line under the figure: Jarvis' current sentence, typed out two characters per frame.
import { useEffect, useRef, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { type } from '@/theme/type'

export function Subtitle({ text, onDone, style }: { text: string; onDone?: () => void; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(reduced ? text : '')
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (reduced) {
      setShown(text)
      done.current?.()
      return
    }
    // A timer rather than requestAnimationFrame, so the line also completes in background tabs.
    let i = 0
    setShown('')
    const timer = setInterval(() => {
      i += 2
      setShown(text.slice(0, i))
      if (i >= text.length) {
        clearInterval(timer)
        done.current?.()
      }
    }, 16)
    return () => clearInterval(timer)
  }, [text, reduced])

  return (
    <Text style={[type.voice, { maxWidth: 340, minHeight: 48, marginTop: 10 }, style]} accessibilityLiveRegion="polite" accessibilityLabel={text}>
      {shown}
    </Text>
  )
}
