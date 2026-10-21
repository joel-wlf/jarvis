// Type scale from the prototype. Titles, values and big numbers are thin italics;
// micro labels are tiny uppercase with wide tracking (never below 11px).
import { StyleSheet } from 'react-native'
import { colors, fonts } from './tokens'

export const type = StyleSheet.create({
  h1: { fontFamily: fonts.light, fontSize: 32, lineHeight: 34, letterSpacing: -0.64, color: colors.ink },
  h2: { fontFamily: fonts.light, fontSize: 24, lineHeight: 28, letterSpacing: -0.36, color: colors.ink },
  cardTitle: { fontFamily: fonts.italic, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: colors.ink },
  voice: { fontFamily: fonts.light, fontSize: 18, lineHeight: 24, letterSpacing: -0.18, color: colors.ink, textAlign: 'center' },
  big: { fontFamily: fonts.light, fontSize: 26, lineHeight: 28, letterSpacing: -0.52, color: colors.ink },
  value: { fontFamily: fonts.light, fontSize: 21, lineHeight: 24, color: colors.ink },
  huge: { fontFamily: fonts.thin, fontSize: 50, lineHeight: 52, letterSpacing: -1.5, color: colors.ink },
  sub: { fontFamily: fonts.italic, fontSize: 13.5, lineHeight: 18, color: colors.muted },
  small: { fontFamily: fonts.italic, fontSize: 12.5, lineHeight: 16, color: colors.muted },
  tiny: { fontFamily: fonts.italic, fontSize: 11, lineHeight: 14, color: colors.faint },
  body: { fontFamily: fonts.regular, fontSize: 14.5, lineHeight: 21, color: colors.ink2 },
  bodyItalic: { fontFamily: fonts.italic, fontSize: 15, lineHeight: 20, color: colors.ink },
  micro: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase', color: colors.faint },
  button: { fontFamily: fonts.italic, fontSize: 14.5, lineHeight: 18, color: colors.ink2 },
  mono: { fontFamily: 'Menlo', fontSize: 11.5, lineHeight: 16, color: colors.ink2 },
})
