import type { ReactNode } from 'react'

// The document shell (html/body) lives in app/[lang]/layout.tsx so each language sets its own lang attribute.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children
}
