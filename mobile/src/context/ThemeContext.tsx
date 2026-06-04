import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SystemUI from 'expo-system-ui'
import { Platform } from 'react-native'
import { dark, light, type Colors } from '@/lib/theme'

interface ThemeContextValue {
  colors: Colors
  isDark: boolean
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: dark,
  isDark: true,
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    AsyncStorage.getItem('app_theme').then(val => {
      if (val === 'light') setIsDark(false)
    })
  }, [])

  useEffect(() => {
    const bg = isDark ? '#0D1B14' : '#F0EBE0'
    SystemUI.setBackgroundColorAsync(bg).catch(() => {})
    if (Platform.OS !== 'android') return
    ;(async () => {
      try {
        const NavBar = require('expo-navigation-bar')
        await NavBar.setBackgroundColorAsync(bg)
        await NavBar.setButtonStyleAsync(isDark ? 'light' : 'dark')
      } catch {}
    })()
  }, [isDark])

  function toggleTheme() {
    setIsDark(prev => {
      const next = !prev
      AsyncStorage.setItem('app_theme', next ? 'dark' : 'light')
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ colors: isDark ? dark : light, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
