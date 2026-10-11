import type { LanguageCode } from '../content/types'

/** How many sentences one player reads in a round: the host's choice, and what a round has unless they choose. */
export const MIN_COUNT = 1
export const MAX_COUNT = 5
export const DEFAULT_COUNT = 2

export type GenerateTopic = { kind: 'preset'; id: string } | { kind: 'custom'; text: string }

/** How demanding the sentences are, as a CEFR level: from A1 (beginner) to C2 (proficient). */
export const DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]
export const DEFAULT_DIFFICULTY: Difficulty = 'B1'

/** What the levels were called before CEFR: settings saved then are read as these levels. */
const LEGACY_DIFFICULTIES: Record<string, Difficulty> = { easy: 'A2', medium: 'B1', hard: 'B2' }

export const legacyDifficulty = (value: unknown): Difficulty | undefined =>
  typeof value === 'string' && Object.hasOwn(LEGACY_DIFFICULTIES, value) ? LEGACY_DIFFICULTIES[value] : undefined

export const isDifficulty = (value: unknown): value is Difficulty => DIFFICULTIES.some((level) => level === value)

/** What shapes the sentences themselves. Every round also has translations. */
export interface GenerationOptions {
  /** How many sentences each player reads, from `MIN_COUNT` to `MAX_COUNT`. */
  count: number
  difficulty: Difficulty
}

/** What the host chooses for a round. */
export type RoundOptions = GenerationOptions

export const DEFAULT_ROUND_OPTIONS: RoundOptions = { count: DEFAULT_COUNT, difficulty: DEFAULT_DIFFICULTY }

export interface GenerateRequest extends GenerationOptions {
  /** The language the sentences are written in. */
  language: LanguageCode
  topic: GenerateTopic
  /** Skip stored sentences and ask the AI for new ones. */
  fresh: boolean
}

/** What the generator hands back: the sentences and their translations into the other language, in the same order. */
export interface GeneratedSentences {
  sentences: string[]
  translations: string[]
}

/**
 * Why generating failed:
 * - `unavailable`: the service is down or unreachable.
 * - `limit-reached`: the free daily allowance is used up.
 * - `invalid`: the service answered, but not with usable sentences.
 * - `cancelled`: the request was stopped on purpose.
 */
export const GENERATION_ERROR_KINDS = ['unavailable', 'limit-reached', 'invalid', 'cancelled'] as const

export type GenerationErrorKind = (typeof GENERATION_ERROR_KINDS)[number]
