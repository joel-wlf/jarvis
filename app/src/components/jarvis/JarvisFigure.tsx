// The Jarvis figure, centred and breathing: a slow rise and swell with a ground shadow that
// narrows in step. Thinking breathes faster, sleep slower. Rendered images cross-fade between states.
import { useEffect } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg'
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { JarvisState } from '@jarvis/contract'
import { JARVIS_IMAGES } from './images'
import { Pebble } from './Pebble'

const PERIOD: Partial<Record<JarvisState, number>> = { thinking: 2400, sleep: 7000 }

export function JarvisFigure({ state, size }: { state: JarvisState; size: number }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const breath = useSharedValue(0)
  const period = PERIOD[state] ?? 4200

  useEffect(() => {
    if (reduced) {
      cancelAnimation(breath)
      breath.value = 0
      return
    }
    breath.value = 0
    breath.value = withRepeat(withTiming(1, { duration: period / 2, easing: Easing.inOut(Easing.sin) }), -1, true)
  }, [period, reduced, breath])

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(breath.value, [0, 1], [0, -7]) }, { scale: interpolate(breath.value, [0, 1], [1, 1.016]) }],
  }))
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [1, 0.7]),
    transform: [{ scaleX: interpolate(breath.value, [0, 1], [1, 0.88]) }],
  }))

  const src = JARVIS_IMAGES[state] ?? JARVIS_IMAGES.idle
  const shadowW = size * 0.46

  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <Animated.View style={[{ width: size, height: size, transformOrigin: '50% 80%' }, bodyStyle]}>
        {src ? (
          <Image source={src} style={{ width: size, height: size }} contentFit="contain" transition={450} accessibilityLabel={t('jarvis.figure', { state: t(`jarvis.state.${state}`) })} />
        ) : (
          <Pebble size={size} state={state} />
        )}
      </Animated.View>
      <Animated.View style={[{ width: shadowW, height: 14, marginTop: -18 }, shadowStyle]} pointerEvents="none">
        <Svg width={shadowW} height={14}>
          <Defs>
            <RadialGradient id="gs" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor="#1E2632" stopOpacity="0.26" />
              <Stop offset="1" stopColor="#1E2632" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={shadowW / 2} cy={7} rx={shadowW / 2} ry={7} fill="url(#gs)" />
        </Svg>
      </Animated.View>
    </View>
  )
}
