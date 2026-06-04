import { Tabs } from 'expo-router'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/context/ThemeContext'
import type { ComponentProps } from 'react'

type IoniconsName = ComponentProps<typeof Ionicons>['name']

function TabIcon({ icon, iconFocused, label, focused }: {
  icon: IoniconsName
  iconFocused: IoniconsName
  label: string
  focused: boolean
}) {
  const { colors } = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 2, paddingTop: 8, width: 72 }}>
      <Ionicons name={focused ? iconFocused : icon} size={24} color={focused ? colors.accent : colors.textFaint} />
      <Text numberOfLines={1} style={{ fontSize: 10, color: focused ? colors.accent : colors.textFaint, fontWeight: focused ? '600' : '400' }}>
        {label}
      </Text>
    </View>
  )
}

export default function AppLayout() {
  const { bottom } = useSafeAreaInsets()
  const { colors } = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.borderFaint,
          borderTopWidth: 1,
          height: 64 + bottom,
          paddingBottom: bottom,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="home-outline" iconFocused="home" label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="time-outline" iconFocused="time" label="History" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon icon="settings-outline" iconFocused="settings" label="Settings" focused={focused} />,
        }}
      />
    </Tabs>
  )
}
