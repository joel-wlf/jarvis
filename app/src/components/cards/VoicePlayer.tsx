// A voice message that plays in place. The audio is fetched from the server on the first tap (MP3, so every browser plays it).
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'
import { errorText } from '@/i18n/format'
import { useSession } from '@/state/session'
import { colors } from '@/theme/tokens'
import { type } from '@/theme/type'
import { Icon } from '../Icon'
import { Press } from '../ui'

/** Stable pseudo waveform per message, so the bars do not jump between renders. */
function bars(seed: string, n = 28) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return Array.from({ length: n }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0
    return 0.25 + ((h >>> 16) % 1000) / 1000 * 0.75 * (0.6 + 0.4 * Math.sin((i / n) * Math.PI))
  })
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function VoicePlayer({ seconds, chatJid, messageId }: { seconds: number; chatJid?: string; messageId?: string }) {
  const { t } = useTranslation()
  const { api } = useSession()
  const player = useRef<AudioPlayer | null>(null)
  const blob = useRef<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle')
  const [pos, setPos] = useState(0)
  const [duration, setDuration] = useState(seconds)
  const [error, setError] = useState<string | null>(null)
  const playable = !!chatJid && !!messageId

  useEffect(
    () => () => {
      player.current?.remove()
      if (blob.current?.startsWith('blob:')) URL.revokeObjectURL(blob.current)
    },
    [],
  )

  const toggle = async () => {
    if (!playable || state === 'loading') return
    setError(null)
    if (player.current) {
      if (state === 'playing') {
        player.current.pause()
        setState('paused')
      } else {
        if (pos >= duration - 0.3) await player.current.seekTo(0)
        player.current.play()
        setState('playing')
      }
      return
    }
    setState('loading')
    try {
      const src = await api.media(chatJid!, messageId!)
      if (src.uri.startsWith('blob:')) blob.current = src.uri
      const p = createAudioPlayer(src.headers ? { uri: src.uri, headers: src.headers } : src.uri, { updateInterval: 250 })
      p.addListener('playbackStatusUpdate', (st) => {
        setPos(st.currentTime)
        if (st.duration > 0) setDuration(st.duration)
        if (st.didJustFinish) setState('paused')
      })
      player.current = p
      p.play()
      setState('playing')
    } catch (e) {
      setState('idle')
      setError(errorText(e))
    }
  }

  const b = bars(messageId ?? String(seconds))
  const played = duration > 0 ? pos / duration : 0
  return (
    <View style={{ gap: 6 }}>
      <View style={st.row}>
        <Press
          onPress={() => void toggle()}
          disabled={!playable}
          accessibilityRole="button"
          accessibilityLabel={state === 'playing' ? t('card.pause') : t('card.play')}
          accessibilityState={{ disabled: !playable, busy: state === 'loading' }}
          style={({ hovered }) => [st.play, !playable && { opacity: 0.4 }, hovered && playable && { backgroundColor: colors.ground2 }]}
        >
          {state === 'loading' ? <ActivityIndicator size="small" color={colors.ink} /> : <Icon name={state === 'playing' ? 'pause' : 'play'} size={12} />}
        </Press>
        <View style={st.wave} aria-hidden>
          {b.map((v, i) => (
            <View key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, minHeight: 2, backgroundColor: i / b.length < played ? colors.ink : colors.line2 }} />
          ))}
        </View>
        <Text style={[type.small, { fontSize: 13, minWidth: 34, textAlign: 'right' }]}>{state === 'idle' ? mmss(duration) : mmss(pos)}</Text>
      </View>
      {error ? <Text style={[type.small, { color: colors.warn }]}>{t('card.playFailed', { reason: error })}</Text> : null}
    </View>
  )
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { width: 38, height: 38, borderWidth: 1, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  wave: { flex: 1, height: 26, flexDirection: 'row', alignItems: 'center', gap: 2 },
})
