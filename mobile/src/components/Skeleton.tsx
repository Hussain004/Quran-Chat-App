import { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet, ViewStyle } from 'react-native'

type Props = {
  width: number | `${number}%`
  height: number
  borderRadius?: number
  style?: ViewStyle
}

export function Skeleton({ width, height, borderRadius = 6, style }: Props) {
  const opacity = useRef(new Animated.Value(0.35)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: '#1E3525', opacity }, style]}
    />
  )
}

export function ConversationSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.content}>
        <Skeleton width="65%" height={15} style={{ marginBottom: 8 }} />
        <Skeleton width="28%" height={11} borderRadius={4} />
      </View>
      <Skeleton width={12} height={12} borderRadius={6} />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#152B1F', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#2D4A38',
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 8,
  },
  content: { flex: 1 },
})
