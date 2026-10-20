// i18next setup: German and English, picked from the device language, German by default.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import de from '../../locales/de.json'
import en from '../../locales/en.json'

export const LANGUAGES = ['de', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

function deviceLanguage(): Language {
  for (const l of getLocales()) {
    if ((LANGUAGES as readonly string[]).includes(l.languageCode ?? '')) return l.languageCode as Language
  }
  return 'de'
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
  returnNull: false,
})

/** BCP 47 tag for Intl date formatting. */
export const locale = () => (i18n.language === 'en' ? 'en-GB' : 'de-DE')

export default i18n
