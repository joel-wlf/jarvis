import { useWindowDimensions } from 'react-native'
import { layout } from '@/theme/tokens'

/** True from 1024px: stage left, feed right, vertical rail. */
export function useWide(): boolean {
  return useWindowDimensions().width >= layout.wideBreakpoint
}
