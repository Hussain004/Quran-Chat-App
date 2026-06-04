import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type AppLanguage = 'en' | 'ur' | 'ar'

export const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  ur: 'اردو  Urdu',
  ar: 'العربية  Arabic',
}

interface LanguageContextValue {
  language: AppLanguage
  setLanguage: (l: AppLanguage) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en')

  useEffect(() => {
    AsyncStorage.getItem('app_language').then(val => {
      if (val === 'ur' || val === 'ar') setLanguageState(val)
    })
  }, [])

  function setLanguage(l: AppLanguage) {
    setLanguageState(l)
    AsyncStorage.setItem('app_language', l)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
