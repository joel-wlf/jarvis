// Placeholder figure from the prototype: a soft pebble with a dark visor and two eyes.
// The eyes carry the state (shape, colour, gaze) so the figure reads without the subtitle.
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg'
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import type { JarvisState } from '@jarvis/contract'
import { useTranslation } from 'react-i18next'
import { colors, fonts } from '@/theme/tokens'

/** Rounded box path with per-corner elliptical radii, like CSS border-radius a b c d / e f g h. */
function blob(w: number, h: number, rx: [number, number, number, number], ry: [number, number, number, number]) {
  const [tl, tr, br, bl] = rx.map((r) => r * w) as [number, number, number, number]
  const [tly, try_, bry, bly] = ry.map((r) => r * h) as [number, number, number, number]
  return `M${tl} 0 L${w - tr} 0 A${tr} ${try_} 0 0 1 ${w} ${try_} L${w} ${h - bry} A${br} ${bry} 0 0 1 ${w - br} ${h} L${bl} ${h} A${bl} ${bly} 0 0 1 0 ${h - bly} L0 ${tly} A${tl} ${tly} 0 0 1 ${tl} 0 Z`
}

interface EyeLook { color: string; h: number; rTop: number; rBottom: number; dx: number; dy: number }
const EYE: Record<JarvisState, EyeLook> = {
  idle: { color: '#8FB7FF', h: 0.46, rTop: 0.4, rBottom: 0.4, dx: 0, dy: 0 },
  listening: { color: '#8FB7FF', h: 0.54, rTop: 0.4, rBottom: 0.4, dx: 0, dy: 0 },
  thinking: { color: '#8FB7FF', h: 0.36, rTop: 0.4, rBottom: 0.4, dx: 0.18, dy: -0.18 },
  speaking: { color: '#8FB7FF', h: 0.3, rTop: 0.5, rBottom: 0.2, dx: 0, dy: 0 },
  notify: { color: '#FFB547', h: 0.46, rTop: 0.4, rBottom: 0.4, dx: 0, dy: 0 },
  happy: { color: '#6EE0A3', h: 0.22, rTop: 0.5, rBottom: 0, dx: 0, dy: 0 },
  sleep: { color: '#6A7A92', h: 0.06, rTop: 0.4, rBottom: 0.4, dx: 0, dy: 0 },
  error: { color: '#FF6B6B', h: 0.46, rTop: 0.4, rBottom: 0.4, dx: 0, dy: 0 },
}
const POSE: Record<JarvisState, { y: number; rot: number }> = {
  idle: { y: 0, rot: 0 }, listening: { y: -4, rot: -4 }, thinking: { y: 0, rot: 0 }, speaking: { y: 0, rot: 0 },
  notify: { y: -10, rot: 0 }, happy: { y: 0, rot: 0 }, sleep: { y: 14, rot: 0 }, error: { y: 6, rot: 3 },
}
const EASE = Easing.bezier(0.16, 1, 0.3, 1)

export function Pebble({ size, state }: { size: number; state: JarvisState }) {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const w = size * 0.66
  const h = size * 0.56
  const visor = { left: w * 0.17, width: w * (1 - 0.17 - 0.13), top: h * 0.36, height: h * 0.3 }
  const eyeW = visor.width * 0.13
  const look = EYE[state]
  const pose = POSE[state]

  const y = useSharedValue(pose.y)
  const rot = useSharedValue(pose.rot)
  const eyeH = useSharedValue(look.h)
  const dx = useSharedValue(look.dx)
  const dy = useSharedValue(look.dy)
  const eyeColor = useSharedValue(look.color)
  const blink = useSharedValue(1)

  useEffect(() => {
    const cfg = { duration: reduced ? 0 : 600, easing: EASE }
    y.value = withTiming(pose.y, cfg)
    rot.value = withTiming(pose.rot, cfg)
    eyeH.value = withTiming(look.h, { duration: reduced ? 0 : 400 })
    dx.value = withTiming(look.dx, { duration: reduced ? 0 : 400 })
    dy.value = withTiming(look.dy, { duration: reduced ? 0 : 400 })
    eyeColor.value = withTiming(look.color, { duration: reduced ? 0 : 400 })
  }, [state, reduced, pose, look, y, rot, eyeH, dx, dy, eyeColor])

  // Blink: closes briefly every six seconds, never while asleep.
  useEffect(() => {
    if (reduced || state === 'sleep') {
      blink.value = 1
      return
    }
    blink.value = withRepeat(withSequence(withDelay(2760, withTiming(0.1, { duration: 120 })), withTiming(1, { duration: 120 }), withDelay(3000, withTiming(1, { duration: 0 }))), -1)
  }, [state, reduced, blink])

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${rot.value}deg` }] }))
  const eyeStyle = useAnimatedStyle(() => ({
    height: visor.height * eyeH.value,
    backgroundColor: eyeColor.value,
    transform: [{ translateX: eyeW * dx.value }, { translateY: visor.height * eyeH.value * dy.value }, { scaleY: blink.value }],
  }))
  const eyeRadius = { borderTopLeftRadius: eyeW * look.rTop, borderTopRightRadius: eyeW * look.rTop, borderBottomLeftRadius: eyeW * look.rBottom, borderBottomRightRadius: eyeW * look.rBottom }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="image" accessibilityLabel={t('jarvis.figure', { state: t(`jarvis.state.${state}`) })}>
      <Animated.View style={[{ width: w, height: h }, bodyStyle]}>
        <Svg width={w} height={h}>
          <Defs>
            <RadialGradient id="pb" cx="32%" cy="22%" rx="120%" ry="110%" fx="32%" fy="22%">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.4" stopColor="#F5F6F8" />
              <Stop offset="1" stopColor="#DCE1E7" />
            </RadialGradient>
            <RadialGradient id="shade" cx="30%" cy="26%" rx="85%" ry="85%" fx="30%" fy="26%">
              <Stop offset="0.55" stopColor="#6E7A8A" stopOpacity="0" />
              <Stop offset="1" stopColor="#6E7A8A" stopOpacity="0.28" />
            </RadialGradient>
            <LinearGradient id="visor" x1="0.4" y1="0" x2="0.6" y2="1">
              <Stop offset="0" stopColor="#2C323B" />
              <Stop offset="0.7" stopColor="#12151A" />
            </LinearGradient>
          </Defs>
          <Path d={blob(w, h, [0.47, 0.53, 0.55, 0.45], [0.58, 0.56, 0.44, 0.42])} fill="url(#pb)" />
          <Path d={blob(w, h, [0.47, 0.53, 0.55, 0.45], [0.58, 0.56, 0.44, 0.42])} fill="url(#shade)" />
          <Path
            d={blob(visor.width, visor.height, [0.46, 0.46, 0.5, 0.5], [0.6, 0.6, 0.4, 0.4])}
            transform={`translate(${visor.left} ${visor.top})`}
            fill="url(#visor)"
          />
        </Svg>
        <View style={[st.eyes, { left: visor.left, top: visor.top, width: visor.width, height: visor.height, gap: visor.width * 0.22 }]}>
          <Animated.View style={[{ width: eyeW }, eyeRadius, eyeStyle]} />
          <Animated.View style={[{ width: eyeW }, eyeRadius, eyeStyle]} />
        </View>
      </Animated.View>
      <Text style={st.ph}>{t('jarvis.placeholder')}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  eyes: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ph: { position: 'absolute', bottom: '6%', fontFamily: fonts.italic, fontSize: 11, color: colors.faint },
})
