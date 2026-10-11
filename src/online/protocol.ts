import { isLanguageCode, type PlayerLanguages } from '../content/types'
import type { Turn } from '../game/buildTurns'
import type { GameState } from '../game/gameReducer'
import { GENERATION_ERROR_KINDS, type GenerationErrorKind } from '../generation/types'

/** The sentences being written for a round, shown to both devices; the round starts by itself once they are. */
export interface WritingState {
  /** A preset topic's id or the text the host typed. */
  topic: string
  /** The host is waiting for the AI; if not, the request failed with `error`. */
  busy: boolean
  error: GenerationErrorKind | null
}

/** Everything both devices need to show the same screen. The host owns it. */
export interface RoomState {
  host: PlayerLanguages
  /** null until the guest has joined; then what they read and translate into, which the host decided (see `resolvePlayers`). */
  guest: PlayerLanguages | null
  /** The sentences being written; null unless the host has chosen a topic and no round is running. */
  writing: WritingState | null
  /** null while the host is choosing a topic or the sentences are being written. */
  round: { topic: string; game: GameState } | null
}

export type HostMessage = { type: 'state'; state: RoomState }

export type GuestMessage =
  /** The guest's saved settings, sent once they are connected; null when they are missing or unusable. */
  | { type: 'hello'; languages: PlayerLanguages | null }
  | { type: 'next-turn' }
  | { type: 'reveal' }

// Messages come from another device, so nothing in them is trusted: each parser
// checks the shape and size of the data and returns null for anything else.

const MAX_TEXT_LENGTH = 300
const MAX_TURNS = 20

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= MAX_TEXT_LENGTH

/** What a player reads and translates into; the two must differ. */
function parseLanguages(raw: unknown): PlayerLanguages | null {
  if (!isRecord(raw) || !isLanguageCode(raw.knows) || !isLanguageCode(raw.learns) || raw.knows === raw.learns) return null
  return { knows: raw.knows, learns: raw.learns }
}

function parseTurn(raw: unknown): Turn | null {
  if (!isRecord(raw) || (raw.player !== 1 && raw.player !== 2) || !isLanguageCode(raw.learning)) {
    return null
  }
  const { sentence } = raw
  if (!isRecord(sentence) || !isText(sentence.id) || !isText(sentence.text) || !isText(sentence.translation)) {
    return null
  }
  return {
    player: raw.player,
    sentence: { id: sentence.id, text: sentence.text, translation: sentence.translation },
    learning: raw.learning,
  }
}

function parseGame(raw: unknown): GameState | null {
  if (!isRecord(raw) || !Array.isArray(raw.turns) || raw.turns.length > MAX_TURNS) {
    return null
  }
  const turns: Turn[] = []
  for (const item of raw.turns) {
    const turn = parseTurn(item)
    if (!turn) return null
    turns.push(turn)
  }
  const { index, status, revealed } = raw
  if (status !== 'playing' && status !== 'finished') return null
  if (typeof revealed !== 'boolean') return null
  if (status === 'playing' && turns.length === 0) return null // there would be no turn to show
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
  if (index >= Math.max(turns.length, 1)) return null
  return { turns, index, status, revealed }
}

function parseWriting(raw: unknown): WritingState | null {
  if (!isRecord(raw) || !isText(raw.topic)) return null
  const { busy, error } = raw
  if (typeof busy !== 'boolean') return null
  if (error !== null && !GENERATION_ERROR_KINDS.some((kind) => kind === error)) return null
  return { topic: raw.topic, busy, error: error as GenerationErrorKind | null }
}

function parseRoomState(raw: unknown): RoomState | null {
  if (!isRecord(raw)) return null
  const host = parseLanguages(raw.host)
  const { round } = raw
  const guest = raw.guest === null ? null : parseLanguages(raw.guest)
  if (host === null || (raw.guest !== null && guest === null)) return null
  const writing = raw.writing === null ? null : parseWriting(raw.writing)
  if (raw.writing !== null && writing === null) return null
  const common = { host, guest, writing }
  if (round === null) return { ...common, round: null }
  if (!isRecord(round) || !isText(round.topic)) return null
  const game = parseGame(round.game)
  return game ? { ...common, round: { topic: round.topic, game } } : null
}

export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isRecord(raw) || raw.type !== 'state') return null
  const state = parseRoomState(raw.state)
  return state ? { type: 'state', state } : null
}

export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!isRecord(raw)) return null
  if (raw.type === 'hello') return { type: 'hello', languages: parseLanguages(raw.languages) }
  if (raw.type === 'next-turn') return { type: 'next-turn' }
  if (raw.type === 'reveal') return { type: 'reveal' }
  return null
}
