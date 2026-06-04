import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native'
import type { TextProps, TextInputProps, TextStyle } from 'react-native'
import { forwardRef } from 'react'

// App font families (registered via useFonts in _layout.tsx).
// Headings opt into the soft Fraunces serif by setting fontFamily explicitly;
// everything else falls through to Plus Jakarta Sans via the wrappers below.
export const DISPLAY = 'Fraunces' // soft display serif, semibold
export const DISPLAY_BOLD = 'Fraunces-Bold'

// Pick the Plus Jakarta Sans static cut for a given weight. A dedicated file
// per weight (rather than one regular file plus synthetic bolding) keeps glyphs
// crisp and consistent on both platforms.
function jakartaForWeight(weight?: TextStyle['fontWeight']): string {
  switch (String(weight)) {
    case '500':
      return 'Jakarta-Medium'
    case '600':
      return 'Jakarta-SemiBold'
    case '700':
    case '800':
    case '900':
    case 'bold':
      return 'Jakarta-Bold'
    default:
      return 'Jakarta'
  }
}

// Drop-in replacements for react-native's Text and TextInput that default the
// font to Plus Jakarta Sans. An explicit fontFamily in the passed style (e.g.
// NoorHira for Arabic, Fraunces for headings) always wins, so headings and
// verse text are untouched. Refs are forwarded so callers like the chat input
// keep working.
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...props }, ref) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const fontFamily = flat.fontFamily ?? jakartaForWeight(flat.fontWeight)
  return <RNText ref={ref} {...props} style={[style, { fontFamily, fontWeight: 'normal' }]} />
})

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle
  const fontFamily = flat.fontFamily ?? jakartaForWeight(flat.fontWeight)
  return <RNTextInput ref={ref} {...props} style={[style, { fontFamily }]} />
})
