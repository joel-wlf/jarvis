import { View } from 'react-native'
import { Slot } from 'expo-router'
import { BottomBar, Rail } from '@/components/Nav'
import { useWide } from '@/components/useWide'
import { colors } from '@/theme/tokens'

export default function MainLayout() {
  const wide = useWide()
  if (wide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.ground }}>
        <Rail />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Slot />
        </View>
      </View>
    )
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <Slot />
      <BottomBar />
    </View>
  )
}
