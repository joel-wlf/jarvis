// Stop-motion sprite set of the Jarvis figure (assets/jarvis, 768² transparent PNGs, all built
// on one master so they line up). Behaviour as approved in the animation reference prototype:
// 2 fps, hard cuts, transitions through 'blink', 'anticipation' before notify.
import type { JarvisState } from '@jarvis/contract'

export const SPRITES = {
  idle_a: require('../../../assets/jarvis/idle_a.png'),
  idle_b: require('../../../assets/jarvis/idle_b.png'),
  blink: require('../../../assets/jarvis/blink.png'),
  listening_a: require('../../../assets/jarvis/listening_a.png'),
  listening_b: require('../../../assets/jarvis/listening_b.png'),
  thinking_a: require('../../../assets/jarvis/thinking_a.png'),
  thinking_b: require('../../../assets/jarvis/thinking_b.png'),
  speaking_a: require('../../../assets/jarvis/speaking_a.png'),
  speaking_b: require('../../../assets/jarvis/speaking_b.png'),
  notify: require('../../../assets/jarvis/notify.png'),
  anticipation: require('../../../assets/jarvis/anticipation.png'),
  happy: require('../../../assets/jarvis/happy.png'),
  sleep_a: require('../../../assets/jarvis/sleep_a.png'),
  sleep_b: require('../../../assets/jarvis/sleep_b.png'),
  error: require('../../../assets/jarvis/error.png'),
} as const satisfies Record<string, number>

export type Frame = keyof typeof SPRITES
export const FRAMES = Object.keys(SPRITES) as Frame[]
export const SHADOW: number = require('../../../assets/jarvis/shadow.png')

/** One frame every 500 ms (2 fps; 3–4 fps read as too hectic). */
export const FRAME_MS = 500

/** Frame loop per app state; the app's JarvisState maps 1:1 onto these. */
export const SEQUENCES: Record<JarvisState, Frame[]> = {
  idle: ['idle_a', 'idle_a', 'idle_b', 'idle_b', 'idle_a', 'idle_a', 'idle_b', 'blink'],
  listening: ['listening_a', 'listening_b'],
  thinking: ['thinking_a', 'thinking_b'],
  speaking: ['speaking_a', 'speaking_b', 'speaking_a', 'speaking_b'],
  notify: ['notify', 'notify', 'anticipation'],
  happy: ['happy', 'idle_a'],
  sleep: ['sleep_a', 'sleep_b'],
  error: ['error', 'error', 'sleep_a'],
}

/**
 * Counter-offset per frame, as translateY in % of the edge length. The sprites carry baked-in
 * vertical offsets (b-frames sit lower) that would jump at 2 fps; this keeps idle calm while the
 * expressive states keep some of their movement.
 */
export const DAMP: Partial<Record<Frame, number>> = {
  idle_b: -1.5, listening_b: -1.5, speaking_a: 0.33, sleep_a: -0.91, sleep_b: -1.6, anticipation: -0.9, notify: 1.48, error: -0.63,
}

/** 'blink' bridges every change; 'hub' also passes through idle between distant states. */
export const TRANSITION: 'cut' | 'blink' | 'hub' = 'blink'

/** Frames played between two states before the new loop starts. */
export function bridge(from: JarvisState, to: JarvisState): Frame[] {
  if (from === to) return []
  if (to === 'notify') return ['anticipation']
  if (TRANSITION === 'cut') return []
  const b: Frame[] = []
  if (TRANSITION === 'hub' && from !== 'idle' && to !== 'idle' && !['thinking', 'speaking'].includes(to) && !['listening', 'thinking'].includes(from)) {
    b.push('blink', 'idle_a', 'idle_b')
  }
  b.push('blink')
  return b
}
