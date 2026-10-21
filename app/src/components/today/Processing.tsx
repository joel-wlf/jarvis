// "Jarvis is reading in": what happens with the archive in the first hours after setup, step by step.
// Shown on Today while anything still runs, and always under System.
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { PipelineStep, StatusResponse } from '@jarvis/contract'
import { colors, shadow } from '@/theme/tokens'
import { type } from '@/theme/type'
import { errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { useToast } from '@/state/toast'
import { BlockButton, Micro, Press } from '../ui'

const fmt = (n: number) => n.toLocaleString()

function Step({ step }: { step: PipelineStep }) {
  const { t } = useTranslation()
  const f = step.total ? step.done / step.total : 1
  const label = step.state === 'running' || step.state === 'waiting' ? t(`status.active.${step.id}`) : t(`status.step.${step.id}`)
  const right =
    step.state === 'off' ? t('status.off')
    : step.state === 'done' ? t('status.done')
    : step.id === 'import' ? `${Math.round(f * 100)} %`
    : t('status.count', { done: fmt(step.done), total: fmt(step.total) })
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${right}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text style={[type.body, { flex: 1, fontSize: 14.5, color: step.state === 'off' ? colors.faint : colors.ink }]}>{label}</Text>
        <Text style={[type.small, { fontSize: 13 }]}>{right}</Text>
      </View>
      {step.state !== 'off' ? (
        <View style={st.track}>
          <View style={[st.fill, { width: `${Math.max(step.state === 'done' ? 100 : 2, Math.round(f * 100))}%`, backgroundColor: step.state === 'done' ? colors.green : step.state === 'waiting' ? colors.line2 : colors.ink }]} />
        </View>
      ) : null}
      {step.state === 'waiting' ? <Text style={[type.tiny, { color: colors.muted }]}>{t(`status.waiting.${step.id}`, { defaultValue: t('status.waitingGeneric') })}</Text> : null}
    </View>
  )
}

/** Contacts without a name: fetch the address book from WhatsApp again (no message is sent). */
function NamesResync({ missing }: { missing: number }) {
  const { t } = useTranslation()
  const { api } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await api.resyncContacts()
      toast(r.after > r.before ? t('status.namesGained', { count: r.after - r.before }) : t('status.namesSame'))
    } catch (e) {
      toast(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
      <Text style={type.small}>{t('status.namesMissing', { count: missing })}</Text>
      <BlockButton label={busy ? t('status.namesLoading') : t('status.namesResync')} busy={busy} variant="line" onPress={() => void run()} />
    </View>
  )
}

export function Processing({ status, collapsible = true }: { status: StatusResponse; collapsible?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(!collapsible)
  const total = status.steps.filter((s) => s.state !== 'off')
  const overall = total.length ? total.reduce((a, s) => a + (s.total ? s.done / s.total : 1), 0) / total.length : 1
  return (
    <View style={st.panel}>
      <Press onPress={() => collapsible && setOpen(!open)} disabled={!collapsible} accessibilityRole={collapsible ? 'button' : undefined} accessibilityState={{ expanded: open }} style={() => st.head}>
        <View style={{ flex: 1, gap: 2 }}>
          <Micro>{status.busy ? t('status.titleBusy') : t('status.titleDone')}</Micro>
          <Text style={[type.body, { fontSize: 15 }]}>
            {t('status.summary', { messages: fmt(status.messages), chats: fmt(status.chats), named: fmt(status.named), contacts: fmt(status.contacts) })}
          </Text>
        </View>
        <Text style={[type.big, { fontSize: 22 }]}>{Math.round(overall * 100)} %</Text>
      </Press>
      <View style={st.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(overall * 100) }}>
        <View style={[st.fill, { width: `${Math.max(2, Math.round(overall * 100))}%`, backgroundColor: status.busy ? colors.ink : colors.green }]} />
      </View>
      {open ? (
        <View style={{ gap: 14, paddingTop: 4 }}>
          {status.steps.map((s) => (
            <Step key={s.id} step={s} />
          ))}
          <Text style={[type.small, { color: status.searchReady ? colors.ink2 : colors.muted }]}>{status.searchReady ? t('status.searchReady') : t('status.searchNotReady')}</Text>
          {status.contacts > status.named ? <NamesResync missing={status.contacts - status.named} /> : null}
          {status.busy ? <Text style={type.small}>{t('status.note')}</Text> : null}
        </View>
      ) : null}
    </View>
  )
}

const st = StyleSheet.create({
  panel: { backgroundColor: colors.card, boxShadow: shadow.card, padding: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { height: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 4 },
})
