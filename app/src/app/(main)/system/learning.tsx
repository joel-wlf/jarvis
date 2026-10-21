// What Jarvis learned from "later", "unimportant" and "important", and the owner's own rules. Every rule can be changed
// or removed; nothing here deletes a message or a card.
import { useCallback, useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { CARD_TYPES, type CardType, type LearnedRule, type PreferencesResponse, type Urgency } from '@jarvis/contract'
import { confirm } from '@/components/confirm'
import { Page, Section } from '@/components/Page'
import { BlockButton, Choice, Micro, Notice, Panel, Toggle } from '@/components/ui'
import { ago, errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { useToast } from '@/state/toast'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'

type Level = 'later' | 'normal' | 'important' | 'hidden'
const levelOf = (r: LearnedRule): Level => (r.hidden ? 'hidden' : r.priority === 1 ? 'later' : r.priority === 3 ? 'important' : 'normal')
const ruleOf = (l: Level): { priority: Urgency | null; hidden: boolean } =>
  l === 'hidden' ? { priority: null, hidden: true } : { priority: l === 'later' ? 1 : l === 'important' ? 3 : 2, hidden: false }

/** Types that show up in the feed of a real installation; the rest come later with more sources. */
const COMMON: CardType[] = ['question', 'voice', 'event', 'task', 'poll', 'reminder', 'link', 'photos', 'digest', 'person', 'followup', 'insight']

export default function Learning() {
  const { t } = useTranslation()
  const { api } = useSession()
  const toast = useToast()
  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<CardType | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setPrefs(await api.preferences())
    } catch (e) {
      setError(errorText(e))
    }
  }, [api])
  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<PreferencesResponse>, done?: string) => {
    try {
      setPrefs(await fn())
      if (done) toast(done)
    } catch (e) {
      toast(errorText(e))
    }
  }

  const levels: { value: Level; label: string }[] = [
    { value: 'later', label: t('card.priorityLow') },
    { value: 'normal', label: t('card.priorityNormal') },
    { value: 'important', label: t('card.priorityHigh') },
    { value: 'hidden', label: t('learning.hide') },
  ]
  const typeName = (type: string) => t(`cardType.${type}`, { defaultValue: type })

  const rule = (r: LearnedRule, i: number) => (
    <View key={r.key} style={[{ gap: 10, paddingVertical: 14, paddingHorizontal: 16 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={[type.bodyItalic, { fontSize: 16, flex: 1 }]}>{r.kind === 'type' ? typeName(r.target) : r.label}</Text>
        <Micro>{r.kind === 'chat' ? t('learning.kindChat') : t('learning.kindType')}</Micro>
      </View>
      <Text style={type.small}>{r.source === 'learned' ? t('learning.learnedAt', { when: ago(r.updatedAt) }) : t('learning.setByYou', { when: ago(r.updatedAt) })}</Text>
      <Choice label={t('learning.show')} options={levels} value={levelOf(r)} onChange={(l) => void run(() => api.setRule({ kind: r.kind, target: r.target, ...ruleOf(l) }))} />
      <BlockButton label={t('learning.remove')} variant="line" onPress={() => void run(() => api.removeRule(r.key), t('learning.removed'))} />
    </View>
  )

  return (
    <Page title={t('learning.title')} sub={t('learning.sub')} back>
      {error ? <Notice level="error" text={error} /> : null}
      {!prefs ? (
        <Text style={type.sub}>{t('common.loading')}</Text>
      ) : (
        <>
          <Section title={t('learning.howTitle')}>
            <Panel style={{ gap: 12 }}>
              <Text style={type.body}>{t('learning.how')}</Text>
              <Toggle label={t('learning.toggle')} help={t('learning.toggleHelp')} value={prefs.learning} onChange={(v) => void run(() => api.setLearning(v))} />
            </Panel>
          </Section>
          <Section title={t('learning.rules')}>
            {prefs.rules.length ? (
              <Panel padded={false}>{prefs.rules.map(rule)}</Panel>
            ) : (
              <Text style={type.body}>{t('learning.empty')}</Text>
            )}
          </Section>
          <Section title={t('learning.addTitle')}>
            <Panel style={{ gap: 14 }}>
              <Choice
                label={t('learning.addType')}
                options={COMMON.filter((c) => (CARD_TYPES as readonly string[]).includes(c) && !prefs.rules.some((r) => r.kind === 'type' && r.target === c)).map((c) => ({ value: c, label: typeName(c) }))}
                value={adding ?? undefined}
                onChange={setAdding}
              />
              {adding ? (
                <Choice
                  label={t('learning.show')}
                  options={levels.filter((l) => l.value !== 'normal')}
                  value={undefined}
                  onChange={(l) => void run(() => api.setRule({ kind: 'type', target: adding, ...ruleOf(l) }), t('learning.added')).then(() => setAdding(null))}
                />
              ) : null}
              <Text style={type.small}>{t('learning.addChatHint')}</Text>
            </Panel>
          </Section>
          {prefs.rules.some((r) => r.source === 'learned') ? (
            <BlockButton
              label={t('learning.forget')}
              variant="line"
              onPress={() =>
                void confirm(t('learning.forgetConfirm'), t('learning.forget'), t('common.cancel')).then((ok) => (ok ? run(() => api.forgetLearned(), t('learning.forgotten')) : undefined))
              }
            />
          ) : null}
        </>
      )}
    </Page>
  )
}
