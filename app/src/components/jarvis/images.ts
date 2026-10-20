// Rendered Jarvis figures, one per state, from app/assets/jarvis/{state}.png.
// Metro needs static requires, so add a line here when an image lands in that folder, e.g.
//   idle: require('../../../assets/jarvis/idle.png'),
// Missing states fall back to idle, and without any image the pebble placeholder is drawn.
import type { JarvisState } from '@jarvis/contract'

export const JARVIS_IMAGES: Partial<Record<JarvisState, number>> = {}
