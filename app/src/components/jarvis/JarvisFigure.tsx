// The Jarvis figure: stop-motion sprites at 2 fps with hard cuts, over a slow, smooth hover.
// Every frame stays mounted (only the current one is visible), so cuts never flash while loading.
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { JarvisState } from '@jarvis/contract'
import { bridge, DAMP, FRAME_MS, FRAMES, SEQUENCES, SHADOW, SPRITES, type Frame } from './sprites'

/** The figure fills about half of each sprite, so the sprite square is drawn larger than the layout box. */
const SPRITE_SCALE = 1.35
const HOVER_MS = 4500

export function JarvisFigure({ state, size }: { state: JarvisState; size: number }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState<Frame>(SEQUENCES[state][0]!)
  const current = useRef(state)
  const queue = useRef<Frame[]>([])
  const index = useRef(0)

  // A state change queues its bridge frames; the timer picks them up on the next tick.
  useEffect(() => {
    if (state === current.current) return
    queue.current = bridge(current.current, state)
    current.current = state
    index.current = 0
  }, [state])

  useEffect(() => {
    const timer = setInterval(() => {
      const seq = SEQUENCES[current.current]
      setFrame(queue.current.shift() ?? seq[index.current++ % seq.length]!)
    }, FRAME_MS)
    return () => clearInterval(timer)
  }, [])

  // Smooth hover on top of the stop motion; off when the system asks for reduced motion.
  const hover = useSharedValue(0)
  useEffect(() => {
    if (reduced) {
      cancelAnimation(hover)
      hover.value = 0
      return
    }
    hover.value = withRepeat(withTiming(1, { duration: HOVER_MS / 2, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [reduced, hover])

  const S = size * SPRITE_SCALE
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(hover.value, [0, 1], [0, -0.022 * S]) }] }))
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [1, 0.7]),
    transform: [{ scale: interpolate(hover.value, [0, 1], [1, 0.93]) }],
  }))

  const layer = { position: 'absolute' as const, left: (size - S) / 2, top: (size - S) / 2, width: S, height: S }
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={t('jarvis.figure', { state: t(`jarvis.state.${state}`) })}>
      <Animated.View style={[layer, { transformOrigin: '50% 76%' }, shadowStyle]} pointerEvents="none">
        <Image source={SHADOW} style={{ width: S, height: S }} contentFit="contain" />
      </Animated.View>
      <Animated.View style={[layer, floatStyle]} pointerEvents="none">
        {FRAMES.map((f) => (
          <Image
            key={f}
            source={SPRITES[f]}
            style={{ position: 'absolute', width: S, height: S, opacity: f === frame ? 1 : 0, transform: [{ translateY: ((DAMP[f] ?? 0) / 100) * S }] }}
            contentFit="contain"
            cachePolicy="memory"
          />
        ))}
      </Animated.View>
    </View>
  )
}
