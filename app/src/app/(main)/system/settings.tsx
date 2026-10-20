// Settings by group. Changes are collected, previewed as a diff (with checks and affected services),
// then applied as a job; the server rolls back automatically when a service fails to start.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Job, PreviewResponse, SettingsResponse } from '@/api/admin'
import { Page, Section } from '@/components/Page'
import { AdminGate, useAdmin } from '@/components/system/AdminGate'
import { JobView } from '@/components/system/JobView'
import { SettingInput } from '@/components/system/SettingInput'
import { BlockButton, Choice, Micro, Notice, Panel } from '@/components/ui'
import { errorText } from '@/i18n/format'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

export default function Settings() {
  const { t } = useTranslation()
  return (
    <Page title={t('settings.title')} back>
      <AdminGate>
        <SettingsForm />
      </AdminGate>
    </Page>
  )
}

function SettingsForm() {
  const { t } = useTranslation()
  const { admin } = useAdmin()
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [group, setGroup] = useState<string>('general')
  const [changes, setChanges] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await admin.settings())
    } catch (e) {
      setError(errorText(e))
    }
  }, [admin])
  useEffect(() => {
    void load()
  }, [load])

  const fields = useMemo(() => (data?.fields ?? []).filter((f) => f.group === group && !f.initOnly), [data, group])
  const count = Object.keys(changes).length
  const label = (key: string) => data?.fields.find((f) => f.key === key)?.label ?? key

  const set = (key: string, v: string) => {
    setPreview(null)
    setChanges((c) => {
      const next = { ...c }
      const f = data?.fields.find((x) => x.key === key)
      const current = f?.type === 'secret' ? '' : (data?.values[key] ?? '')
      if (v === current) delete next[key]
      else next[key] = v
      return next
    })
  }

  const check = async () => {
    setBusy(true)
    setError(null)
    try {
      setPreview(await admin.preview(changes))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      setJob(await admin.apply(changes))
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  if (!data) return error ? <Notice level="error" text={error} /> : <Text style={type.sub}>{t('common.loading')}</Text>
  if (job) {
    return (
      <View style={{ gap: 16 }}>
        <JobView
          admin={admin}
          job={job}
          onEnd={() => {
            setBusy(false)
            setChanges({})
            setPreview(null)
            void load()
          }}
        />
        {!busy ? <BlockButton label={t('common.done')} variant="line" onPress={() => setJob(null)} /> : null}
      </View>
    )
  }

  const group_ = data.groups.find((g) => g.id === group)
  return (
    <>
      <Choice label={t('settings.title')} options={data.groups.map((g) => ({ value: g.id, label: g.label }))} value={group} onChange={setGroup} />
      {group_ ? <Text style={type.body}>{group_.help}</Text> : null}
      <Panel style={{ gap: 18 }}>
        {fields.map((f) => (
          <SettingInput key={f.key} f={f} value={changes[f.key] ?? (f.type === 'secret' ? '' : (data.values[f.key] ?? ''))} secret={data.secrets[f.key]} onChange={(v) => set(f.key, v)} error={preview?.errors[f.key]} />
        ))}
      </Panel>

      {data.checks.map((c) => (
        <Notice key={c.message} level={c.level} text={c.message} />
      ))}

      {count ? (
        <Section title={t('settings.changes', { count })} right={<BlockButton label={t('settings.reset')} variant="line" onPress={() => { setChanges({}); setPreview(null) }} style={{ minHeight: 36, paddingHorizontal: 14 }} />}>
          {preview ? (
            <Panel style={{ gap: 12 }}>
              {preview.diff.length === 0 ? <Text style={type.body}>{t('settings.noChanges')}</Text> : null}
              {preview.diff.map((d) => (
                <View key={d.key} style={{ gap: 2, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
                  <Micro>{label(d.key)}</Micro>
                  <Text style={type.body}>
                    <Text style={{ color: colors.muted, textDecorationLine: 'line-through' }}>{d.from || '–'}</Text>
                    {'  →  '}
                    <Text style={{ color: colors.ink }}>{d.to || '–'}</Text>
                  </Text>
                </View>
              ))}
              {Object.entries(preview.errors).map(([k, m]) => (
                <Notice key={k} level="error" text={`${label(k)}: ${m}`} />
              ))}
              {preview.checks.map((c) => (
                <Notice key={c.message} level={c.level} text={c.message} />
              ))}
              {preview.services.length ? <Text style={type.small}>{t('settings.affects', { services: preview.services.join(', ') })}</Text> : null}
              <Text style={type.small}>{t('settings.rollbackNote')}</Text>
            </Panel>
          ) : null}
          {error ? <Notice level="error" text={error} /> : null}
          {preview && !Object.keys(preview.errors).length && preview.diff.length ? (
            <BlockButton label={busy ? t('settings.applying') : t('settings.apply')} busy={busy} onPress={() => void apply()} />
          ) : (
            <BlockButton label={t('settings.preview')} busy={busy} onPress={() => void check()} />
          )}
        </Section>
      ) : null}
    </>
  )
}
