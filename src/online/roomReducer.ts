import type { PlayerLanguages } from '../content/types'
import type { Turn } from '../game/buildTurns'
import { createGame, gameReducer } from '../game/gameReducer'
import { resolvePlayers } from '../game/resolvePlayers'
import type { GenerationErrorKind } from '../generation/types'
import type { RoomState } from './protocol'

export type RoomEvent =
  /** The guest is in, with the languages they saved (null if they sent none); the host decides what each player gets. */
  | { type: 'GUEST_HELLO'; languages: PlayerLanguages | null }
  /** The host's view of the sentences being written. */
  | { type: 'WRITING_UPDATED'; topic: string; busy: boolean; error: GenerationErrorKind | null }
  | { type: 'WRITING_CLOSED' }
  | { type: 'START_ROUND'; topic: string; turns: Turn[] }
  | { type: 'CHANGE_TOPIC' }
  | { type: 'NEXT_TURN'; from: 1 | 2 }
  | { type: 'REVEAL'; from: 1 | 2 }
  /** The host goes back to the previous sentence, whoever's turn it was; the guest cannot ask for this. */
  | { type: 'PREVIOUS_TURN' }

/**
 * A new room. With `firstTopic`, it starts out with that topic's sentences on the way (or, if `canGenerate` is false,
 * already failed), so the guest's first view after joining says what is happening instead of waiting for a choice
 * the host has already made.
 */
export const createRoom = (host: PlayerLanguages, firstTopic?: string, canGenerate = true): RoomState => ({
  host,
  guest: null,
  writing: firstTopic === undefined ? null : { topic: firstTopic, busy: canGenerate, error: canGenerate ? null : 'unavailable' },
  round: null,
})

// The host runs this for its own actions and for messages from the guest, so
// the rules live in one place. Events that break a rule return the state as is.
export function roomReducer(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'GUEST_HELLO':
      // The first hello decides the game; a guest coming back, or another one, plays with what was decided.
      if (state.guest !== null) return state
      return { ...state, guest: resolvePlayers(state.host, event.languages)[1] }

    case 'WRITING_UPDATED': {
      if (state.guest === null || state.round !== null) return state
      const { writing } = state
      const { topic, busy, error } = event
      if (writing && writing.topic === topic && writing.busy === busy && writing.error === error) return state
      return { ...state, writing: { topic, busy, error } }
    }

    case 'WRITING_CLOSED':
      return state.writing === null ? state : { ...state, writing: null }

    case 'START_ROUND':
      if (state.guest === null || event.turns.length === 0) return state
      return { ...state, writing: null, round: { topic: event.topic, game: createGame(event.turns) } }

    case 'CHANGE_TOPIC':
      return { ...state, writing: null, round: null }

    case 'PREVIOUS_TURN': {
      const { round } = state
      if (round === null) return state
      const game = gameReducer(round.game, event)
      return game === round.game ? state : { ...state, round: { ...round, game } }
    }

    case 'NEXT_TURN':
    case 'REVEAL': {
      const { round } = state
      if (round === null || round.game.status !== 'playing') return state
      // Only the player whose turn it is may move the game on or show the translation.
      if (round.game.turns[round.game.index].player !== event.from) return state
      return { ...state, round: { ...round, game: gameReducer(round.game, { type: event.type }) } }
    }
  }
}
