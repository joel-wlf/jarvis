import { i18nProvider } from 'fumadocs-ui/i18n'
import type { Metadata } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import { Provider } from '@/components/provider'
import { i18n } from '@/lib/i18n'
import { translations } from '@/lib/layout.shared'
import { basePath } from '@/lib/shared'
import '../global.css'

const urbanist = localFont({
  src: [
    { path: '../fonts/Urbanist_200ExtraLight_Italic.ttf', weight: '200', style: 'italic' },
    { path: '../fonts/Urbanist_300Light_Italic.ttf', weight: '300', style: 'italic' },
    { path: '../fonts/Urbanist_400Regular.ttf', weight: '400', style: 'normal' },
    { path: '../fonts/Urbanist_400Regular_Italic.ttf', weight: '400', style: 'italic' },
    { path: '../fonts/Urbanist_500Medium.ttf', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-urbanist',
})

export const metadata: Metadata = {
  title: { default: 'Jarvis', template: '%s · Jarvis' },
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }))
}

export default async function LangLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>
  children: ReactNode
}) {
  const { lang } = await params
  return (
    <html lang={lang} className={urbanist.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider i18n={i18nProvider(translations, lang)}>{children}</Provider>
        <footer className="jv-footer">
          <a href={`${basePath}/${lang}/docs/disclaimer/`}>{lang === 'de' ? 'Rechtliche Hinweise' : 'Disclaimer'}</a>
          <span>{lang === 'de' ? 'Unabhängiges Open-Source-Projekt, nicht mit WhatsApp oder Meta verbunden.' : 'Independent open-source project, not affiliated with WhatsApp or Meta.'}</span>
        </footer>
      </body>
    </html>
  )
}
