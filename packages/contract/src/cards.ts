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
  /** ISO timestamp by which the owner has to act (answer, pay, sign up). The app sorts cards of equal importance by it. */
  dueAt?: string
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
/** `messageId` + `person.jid` address the audio for GET /api/v1/media/:chatJid/:messageId. */
export interface VoiceData { person: Person; durationSec: number; summary: string; transcript?: string; messageId?: string; stats: Stat[] }
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
/** A group message that addresses the owner, shown with the lines before it. `mention` is the part of `hit.text` to highlight. */
export interface MentionData { before: { who: string; text: string }[]; hit: { who: string; time: string; text: string; mention?: string }; stats: Stat[] }
/** Something the owner asked or proposed that the other side has not confirmed. `askedAt` and `dueAt` are ISO timestamps. */
export interface WaitingData { person: Person; askedAt: string; dueAt?: string; quote: string; stats: Stat[] }
/** Who drives, who rides, who still has no seat. `seats` counts passenger seats. Suggestion ids `ride:<index>` pick a car. */
export interface RideData { cars: { driver: Person; riders: Person[]; seats: number }[]; without: Person[]; stats: Stat[] }
/** A sign-up with limited places (bring list, shifts, helpers). Suggestion ids `need:<id>` pick a line. `have` counts people already in. */
export interface SignupData { needs: { id: string; label: string; have: number; need: number; hint?: string }[]; stats: Stat[] }
/** One share per head that somebody collects. */
export interface LevyData { amount: string; payee: Person; reason: string; way: string; paid: { person: Person; paid: boolean; me?: boolean }[] }
/** A code, PIN or password somebody sent. Shown as cells, can be hidden in the app. */
export interface CodeData { code: string; stats: Stat[] }
/** A file that belongs to a date. `ext` is the short type label on the sheet. */
export interface MaterialData { fileName: string; ext: string; detail: string; url: string; event: { title: string; when: string } }
/** What happened in a chat on this day in an earlier year. `at` is an ISO timestamp, `photos` counts the pictures of that day. */
export interface ThrowbackData { at: string; quote: string; quoteBy: string; photos: number }

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
export type MentionCard = CardBase<'mention', MentionData>
export type WaitingCard = CardBase<'waiting', WaitingData>
export type RideCard = CardBase<'ride', RideData>
export type SignupCard = CardBase<'signup', SignupData>
export type LevyCard = CardBase<'levy', LevyData>
export type CodeCard = CardBase<'code', CodeData>
export type MaterialCard = CardBase<'material', MaterialData>
export type ThrowbackCard = CardBase<'throwback', ThrowbackData>

export type Card =
  | QuestionCard | VoiceCard | ReactionCard | EventCard | ConflictCard | BirthdayCard | ReminderCard
  | TaskCard | PollCard | InsightCard | DigestCard | ShoppingCard | ParcelCard | MoneyCard | FollowupCard
  | TripCard | PlaceCard | PersonCard | AddressCard | LinkCard | RoutineCard | PhotosCard
  | MentionCard | WaitingCard | RideCard | SignupCard | LevyCard | CodeCard | MaterialCard | ThrowbackCard

export const CARD_TYPES = [
  'question', 'voice', 'reaction', 'event', 'conflict', 'birthday', 'reminder', 'task', 'poll', 'insight', 'digest',
  'shopping', 'parcel', 'money', 'followup', 'trip', 'place', 'person', 'address', 'link', 'routine', 'photos',
  'mention', 'waiting', 'ride', 'signup', 'levy', 'code', 'material', 'throwback',
] as const
export type CardType = (typeof CARD_TYPES)[number]

/** Default group per type. The server may override it, the app only uses it as a fallback. */
export const CARD_GROUP: Record<CardType, CardGroup> = {
  question: 'reply', voice: 'reply', reaction: 'reply', followup: 'reply', mention: 'reply', waiting: 'reply',
  event: 'schedule', conflict: 'schedule', birthday: 'schedule', reminder: 'schedule', trip: 'schedule', place: 'schedule', routine: 'schedule', ride: 'schedule',
  task: 'todo', poll: 'todo', shopping: 'todo', parcel: 'todo', money: 'todo', signup: 'todo', levy: 'todo',
  insight: 'know', digest: 'know', person: 'know', address: 'know', link: 'know', photos: 'know', code: 'know', material: 'know', throwback: 'know',
}

/** Types the organizer produces into the `cards` table; the rest are derived live from SQL by the API. */
export const ORGANIZER_CARD_TYPES: CardType[] = ['shopping', 'parcel', 'money', 'followup', 'trip', 'place', 'address', 'link', 'photos', 'birthday', 'insight']
