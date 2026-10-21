// Line icons authored in the prototype: 24px grid, 1.5 stroke, round caps.
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { colors } from '@/theme/tokens'

export type IconName =
  | 'home' | 'people' | 'memory' | 'system' | 'x' | 'chat' | 'play' | 'check' | 'pin' | 'clock' | 'cal' | 'arrow' | 'link'
  | 'mic' | 'search' | 'plus' | 'back' | 'chevron' | 'lock' | 'camera' | 'train' | 'stop' | 'pause'

const P = ({ d }: { d: string }) => <Path d={d} />

const ICONS: Record<IconName, React.ReactNode> = {
  home: <P d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  people: <><Circle cx={9} cy={8} r={3.5} /><P d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  memory: <><Rect x={5} y={3.5} width={14} height={17} /><P d="M9 3.5v7l3-2 3 2v-7" /></>,
  system: <><Circle cx={12} cy={12} r={3} /><P d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  x: <P d="M6 6l12 12M18 6 6 18" />,
  chat: <P d="M4 5h16v11H9l-5 4z" />,
  play: <Path d="M8 5.5v13l11-6.5z" fill={colors.ink} stroke="none" />,
  check: <P d="m5 12 5 5 9-10" />,
  pin: <><P d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z" /><Circle cx={12} cy={10} r={2.2} /></>,
  clock: <><Circle cx={12} cy={12} r={8.5} /><P d="M12 7.5V12l3 2" /></>,
  cal: <><Rect x={4} y={5} width={16} height={15} /><P d="M4 10h16M9 3v4M15 3v4" /></>,
  arrow: <P d="M5 12h14M13 6l6 6-6 6" />,
  back: <P d="M19 12H5M11 6l-6 6 6 6" />,
  chevron: <P d="m9 6 6 6-6 6" />,
  link: <P d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  mic: <><Rect x={9} y={3} width={6} height={11} rx={3} /><P d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  search: <><Circle cx={11} cy={11} r={6.5} /><P d="m16 16 4.5 4.5" /></>,
  plus: <P d="M12 5v14M5 12h14" />,
  lock: <><Rect x={5} y={10.5} width={14} height={10} /><P d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  camera: <><Rect x={3} y={7} width={18} height={13} /><Circle cx={12} cy={13.5} r={3.5} /><P d="M8.5 7 10 4h4l1.5 3" /></>,
  train: <><Rect x={6} y={3.5} width={12} height={13} /><P d="M6 11h12M9 20l-2 1.5M15 20l2 1.5M9 14h.01M15 14h.01" /></>,
  stop: <Rect x={7} y={7} width={10} height={10} fill={colors.blockInk} stroke="none" />,
  pause: <><Rect x={7} y={5.5} width={3.5} height={13} fill={colors.ink} stroke="none" /><Rect x={13.5} y={5.5} width={3.5} height={13} fill={colors.ink} stroke="none" /></>,
}

export function Icon({ name, size = 20, color = colors.ink, strokeWidth = 1.5 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </Svg>
  )
}
