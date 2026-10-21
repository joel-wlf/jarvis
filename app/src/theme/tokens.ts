// Design tokens taken from the approved prototype (.impeccable/mocks/prototype/style.css).
// Light ground, white cards, black action slabs, hairlines, sharp corners, thin italic type.
import type { CardGroup } from '@jarvis/contract'

export const colors = {
  ground: '#E9ECEF',
  ground2: '#F3F5F7',
  card: '#FFFFFF',
  ink: '#15171A',
  ink2: '#41474F',
  muted: '#5F6670',
  faint: '#697079',
  line: '#E4E7EB',
  line2: '#D3D8DE',
  block: '#121416',
  block2: '#2A2D31',
  block3: '#3A3E44',
  blockInk: '#F2F3F5',
  navIdle: '#A0A7B1',
  blue: '#3274F0',
  green: '#2FA45A',
  warn: '#D9483B',
  ok: '#7EE0A8',
  feedWide: 'rgba(250, 251, 252, 0.7)',
} as const

/** The four group colours. Only used for small marks, underlines and thin bars, never as fills. */
export const groupColor: Record<CardGroup, string> = {
  reply: '#E39A2D',
  schedule: '#2FA45A',
  todo: '#3274F0',
  know: '#7D8798',
}

/** Font family names as registered in the root layout. Weight and style live in the family name so Android picks the right file. */
export const fonts = {
  thin: 'Urbanist-ExtraLightItalic',
  light: 'Urbanist-LightItalic',
  italic: 'Urbanist-Italic',
  regular: 'Urbanist-Regular',
  medium: 'Urbanist-Medium',
} as const

export const shadow = {
  card: '0px 1px 1px rgba(20, 26, 36, 0.03), 0px 8px 22px -12px rgba(20, 26, 36, 0.14)',
  lift: '0px 1px 2px rgba(20, 26, 36, 0.04), 0px 22px 44px -22px rgba(20, 26, 36, 0.3)',
} as const

export const layout = {
  gutter: 18,
  navHeight: 62,
  dockHeight: 52,
  wideBreakpoint: 1024,
  railWidth: 68,
} as const

/** Mixes a hex colour with black or white, like CSS color-mix(in srgb, c p%, other). */
export function mix(hex: string, pct: number, other: 'black' | 'white'): string {
  const n = parseInt(hex.slice(1), 16)
  const o = other === 'black' ? 0 : 255
  const ch = (v: number) => Math.round(v * pct + o * (1 - pct))
  const r = ch((n >> 16) & 255)
  const g = ch((n >> 8) & 255)
  const b = ch(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** Text colour for a group mark (dark enough for contrast on its tinted ground). */
export const markInk = (c: string) => mix(c, 0.78, 'black')
export const markGround = (c: string) => mix(c, 0.1, 'white')
