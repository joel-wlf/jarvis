// Logs: the last lines of one service, secrets already redacted by the server.
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SERVICES } from '@/api/admin'
import { Page } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { BlockButton, Choice, Notice, Panel } from '@/components/ui'
import { errorText } from '@/i18n/format'
import { type } from '@/theme/type'

export default function Logs() {
  const { t } = useTranslation()
  return (
    <Page title={t('logs.title')} back>
      <AdminGate>
        <LogView />
      </AdminGate>
    </Page>
  )
}

function LogView() {
  const { t } = useTranslation()
  const { admin } = useAdmin()
  const [svc, setSvc] = useState<string>('wa-ingest')
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setText((await admin.logs(svc)).text)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }, [admin, svc])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <Choice label={t('system.services')} options={SERVICES.map((s) => ({ value: s, label: s }))} value={svc} onChange={setSvc} />
      <BlockButton label={t('logs.refresh')} variant="line" busy={busy} onPress={() => void load()} />
      {error ? <Notice level="error" text={error} /> : null}
      <Panel style={{ maxHeight: 520 }}>
        <ScrollView horizontal>
          <Text style={type.mono} selectable>
            {text === null ? t('common.loading') : text.trim() || t('logs.empty')}
          </Text>
        </ScrollView>
      </Panel>
    </>
  )
}
