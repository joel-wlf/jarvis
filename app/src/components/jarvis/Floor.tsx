// The stage floor: a 64px grid tilted away in perspective (the prototype's rotateX(66deg) plane),
// fading out from the figure's feet. Projected by hand so it renders the same on native and web.
import { memo } from 'react'
import Svg, { Defs, G, Line, Mask, RadialGradient, Rect, Stop } from 'react-native-svg'
import { colors } from '@/theme/tokens'

const TILT = (66 * Math.PI) / 180
const PERSPECTIVE = 900
const CELL = 64

export const Floor = memo(function Floor({ width: W, height: H }: { width: number; height: number }) {
  if (W <= 0 || H <= 0) return null
  const cx = W / 2
  const cy = H / 2
  const hinge = H * 0.52
  // Past ~0.85 of the perspective distance the plane would reach the eye; it is far off-stage by then.
  const depth = Math.min(H * 1.2, (0.85 * PERSPECTIVE) / Math.sin(TILT))
  const project = (x: number, d: number) => {
    // CSS rotateX(66deg) about the top edge brings the far part of the plane toward the viewer.
    const s = PERSPECTIVE / (PERSPECTIVE - d * Math.sin(TILT))
    return { x: cx + (x - cx) * s, y: cy + (hinge + d * Math.cos(TILT) - cy) * s }
  }
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  const left = -0.3 * W
  const right = 1.3 * W
  for (let d = 0; d <= depth; d += CELL) {
    const a = project(left, d)
    const b = project(right, d)
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  for (let x = cx - CELL / 2 - Math.ceil((cx - left) / CELL) * CELL; x <= right; x += CELL) {
    const a = project(x, 0)
    const b = project(x, depth)
    lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }
  const focus = project(cx, depth * 0.18)
  const rx = 0.8 * W * (PERSPECTIVE / (PERSPECTIVE - depth * 0.18 * Math.sin(TILT)))
  const ry = Math.abs(project(cx, depth * 0.63).y - focus.y)

  return (
    <Svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <RadialGradient id="floorFade" cx={focus.x} cy={focus.y} rx={rx} ry={ry} fx={focus.x} fy={focus.y} gradientUnits="userSpaceOnUse">
          <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity="1" />
          <Stop offset="0.72" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
        <Mask id="floorMask" x="0" y="0" width={W} height={H} maskUnits="userSpaceOnUse">
          <Rect x="0" y="0" width={W} height={H} fill="url(#floorFade)" />
        </Mask>
      </Defs>
      <G mask="url(#floorMask)">
        {lines.map((l, i) => (
          <Line key={i} {...l} stroke={colors.line2} strokeWidth={1} />
        ))}
      </G>
    </Svg>
  )
})
