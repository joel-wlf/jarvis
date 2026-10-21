import Link from 'next/link'
import { InstallCommand } from '@/components/install'

const copy = {
  en: {
    title: 'Your messages, sorted by what needs you.',
    lead: 'Jarvis is a private context manager that runs on a Raspberry Pi at home. It turns your WhatsApp archive into decisions with prepared next steps, and lets Claude work with it.',
    start: 'Quickstart',
    intro: 'What is Jarvis',
    install: 'Install with one command',
    tiles: [
      { href: 'app', t: 'The app', d: 'Today, cards, people, memory and a streamed Ask. One codebase for iOS, Android and web.' },
      { href: 'connect-claude', t: 'Connect Claude', d: 'Add the base URL as a connector. OAuth does the rest.' },
      { href: 'security', t: 'Security', d: 'Admin only on your home network, hashed tokens, optional encrypted vault.' },
    ],
  },
  de: {
    title: 'Deine Nachrichten, sortiert nach dem, was dich braucht.',
    lead: 'Jarvis ist ein privater Kontext-Manager, der auf einem Raspberry Pi bei dir zu Hause läuft. Er macht aus deinem WhatsApp-Archiv Entscheidungen mit vorbereiteten nächsten Schritten und lässt Claude damit arbeiten.',
    start: 'Schnellstart',
    intro: 'Was ist Jarvis',
    install: 'Mit einem Befehl installieren',
    tiles: [
      { href: 'app', t: 'Die App', d: 'Heute, Karten, Personen, Gedächtnis und Fragen an Jarvis. Eine Codebasis für iOS, Android und Web.' },
      { href: 'connect-claude', t: 'Claude verbinden', d: 'Basis-URL als Connector eintragen. Den Rest erledigt OAuth.' },
      { href: 'security', t: 'Sicherheit', d: 'Verwaltung nur im Heimnetz, gehashte Tokens, optionaler verschlüsselter Tresor.' },
    ],
  },
} as const

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const t = copy[lang as keyof typeof copy] ?? copy.en
  return (
    <main className="jv-home">
      <h1>{t.title}</h1>
      <p className="lead">{t.lead}</p>
      <div className="jv-actions">
        <Link className="jv-btn primary" href={`/${lang}/docs/quickstart`}>
          {t.start}
        </Link>
        <Link className="jv-btn ghost" href={`/${lang}/docs`}>
          {t.intro}
        </Link>
      </div>
      <div className="jv-install">
        <InstallCommand />
      </div>
      <div className="jv-grid">
        {t.tiles.map((x) => (
          <Link key={x.href} href={`/${lang}/docs/${x.href}`}>
            <h2>{x.t}</h2>
            <p>{x.d}</p>
          </Link>
        ))}
      </div>
    </main>
  )
}
