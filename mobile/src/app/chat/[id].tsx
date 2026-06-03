import { View, Text, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.text}>Chat screen — coming in v0.5</Text>
      <Text style={styles.sub}>{id}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B14', justifyContent: 'center', alignItems: 'center', gap: 8 },
  text: { color: '#F8F4ED', fontSize: 18 },
  sub: { color: '#6B7280', fontSize: 12 },
})
