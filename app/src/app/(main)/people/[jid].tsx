// One person: what Jarvis believes about them, a correction form, memories and recent messages.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PersonDetail, PersonPatch, Relationship } from '@jarvis/contract'
import { Page, Section } from '@/components/Page'
import { useWide } from '@/components/useWide'
import { Avatar, BlockButton, Choice, Closeness, Field, Meta, Micro, Notice, Panel, Toggle } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { useToast } from '@/state/toast'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

const RELATIONSHIPS: Relationship[] = ['family', 'partner', 'close_friend', 'friend', 'acquaintance', 'colleague', 'club', 'service', 'other']

function FactRow({ label, value, first }: { label: string; value?: React.ReactNode; first?: boolean }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <View style={[{ flexDirection: 'row', gap: 12, paddingVertical: 11 }, !first && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <Micro style={{ width: 110, paddingTop: 3 }}>{label}</Micro>
      <View style={{ flex: 1 }}>{typeof value === 'string' ? <Text style={type.bodyItalic}>{value}</Text> : value}</View>
    </View>
  )
}

export default function PersonScreen() {
  const { t } = useTranslation()
  const { jid } = useLocalSearchParams<{ jid: string }>()
  const { api } = useSession()
  const toast = useToast()
  const router = useRouter()
  const wide = useWide()
  const [p, setP] = useState<PersonDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<PersonPatch & { aliasesText?: string }>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      setP(await api.person(jid))
    } catch (e) {
      setError(errorText(e))
    }
  }, [api, jid])

  useEffect(() => {
    setP(null)
    setEditing(false)
    void load()
  }, [load])

  const startEdit = () => {
    if (!p) return
    setDraft({ realName: p.realName ?? '', aliasesText: p.aliases.join(', '), relationship: p.relationship, closeness: p.closeness, formality: p.formality, tone: p.tone ?? '', note: p.note ?? '', locked: p.locked })
    setEditing(true)
  }

  const save = async () => {
    if (!p) return
    setSaving(true)
    const { aliasesText, ...rest } = draft
    const patch: PersonPatch = { ...rest, aliases: (aliasesText ?? '').split(',').map((a) => a.trim()).filter(Boolean) }
    try {
      setP(await api.patchPerson(p.jid, patch))
      setEditing(false)
      toast(t('people.saved'))
    } catch (e) {
      toast(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  if (!p) {
    const state = error ? (
      <View style={{ gap: 12 }}>
        <Text style={type.body}>{error}</Text>
        <BlockButton label={t('common.retry')} variant="line" onPress={() => void load()} />
      </View>
    ) : (
      <Text style={type.sub}>{t('common.loading')}</Text>
    )
    // Wide: the master-detail shell in people/_layout already frames this.
    return wide ? state : (
      <Page title={t('people.title')} back>
        {state}
      </Page>
    )
  }

  const subtitle = p.realName && p.realName !== p.name ? p.realName : p.relationship ? t(`people.relationship.${p.relationship}`) : undefined
  const frame = (children: React.ReactNode) =>
    wide ? (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={type.h1} accessibilityRole="header">
              {p.name}
            </Text>
            {subtitle ? <Text style={[type.sub, { marginTop: 6 }]}>{subtitle}</Text> : null}
          </View>
          <Avatar initials={p.initials} size={54} />
        </View>
        {children}
      </>
    ) : (
      <Page title={p.name} sub={subtitle} back right={<Avatar initials={p.initials} size={54} />}>
        {children}
      </Page>
    )

  return frame(
    <>
      {p.stats.length ? (
        <Panel>
          <Meta stats={p.stats} />
        </Panel>
      ) : null}

      <Section title={t('people.profile')} right={!editing ? <BlockButton label={t('people.correct')} variant="line" onPress={startEdit} style={{ minHeight: 36, paddingHorizontal: 14 }} /> : null}>
        {!editing ? (
          <Panel>
            <FactRow first label={t('people.relationshipLabel')} value={p.relationship ? t(`people.relationship.${p.relationship}`) : t('people.relationship.none')} />
            <FactRow label={t('people.closeness')} value={p.closeness ? <Closeness n={p.closeness} label={t('people.closenessValue', { n: p.closeness })} /> : undefined} />
            <FactRow label={t('people.formality')} value={p.formality ? t(`people.formalityValue.${p.formality}`) : undefined} />
            <FactRow label={t('people.tone')} value={p.tone} />
            <FactRow label={t('people.aliases')} value={p.aliases.join(', ')} />
            <FactRow label={t('people.note')} value={p.note} />
            <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={type.small}>{p.locked || p.source === 'user' ? t('people.locked') : t('people.auto')}</Text>
            </View>
          </Panel>
        ) : (
          <Panel style={{ gap: 16 }}>
            <Field label={t('people.realName')} value={draft.realName ?? ''} onChangeText={(v) => setDraft((d) => ({ ...d, realName: v }))} />
            <Field label={t('people.aliases')} help={t('people.aliasesHelp')} value={draft.aliasesText ?? ''} onChangeText={(v) => setDraft((d) => ({ ...d, aliasesText: v }))} />
            <Choice label={t('people.relationshipLabel')} options={RELATIONSHIPS.map((r) => ({ value: r, label: t(`people.relationship.${r}`) }))} value={draft.relationship} onChange={(v) => setDraft((d) => ({ ...d, relationship: v }))} />
            <Choice label={t('people.closeness')} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} value={draft.closeness} onChange={(v) => setDraft((d) => ({ ...d, closeness: v }))} />
            <Choice label={t('people.formality')} options={(['du', 'sie', 'mixed'] as const).map((f) => ({ value: f, label: t(`people.formalityValue.${f}`) }))} value={draft.formality} onChange={(v) => setDraft((d) => ({ ...d, formality: v }))} />
            <Field label={t('people.tone')} value={draft.tone ?? ''} onChangeText={(v) => setDraft((d) => ({ ...d, tone: v }))} />
            <Field label={t('people.note')} value={draft.note ?? ''} onChangeText={(v) => setDraft((d) => ({ ...d, note: v }))} multiline />
            <Toggle label={t('people.lock')} help={t('people.lockHelp')} value={!!draft.locked} onChange={(v) => setDraft((d) => ({ ...d, locked: v }))} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <BlockButton label={t('common.cancel')} variant="line" onPress={() => setEditing(false)} style={{ flex: 1 }} />
              <BlockButton label={saving ? t('common.saving') : t('common.save')} busy={saving} onPress={() => void save()} style={{ flex: 1 }} />
            </View>
          </Panel>
        )}
      </Section>

      <Section title={t('people.memories')} right={<BlockButton label={t('people.addMemory')} variant="line" icon="plus" onPress={() => router.push({ pathname: '/memory', params: { contact: p.jid } })} style={{ minHeight: 36, paddingHorizontal: 14 }} />}>
        {p.memories.length ? (
          <Panel style={{ gap: 12 }}>
            {p.memories.map((m) => (
              <Notice key={m.id} text={m.content} level={m.pinned ? 'warn' : 'info'} />
            ))}
          </Panel>
        ) : (
          <Text style={type.body}>{t('people.noMemories')}</Text>
        )}
      </Section>

      {p.recent.length ? (
        <Section title={t('people.recent')}>
          <Panel padded={false}>
            {p.recent.map((m, i) => (
              <View key={`${m.at}-${i}`} style={[{ paddingVertical: 12, paddingHorizontal: 16, gap: 4 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Micro>{m.fromMe ? t('common.you') : p.name}</Micro>
                  <Text style={type.tiny}>{ago(m.at)}</Text>
                </View>
                <Text style={type.body}>{m.text}</Text>
              </View>
            ))}
          </Panel>
        </Section>
      ) : null}
    </>,
  )
}
