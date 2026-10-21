import { uiTranslations } from 'fumadocs-ui/i18n'
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { i18n } from './i18n'
import { appName, repoUrl } from './shared'

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    en: { displayName: 'English' },
    de: {
      displayName: 'Deutsch',
      'Search(search trigger)': 'Suchen',
      'Search(search dialog)': 'Suchen',
      'Search failed(search dialog)': 'Suche fehlgeschlagen',
      'No results found(search dialog)': 'Nichts gefunden',
      'On this page(table of contents)': 'Auf dieser Seite',
      'No Headings(table of contents)': 'Keine Überschriften',
      'Previous Page(pagination)': 'Zurück',
      'Next Page(pagination)': 'Weiter',
      'Edit on GitHub(edit page)': 'Auf GitHub bearbeiten',
      'Last updated on(page footer)': 'Zuletzt geändert',
      'Language(language switcher)': 'Sprache',
      'Choose a language(language switcher)': 'Sprache wählen',
      'Copy Markdown(page actions)': 'Markdown kopieren',
      'Copied Markdown(page actions)': 'Markdown kopiert',
      'Table of Contents(inline table of contents)': 'Inhaltsverzeichnis',
      'Page Not Found(404 not found page)': 'Seite nicht gefunden',
      'Back to Home(404 not found page)': 'Zur Startseite',
      'Hide Sidebar(sidebar)': 'Seitenleiste ausblenden',
      'Show Sidebar(sidebar)': 'Seitenleiste einblenden',
      'Copy Text(code block)(aria-label)': 'Text kopieren',
      'Copied Text(code block)(aria-label)': 'Text kopiert',
    },
  })

export function baseOptions(lang: string): BaseLayoutProps {
  return {
    nav: {
      title: <span className="jv-wordmark">{appName}</span>,
      url: `/${lang}`,
    },
    githubUrl: repoUrl,
    themeSwitch: { enabled: false },
  }
}
