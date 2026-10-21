// Holds the connection to the user's Jarvis server (or the mock) and hands out typed API clients.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Platform } from 'react-native'
import { createHttpApi, type JarvisApi } from '@/api/client'
import { createMockApi } from '@/api/mock'
import { createHttpAdmin, type AdminApi } from '@/api/admin'
import { createMockAdmin } from '@/api/adminMock'
import { getItem, removeItem, setItem } from './storage'

export type Session =
  | { mode: 'mock' }
  | { mode: 'live'; baseUrl: string; token: string; deviceId: string; homeUrl?: string; ownerName?: string }

interface SessionValue {
  ready: boolean
  session: Session | null
  api: JarvisApi
  /** Admin client for the home network interface, or null when it is not reachable from here. */
  admin: AdminApi | null
  adminChecked: boolean
  ownerName?: string
  signIn: (s: Session) => Promise<void>
  signOut: () => Promise<void>
  recheckAdmin: () => void
}

const KEY = 'jarvis.session.v1'
const MOCK_ENV = process.env.EXPO_PUBLIC_JARVIS_MOCK === '1'
const Ctx = createContext<SessionValue | null>(null)

/** On web the app may be served by the admin interface itself; then the same origin is the home URL. */
function homeCandidate(s: Session | null): string | undefined {
  if (s?.mode === 'live') return s.baseUrl
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin
  return undefined
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [adminResult, setAdminResult] = useState<{ key: string; api: AdminApi | null } | null>(null)
  const mockAdmin = useMemo(() => createMockAdmin(), [])
  const [probe, setProbe] = useState(0)

  useEffect(() => {
    void (async () => {
      const raw = await getItem(KEY)
      let s: Session | null = null
      try {
        s = raw ? (JSON.parse(raw) as Session) : null
      } catch {
        s = null
      }
      setSession(s ?? (MOCK_ENV ? { mode: 'mock' } : null))
      setReady(true)
    })()
  }, [])

  const signOut = useCallback(async () => {
    const base = homeCandidate(session)
    if (base) await createHttpAdmin(base).logout().catch(() => {})
    await removeItem(KEY)
    setSession(null)
  }, [session])

  const api = useMemo<JarvisApi>(() => {
    if (session?.mode === 'live') return createHttpApi(session.baseUrl, session.token, () => void signOut())
    return createMockApi()
  }, [session, signOut])

  // Probe the same entry point before login as well as on mobile/remote connections.
  const adminUrl = homeCandidate(session)
  const adminToken = session?.mode === 'live' ? session.token : undefined
  const adminKey = `${adminUrl}|${adminToken}|${probe}`
  const isMock = session?.mode === 'mock'
  const adminChecked = isMock || !adminUrl || adminResult?.key === adminKey
  const admin = isMock ? mockAdmin : adminResult?.key === adminKey ? adminResult.api : null
  useEffect(() => {
    if (!adminUrl || isMock) return
    let alive = true
    const client = createHttpAdmin(adminUrl, adminToken)
    void client.healthy().then((ok) => {
      if (alive) setAdminResult({ key: adminKey, api: ok ? client : null })
    })
    return () => { alive = false }
  }, [adminUrl, adminToken, adminKey, isMock])

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      session,
      api,
      admin,
      adminChecked,
      ownerName: session?.mode === 'live' ? session.ownerName : 'Alex',
      signIn: async (s) => {
        await setItem(KEY, JSON.stringify(s))
        setSession(s)
      },
      signOut,
      recheckAdmin: () => setProbe((n) => n + 1),
    }),
    [ready, session, api, admin, adminChecked, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession outside SessionProvider')
  return v
}

export const useApi = () => useSession().api
