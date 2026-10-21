// i18next setup: English and German. The owner's own choice wins, then the device language, English otherwise.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { getLocales } from 'expo-localization'
import de from '../../locales/de.json'
import en from '../../locales/en.json'
import { getItem, setItem } from '@/state/storage'

export const LANGUAGES = ['en', 'de'] as const
export type Language = (typeof LANGUAGES)[number]
const KEY = 'jarvis.language'

function deviceLanguage(): Language {
  for (const l of getLocales()) {
    if ((LANGUAGES as readonly string[]).includes(l.languageCode ?? '')) return l.languageCode as Language
  }
  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

// A language picked under System replaces the device language on the next start too
void getItem(KEY).then((l) => {
  if (l && (LANGUAGES as readonly string[]).includes(l) && l !== i18n.language) void i18n.changeLanguage(l)
}).catch(() => {})

export async function setLanguage(l: Language) {
  await i18n.changeLanguage(l)
  await setItem(KEY, l)
}

/** BCP 47 tag for Intl date formatting. */
export const locale = () => (i18n.language === 'de' ? 'de-DE' : 'en-GB')

export default i18n
