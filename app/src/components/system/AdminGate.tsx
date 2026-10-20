// Gate for the system area: the admin interface must be reachable from here, and signed in.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { AdminApi, AdminState } from '@/api/admin'
import { errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { type } from '@/theme/type'
import { BlockButton, Field, Notice, Panel } from '../ui'

interface AdminCtx { admin: AdminApi; state: AdminState; refresh: () => Promise<void> }
const Ctx = createContext<AdminCtx | null>(null)

export function useAdmin(): AdminCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAdmin outside AdminGate')
  return v
}

export function AdminGate({ children, allowUnconfigured }: { children: ReactNode; allowUnconfigured?: boolean }) {
  const { t } = useTranslation()
  const { admin, adminChecked, recheckAdmin } = useSession()
  const router = useRouter()
  const [state, setState] = useState<AdminState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!admin) return
    try {
      setError(null)
      setState(await admin.state())
    } catch (e) {
      setError(errorText(e))
    }
  }, [admin])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A fresh install has no admin password yet: the setup wizard creates it.
  useEffect(() => {
    if (state && !state.configured && !allowUnconfigured) router.replace('/setup')
  }, [state, allowUnconfigured, router])

  if (!adminChecked) return <Text style={type.sub}>{t('common.loading')}</Text>
  if (!admin) {
    return (
      <View style={{ gap: 14 }}>
        <Notice level="info" text={t('system.unreachable')} />
        <BlockButton label={t('common.retry')} variant="line" onPress={recheckAdmin} />
      </View>
    )
  }
  if (error && !state) {
    return (
      <View style={{ gap: 14 }}>
        <Notice level="error" text={error} />
        <BlockButton label={t('common.retry')} variant="line" onPress={() => void refresh()} />
      </View>
    )
  }
  if (!state) return <Text style={type.sub}>{t('common.loading')}</Text>
  if (!state.loggedIn && (state.configured || !allowUnconfigured)) {
    const login = async () => {
      setBusy(true)
      setError(null)
      try {
        await admin.login(password)
        setPassword('')
        await refresh()
      } catch (e) {
        setError(errorText(e))
      } finally {
        setBusy(false)
      }
    }
    return (
      <Panel style={{ gap: 16 }}>
        <Text style={type.cardTitle}>{t('system.login')}</Text>
        <Text style={type.body}>{t('system.loginLead')}</Text>
        <Field label={t('system.adminPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void login()} returnKeyType="go" error={error ?? undefined} />
        <BlockButton label={busy ? t('system.loggingIn') : t('system.login')} busy={busy} disabled={!password} onPress={() => void login()} />
      </Panel>
    )
  }
  return <Ctx.Provider value={{ admin, state, refresh }}>{children}</Ctx.Provider>
}
