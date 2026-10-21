// Memory: what Jarvis keeps in mind across conversations. Pinned first, paused last.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { Memory, MemoryScope, PersonSummary } from '@jarvis/contract'
import { confirm } from '@/components/confirm'
import { MasterDetail } from '@/components/MasterDetail'
import { Page, Section } from '@/components/Page'
import { useWide } from '@/components/useWide'
import { BlockButton, Choice, Field, Panel, Press, Seg, Toggle } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { useToast } from '@/state/toast'
import { colors, fonts } from '@/theme/tokens'
import { type } from '@/theme/type'

// 'thread' exists in the contract but a Memory has no thread id to point at, so it is not offered here.
const SCOPES: MemoryScope[] = ['global', 'contact', 'chat', 'topic']

interface Draft { id?: number; content: string; scope: MemoryScope; contactJid?: string; chatJid?: string; topicId?: string; pinned: boolean }
const fromMemory = (m: Memory): Draft => ({ id: m.id, content: m.content, scope: m.scope === 'thread' ? 'global' : m.scope, contactJid: m.contactJid, chatJid: m.chatJid, topicId: m.topicId ? String(m.topicId) : undefined, pinned: m.pinned })
const empty = (contactJid?: string): Draft => ({ content: '', scope: contactJid ? 'contact' : 'global', contactJid, pinned: false })

export default function MemoryScreen() {
  const { t } = useTranslation()
  const { api } = useSession()
  const toast = useToast()
  const wide = useWide()
  const params = useLocalSearchParams<{ contact?: string }>()
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Memory[] | null>(null)
  const [people, setPeople] = useState<PersonSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(params.contact ? empty(params.contact) : null)
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(async (query: string) => {
    try {
      setError(null)
      setItems((await api.memories(query || undefined)).memories)
    } catch (e) {
      setError(errorText(e))
    }
  }, [api])

  useEffect(() => {
    const timer = setTimeout(() => void load(q), q ? 250 : 0)
    return () => clearTimeout(timer)
  }, [q, load])
  useEffect(() => {
    void api.people().then((r) => setPeople(r.people)).catch(() => {})
  }, [api])

  // Wide: the right half always shows something, the first memory or an empty form.
  useEffect(() => {
    if (!wide || draft || !items || q) return
    const first = [...items].sort((a, b) => Number(b.active && b.pinned) - Number(a.active && a.pinned) || Number(b.active) - Number(a.active))[0]
    setDraft(first ? fromMemory(first) : empty())
  }, [wide, draft, items, q])

  const groups = useMemo(() => {
    const list = items ?? []
    return [
      { key: 'pinned', title: t('memory.pinned'), list: list.filter((m) => m.active && m.pinned) },
      { key: 'active', title: t('memory.active'), list: list.filter((m) => m.active && !m.pinned) },
      { key: 'inactive', title: t('memory.inactive'), list: list.filter((m) => !m.active) },
    ].filter((g) => g.list.length)
  }, [items, t])

  const save = async () => {
    if (!draft) return
    if (!draft.content.trim()) {
      setFieldError(t('memory.errors.empty'))
      return
    }
    setSaving(true)
    setFieldError(undefined)
    const target = {
      contactJid: draft.scope === 'contact' ? draft.contactJid : undefined,
      chatJid: draft.scope === 'chat' ? draft.chatJid?.trim() || undefined : undefined,
      topicId: draft.scope === 'topic' && draft.topicId ? Number(draft.topicId) : undefined,
    }
    try {
      const body = { content: draft.content.trim(), scope: draft.scope, pinned: draft.pinned, ...target }
      const saved = draft.id ? await api.patchMemory(draft.id, body) : await api.createMemory(body)
      toast(t('memory.savedToast'))
      setDraft(wide ? fromMemory(saved) : null)
      await load(q)
    } catch (e) {
      setFieldError((e as { fields?: Record<string, string> }).fields?.content ?? errorText(e))
    } finally {
      setSaving(false)
    }
  }

  const patch = async (m: Memory, p: Partial<Memory>) => {
    try {
      const next = await api.patchMemory(m.id, p)
      setItems((all) => all?.map((x) => (x.id === m.id ? next : x)) ?? null)
    } catch (e) {
      toast(errorText(e))
    }
  }

  const remove = async (m: Memory) => {
    if (!(await confirm(t('memory.deleteConfirm'), t('common.delete'), t('common.cancel')))) return
    try {
      await api.deleteMemory(m.id)
      setItems((all) => all?.filter((x) => x.id !== m.id) ?? null)
      if (draft?.id === m.id) setDraft(null)
      toast(t('memory.deleted'))
    } catch (e) {
      toast(errorText(e))
    }
  }

  const selectedItem = draft?.id ? items?.find((m) => m.id === draft.id) : undefined
  const scopeText = (m: Memory) => [t(`memory.scopes.${m.scope}`), m.scopeLabel].filter(Boolean).join(' · ')

  const editor = draft ? (
    <>
      <Panel style={{ gap: 16 }}>
        <Text style={type.cardTitle}>{draft.id ? t('memory.editTitle') : t('memory.newTitle')}</Text>
        <Field label={t('memory.content')} value={draft.content} onChangeText={(v) => setDraft({ ...draft, content: v })} placeholder={t('memory.contentPlaceholder')} multiline error={fieldError} autoFocus={!wide} />
        <Choice label={t('memory.scope')} options={SCOPES.map((s) => ({ value: s, label: t(`memory.scopes.${s}`) }))} value={draft.scope} onChange={(v) => setDraft({ ...draft, scope: v })} />
        {draft.scope === 'contact' ? (
          <Choice label={t('memory.pickPerson')} options={people.map((p) => ({ value: p.jid, label: p.name }))} value={draft.contactJid} onChange={(v) => setDraft({ ...draft, contactJid: v })} />
        ) : draft.scope === 'chat' ? (
          <Field label={t('memory.chatJid')} help={t('memory.chatJidHelp')} value={draft.chatJid ?? ''} onChangeText={(v) => setDraft({ ...draft, chatJid: v })} autoCapitalize="none" autoCorrect={false} />
        ) : draft.scope === 'topic' ? (
          <Field label={t('memory.topicId')} value={draft.topicId ?? ''} onChangeText={(v) => setDraft({ ...draft, topicId: v.replace(/\D/g, '') })} keyboardType="number-pad" />
        ) : null}
        <Toggle label={t('memory.pin')} value={draft.pinned} onChange={(v) => setDraft({ ...draft, pinned: v })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {wide && draft.id ? null : <BlockButton label={t('common.cancel')} variant="line" onPress={() => setDraft(null)} style={{ flex: 1 }} />}
          <BlockButton label={saving ? t('common.saving') : t('common.save')} busy={saving} onPress={() => void save()} style={{ flex: 1 }} />
        </View>
      </Panel>
      {wide && selectedItem ? (
        <Seg
          items={[
            { key: 'active', label: selectedItem.active ? t('memory.pause') : t('memory.activate'), onPress: () => void patch(selectedItem, { active: !selectedItem.active }) },
            { key: 'del', label: t('common.delete'), onPress: () => void remove(selectedItem) },
          ]}
        />
      ) : null}
    </>
  ) : null

  const list = error ? (
    <View style={{ gap: 12 }}>
      <Text style={type.body}>{error}</Text>
      <BlockButton label={t('common.retry')} variant="line" onPress={() => void load(q)} />
    </View>
  ) : !items ? (
    <Text style={type.sub}>{t('common.loading')}</Text>
  ) : groups.length === 0 ? (
    <Text style={type.body}>{q ? t('common.empty') : t('memory.empty')}</Text>
  ) : (
    groups.map((g) => (
      <Section key={g.key} title={g.title}>
        <Panel padded={false}>
          {g.list.map((m, i) => {
            const on = open === m.id
            const chosen = wide && draft?.id === m.id
            return (
              <View key={m.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.line } : undefined}>
                <Press
                  onPress={() => (wide ? setDraft(fromMemory(m)) : setOpen(on ? null : m.id))}
                  accessibilityRole="button"
                  accessibilityState={wide ? { selected: chosen } : { expanded: on }}
                  style={({ hovered }) => [{ paddingVertical: 14, paddingHorizontal: 16, gap: 6, backgroundColor: chosen || hovered ? colors.ground2 : colors.card }]}
                >
                  <Text style={[type.bodyItalic, { fontSize: 16, lineHeight: 22 }, !m.active && { color: colors.muted }, chosen && { fontFamily: fonts.medium }]} numberOfLines={wide ? 3 : undefined}>
                    {m.content}
                  </Text>
                  <Text style={type.small}>
                    {scopeText(m)} · {t('memory.updated', { when: ago(m.updatedAt) })}
                  </Text>
                </Press>
                {on && !wide ? (
                  <Seg
                    style={{ borderLeftWidth: 0, borderRightWidth: 0, borderBottomWidth: 0 }}
                    items={[
                      { key: 'pin', label: m.pinned ? t('memory.unpin') : t('memory.pin'), onPress: () => void patch(m, { pinned: !m.pinned }) },
                      { key: 'active', label: m.active ? t('memory.pause') : t('memory.activate'), onPress: () => void patch(m, { active: !m.active }) },
                      { key: 'del', label: t('common.delete'), onPress: () => void remove(m) },
                      { key: 'edit', label: t('common.edit'), on: true, onPress: () => setDraft(fromMemory(m)) },
                    ]}
                  />
                ) : null}
              </View>
            )
          })}
        </Panel>
      </Section>
    ))
  )

  const search = <Field label={t('common.search')} value={q} onChangeText={setQ} placeholder={t('memory.search')} autoCapitalize="none" />
  const newButton = <BlockButton label={t('memory.new')} icon="plus" onPress={() => setDraft(empty())} style={{ minHeight: 40, paddingHorizontal: 14 }} />

  if (wide) {
    return <MasterDetail title={t('memory.title')} sub={t('memory.sub')} right={newButton} toolbar={search} master={list} detail={editor} />
  }

  return (
    <Page title={t('memory.title')} sub={t('memory.sub')} right={!draft ? newButton : null}>
      {editor}
      {search}
      {list}
    </Page>
  )
}
