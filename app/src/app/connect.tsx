// Connect: pair with a Jarvis server by scanning its QR code, or by address and owner password.
import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { createHttpAdmin } from '@/api/admin'
import * as Device from 'expo-device'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { API_VERSION, type ServerInfo } from '@jarvis/contract'
import { fetchInfo, login } from '@/api/client'
import { JarvisError, normalizeUrl } from '@/api/http'
import { parsePairing } from '@/api/pairing'
import { JarvisFigure } from '@/components/jarvis/JarvisFigure'
import { BlockButton, Field, Micro, Notice, Seg } from '@/components/ui'
import { errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { colors, layout } from '@/theme/tokens'
import { type } from '@/theme/type'

const platform = (Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web') as 'ios' | 'android' | 'web'
const deviceName = () => Device.deviceName ?? Device.modelName ?? (platform === 'web' ? 'Browser' : platform)

export default function Connect() {
  const { t } = useTranslation()
  const router = useRouter()
  const webOrigin = platform === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined
  const { signIn } = useSession()
  const insets = useSafeAreaInsets()
  const [mode, setMode] = useState<'scan' | 'manual'>(platform === 'web' ? 'manual' : 'scan')
  const [url, setUrl] = useState(webOrigin ?? '')
  const [password, setPassword] = useState('')
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [busy, setBusy] = useState<'check' | 'connect' | 'pair' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const scanned = useRef(false)

  const checkServer = async (base: string): Promise<ServerInfo> => {
    if (!parsePairing(base)) throw new Error('Bitte gib eine Server-Adresse ohne Pfad ein. Öffentliche Adressen benötigen HTTPS.')
    let i: ServerInfo
    try {
      i = await fetchInfo(base)
    } catch (e) {
      // Reachable but not answering like Jarvis (404, HTML page, other app): say that plainly.
      if (e instanceof JarvisError && e.code !== 'network' && e.code !== 'timeout') throw new Error(t('connect.notJarvis'))
      throw e
    }
    if (i?.name !== 'jarvis') throw new Error(t('connect.notJarvis'))
    if (i.apiVersion > API_VERSION) throw new Error(t('connect.tooNew'))
    return i
  }
  const fail = (e: unknown) => setError(e instanceof JarvisError ? errorText(e) : e instanceof Error ? e.message : errorText(e))

  const check = async () => {
    const base = normalizeUrl(url)
    if (!base) return
    setBusy('check')
    setError(null)
    setInfo(null)
    try {
      setUrl(base)
      setInfo(await checkServer(base))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(null)
    }
  }

  const connect = async () => {
    if (!info) return
    setBusy('connect')
    setError(null)
    try {
      const base = normalizeUrl(url)
      const r = await login(base, { password, deviceName: deviceName(), platform })
      setPassword('')
      await signIn({ mode: 'live', baseUrl: base, token: r.token, deviceId: r.deviceId, ownerName: r.ownerName ?? info.ownerName })
    } catch (e) {
      fail(e)
      setBusy(null)
    }
  }

  const onScan = async (data: string) => {
    if (scanned.current) return
    const p = parsePairing(data)
    if (!p) {
      setError(t('connect.badCode'))
      return
    }
    scanned.current = true
    setBusy('pair')
    setError(null)
    try {
      const i = await checkServer(p.url)
      setUrl(p.url)
      setInfo(i)
      setMode('manual')
      setBusy(null)
      scanned.current = false
    } catch (e) {
      fail(e)
      scanned.current = false
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!webOrigin) return
    let alive = true
    const load = async () => {
      setBusy('check')
      try {
        const state = await createHttpAdmin(webOrigin).state()
        if (!alive) return
        if (!state.initialized || state.setupComplete === false) { router.replace('/setup'); return }
        const i = await checkServer(webOrigin)
        if (alive) setInfo(i)
      } catch (e) { if (alive) fail(e) }
      finally { if (alive) setBusy(null) }
    }
    void load()
    return () => { alive = false }
    // The browser's origin is the server; never ask its owner to type it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webOrigin])

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: Math.max(24, insets.top + 12), paddingBottom: 40 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={st.col}>
          <View style={{ alignItems: 'center' }}>
            <JarvisFigure state={busy ? 'thinking' : error ? 'error' : info ? 'happy' : 'idle'} size={150} />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={type.h1} accessibilityRole="header">
              {webOrigin ? (info?.assistantName || 'Jarvis') : t('connect.title')}
            </Text>
            <Text style={[type.body, { fontSize: 15.5, lineHeight: 22 }]}>{webOrigin ? 'Melde dich mit deinem Passwort an.' : 'Server-Adresse eingeben oder QR-Code scannen. Danach meldest du dich mit deinem Passwort an.'}</Text>
          </View>

          {!webOrigin ? <Seg
            items={[
              { key: 'scan', label: t('connect.scan'), on: mode === 'scan', onPress: () => setMode('scan') },
              { key: 'manual', label: t('connect.manual'), on: mode === 'manual', onPress: () => setMode('manual') },
            ]}
          /> : null}

          {mode === 'scan' ? (
            <View style={{ gap: 14 }}>
              <Text style={type.body}>{t('connect.scanHelp')}</Text>
              {!permission ? null : permission.granted ? (
                <View style={st.camera}>
                  <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : ({ data }) => void onScan(data)} />
                  <View style={st.frame} pointerEvents="none" />
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  <Text style={type.body}>{permission.canAskAgain ? t('connect.cameraAsk') : t('connect.cameraDenied')}</Text>
                  {permission.canAskAgain ? <BlockButton label={t('connect.cameraAllow')} icon="camera" onPress={() => void requestPermission()} /> : null}
                </View>
              )}
              {busy === 'pair' ? <Text style={type.sub}>{t('connect.pairing')}</Text> : null}
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {!webOrigin ? <Field
                label={t('connect.url')}
                help={t('connect.urlHelp')}
                value={url}
                onChangeText={(v) => {
                  setUrl(v)
                  setInfo(null)
                }}
                placeholder={t('connect.urlPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                inputMode="url"
                onSubmitEditing={() => void check()}
                returnKeyType="next"
              /> : null}
              {!info ? <BlockButton label={busy === 'check' ? t('connect.checking') : webOrigin ? 'Erneut verbinden' : t('connect.check')} busy={busy === 'check'} disabled={!url.trim()} onPress={() => void check()} /> : null}
              {info ? (
                <View style={{ gap: 16 }}>
                  <Notice level="ok" text={info.assistantName ? `${info.assistantName} ist erreichbar.` : t('connect.found', { version: info.version })} />
                  {info.passwordLogin ? (
                    <>
                      <Field
                        label={t('connect.password')}
                        help={t('connect.passwordHelp')}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        autoComplete="current-password"
                        onSubmitEditing={() => void connect()}
                        returnKeyType="go"
                        autoFocus
                      />
                      <BlockButton label={busy === 'connect' ? t('connect.connecting') : t('connect.connect')} busy={busy === 'connect'} disabled={!password} onPress={() => void connect()} />
                    </>
                  ) : (
                    <Notice level="warn" text={t('connect.noPassword')} />
                  )}
                </View>
              ) : null}
            </View>
          )}

          {error ? <Notice level="error" text={error} /> : null}

          {process.env.EXPO_PUBLIC_JARVIS_MOCK === '1' ? <View style={st.demo}>
            <BlockButton label={t('connect.demo')} variant="line" onPress={() => void signIn({ mode: 'mock' })} />
            <Text style={type.small}>{t('connect.demoHelp')}</Text>
          </View> : null}
          <View style={{ gap: 6 }}>
            <Micro>{t('connect.privateLabel')}</Micro>
            <Text style={type.small}>{t('connect.private')}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  col: { width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: layout.gutter, gap: 22 },
  camera: { height: 300, backgroundColor: colors.block, overflow: 'hidden' },
  frame: { position: 'absolute', left: '18%', right: '18%', top: '15%', bottom: '15%', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  demo: { gap: 8, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line2 },
})
