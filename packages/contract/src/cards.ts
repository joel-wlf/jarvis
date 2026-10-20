// Card model shared by the API (mcp-server), the organizer and the app.
// Every card is one decision for the owner: what happened, where it came from, and prepared next steps.

/** Visual and filter group. The app renders one tab per group. */
export type CardGroup = 'reply' | 'schedule' | 'todo' | 'know'

/** 1 = can wait, 2 = soon, 3 = needs attention now. */
export type Urgency = 1 | 2 | 3

/** Lifecycle state, same semantics as the watch service (watch_state). */
export type CardState = 'new' | 'notified' | 'scheduled'

/** What a tap on a suggestion or button does. The API executes it via POST /api/v1/cards/:key/act. */
export type CardAction =
  | { kind: 'send'; text: string } // send a WhatsApp message into the card's chat (outbox)
  | { kind: 'react'; emoji: string; messageId: string }
  | { kind: 'vote'; option: string; pollId: string }
  | { kind: 'done' }
  | { kind: 'snooze'; until: string } // ISO timestamp
  | { kind: 'dismiss' } // never show again
  | { kind: 'remind'; at: string; text: string } // create a reminder
  | { kind: 'save_contact'; name: string; lines: string[] }
  | { kind: 'open'; url: string } // open a link or deep link, handled by the app

export interface Suggestion {
  id: string
  label: string
  action: CardAction
  /** true for the primary suggestion, rendered as the black slab */
  primary?: boolean
}

/** Where the card comes from. Shown in the card header and used for provenance. */
export interface CardSource {
  chat: string
  chatJid?: string
  /** human readable, already localized by the server ("vor 2 Std.", "Sa 18:00") */
  when: string
  /** ISO timestamp of the underlying message or event, when known */
  at?: string
}

export interface CardBase<T extends CardType, D> {
  key: string
  type: T
  group: CardGroup
  urgency: Urgency
  state: CardState
  title: string
  source: CardSource
  /** one sentence in Jarvis' voice, shown under the figure when the card is selected */
  say: string
  /** extra context from other chats or memory ("Sonntag 14 Uhr hilfst du Lena beim Umzug.") */
  context?: string
  suggestions: Suggestion[]
  data: D
}

export interface Stat {
  label: string
  value: string
}

export interface Person {
  name: string
  initials: string
  jid?: string
}

// --- per type data ---------------------------------------------------------------------------

export interface QuestionData { person: Person; quote: string; waitingSince: string; stats: Stat[] }
export interface VoiceData { person: Person; durationSec: number; summary: string; transcript?: string; stats: Stat[] }
export interface ReactionData { person: Person; quote: string; messageId: string; emojis: string[] }
export interface EventData { day: string; weekday: string; month: string; time: string; place?: string; attendees: Person[]; yes: number; stats: Stat[] }
export interface ConflictData { axis: [number, number]; slots: { label: string; from: number; to: number; group: CardGroup }[]; free?: string; stats: Stat[] }
export interface BirthdayData { person: Person; age?: number; date: string; ideas: string[]; note?: string }
export interface ReminderData { time: string; note?: string; snoozeOptions: { label: string; until: string }[] }
export interface TaskData { amount?: string; recipient?: string; note?: string; dueAt?: string; daysLeft?: number; daysTotal?: number }
export interface PollData { pollId: string; voted: string; options: { label: string; votes: number; recommended?: boolean }[] }
export interface InsightData { text: string; sources: string[] }
export interface DigestData { unread: number; bullets: string[]; mine?: string }
export interface ShoppingData { items: { name: string; who?: string; done: boolean }[] }
export interface ParcelData { steps: string[]; current: number; window?: string; stats: Stat[] }
export interface MoneyData { from: string; to: string; amount: string; note?: string }
export interface FollowupData { days: number; promise: string; promisedAt: string; note?: string }
export interface TripData { depart: string; arrive: string; fromCity: string; toCity: string; track?: string; delayMin?: number; change: string; duration?: string }
export interface PlaceData { name: string; detail?: string; lat?: number; lon?: number }
export interface PersonData { person: Person; facts: Stat[]; lastContact: string }
export interface AddressData { lines: string[] }
export interface LinkData { url: string; domain: string; headline: string; readingTime?: string }
export interface RoutineData { weeks: boolean[]; streak: number; stats: Stat[] }
export interface PhotosData { count: number; withOwner: number; thumbnails: string[] }

export type QuestionCard = CardBase<'question', QuestionData>
export type VoiceCard = CardBase<'voice', VoiceData>
export type ReactionCard = CardBase<'reaction', ReactionData>
export type EventCard = CardBase<'event', EventData>
export type ConflictCard = CardBase<'conflict', ConflictData>
export type BirthdayCard = CardBase<'birthday', BirthdayData>
export type ReminderCard = CardBase<'reminder', ReminderData>
export type TaskCard = CardBase<'task', TaskData>
export type PollCard = CardBase<'poll', PollData>
export type InsightCard = CardBase<'insight', InsightData>
export type DigestCard = CardBase<'digest', DigestData>
export type ShoppingCard = CardBase<'shopping', ShoppingData>
export type ParcelCard = CardBase<'parcel', ParcelData>
export type MoneyCard = CardBase<'money', MoneyData>
export type FollowupCard = CardBase<'followup', FollowupData>
export type TripCard = CardBase<'trip', TripData>
export type PlaceCard = CardBase<'place', PlaceData>
export type PersonCard = CardBase<'person', PersonData>
export type AddressCard = CardBase<'address', AddressData>
export type LinkCard = CardBase<'link', LinkData>
export type RoutineCard = CardBase<'routine', RoutineData>
export type PhotosCard = CardBase<'photos', PhotosData>

export type Card =
  | QuestionCard | VoiceCard | ReactionCard | EventCard | ConflictCard | BirthdayCard | ReminderCard
  | TaskCard | PollCard | InsightCard | DigestCard | ShoppingCard | ParcelCard | MoneyCard | FollowupCard
  | TripCard | PlaceCard | PersonCard | AddressCard | LinkCard | RoutineCard | PhotosCard

export const CARD_TYPES = [
  'question', 'voice', 'reaction', 'event', 'conflict', 'birthday', 'reminder', 'task', 'poll', 'insight', 'digest',
  'shopping', 'parcel', 'money', 'followup', 'trip', 'place', 'person', 'address', 'link', 'routine', 'photos',
] as const
export type CardType = (typeof CARD_TYPES)[number]

/** Default group per type. The server may override it, the app only uses it as a fallback. */
export const CARD_GROUP: Record<CardType, CardGroup> = {
  question: 'reply', voice: 'reply', reaction: 'reply', followup: 'reply',
  event: 'schedule', conflict: 'schedule', birthday: 'schedule', reminder: 'schedule', trip: 'schedule', place: 'schedule', routine: 'schedule',
  task: 'todo', poll: 'todo', shopping: 'todo', parcel: 'todo', money: 'todo',
  insight: 'know', digest: 'know', person: 'know', address: 'know', link: 'know', photos: 'know',
}

/** Types the organizer produces into the `cards` table; the rest are derived live from SQL by the API. */
export const ORGANIZER_CARD_TYPES: CardType[] = ['shopping', 'parcel', 'money', 'followup', 'trip', 'place', 'address', 'link', 'photos', 'birthday', 'insight']
