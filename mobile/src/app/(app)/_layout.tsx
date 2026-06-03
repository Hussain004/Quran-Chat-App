import { Tabs } from 'expo-router'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'

type IoniconsName = ComponentProps<typeof Ionicons>['name']

function TabIcon({ icon, iconFocused, label, focused }: {
  icon: IoniconsName
  iconFocused: IoniconsName
  label: string
  focused: boolean
}) {
  return (
    <View style={{ alignItems: 'center', gap: 2, paddingTop: 8 }}>
      <Ionicons name={focused ? iconFocused : icon} size={24} color={focused ? '#C9A84C' : '#6B7280'} />
      <Text style={{ fontSize: 11, color: focused ? '#C9A84C' : '#6B7280', fontWeight: focused ? '600' : '400' }}>
        {label}
      </Text>
    </View>
  )
}

export default function AppLayout() {
  const { bottom } = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: '#0D1B14',
          borderTopColor: '#1E3525',
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
