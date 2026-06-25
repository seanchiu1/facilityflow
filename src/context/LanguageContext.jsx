import React, { createContext, useContext, useState } from 'react'
import { en } from '../i18n/en'
import { zhTW } from '../i18n/zh-TW'

const LanguageContext = createContext()

const translations = { en, 'zh-TW': zhTW }

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en')

  const t = (key) => {
    const keys = key.split('.')
    let value = translations[language]
    for (const k of keys) {
      value = value?.[k]
    }
    return value ?? key
  }

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'en' ? 'zh-TW' : 'en')
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
