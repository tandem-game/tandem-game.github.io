import { isLanguageCode, type LanguageCode } from '../content/types'
import { MAX_TOPIC_LENGTH } from '../generation/request'
import { DEFAULT_ROUND_OPTIONS, MAX_COUNT, MIN_COUNT, isDifficulty, type RoundOptions } from '../generation/types'

/** What the host keeps from game to game: the language they speak, the one they learn, and the round options. */
export interface HostDefaults {
  /** What the player reads: their sentences are written in it. */
  knows: LanguageCode
  /** What the host practises: it is the language the partner speaks. Never the same as `knows`. */
  learns: LanguageCode
  options: RoundOptions
}

const DEFAULTS_KEY = 'tandem.hostDefaults.v2'
const TOPIC_KEY = 'tandem.lastTopic.v1'

// Storage can be missing or throw (private windows, blocked site data), and its content is untrusted:
// anything unusable reads as "nothing saved".
function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not saving is fine: the host just configures again next time.
  }
}

/** The settings a player keeps, by name. */
export type SettingKey = 'knows' | 'learns' | 'count' | 'difficulty' | 'review'

/**
 * The version of the settings this app has. Raise it whenever a setting is added, and add that setting to
 * `ADDED_IN` with the new version: everyone who saved before it is shown the settings once, with it highlighted.
 */
export const SETTINGS_VERSION = 1

/** For each setting added after version 1, the version that added it (never above `SETTINGS_VERSION`). */
export const SETTING_ADDED_IN: Partial<Record<SettingKey, number>> = {}

/** What a settings page starts from: a language is '' while it is unset. */
export interface SettingsDraft {
  knows: LanguageCode | ''
  learns: LanguageCode | ''
  options: RoundOptions
}

/**
 * What is saved, as far as it can be used:
 * `none` is a first visit, `complete` is everything the game needs, and `incomplete` is a player who has to look at
 * their settings before playing, with what they had already kept in `draft`.
 */
export type SettingsStatus =
  | { kind: 'none' }
  | { kind: 'complete'; defaults: HostDefaults }
  | {
      kind: 'incomplete'
      draft: SettingsDraft
      /** Settings with no usable saved value. */
      missing: SettingKey[]
      /** Settings added since the player last saved. */
      fresh: SettingKey[]
    }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_COUNT && value <= MAX_COUNT

/** The version a save was made with; saves from before versions existed are version 1. */
const savedVersion = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : 1)

export function loadSettingsStatus(addedIn = SETTING_ADDED_IN): SettingsStatus {
  const stored = read(DEFAULTS_KEY)
  if (stored === null) return { kind: 'none' }
  let raw: unknown
  try {
    raw = JSON.parse(stored)
  } catch {
    return { kind: 'none' }
  }
  if (!isRecord(raw)) return { kind: 'none' }

  const options: Record<string, unknown> = isRecord(raw.options) ? raw.options : {}
  const knows = isLanguageCode(raw.knows) ? raw.knows : ''
  // The two languages must differ: of a clashing pair, the first is kept.
  const learns = isLanguageCode(raw.learns) && raw.learns !== knows ? raw.learns : ''
  const count = isCount(options.count) ? options.count : undefined
  const difficulty = isDifficulty(options.difficulty) ? options.difficulty : undefined
  // The review was added before versions, and a save without it has always meant off.
  const review = typeof options.review === 'boolean' ? options.review : DEFAULT_ROUND_OPTIONS.review
  const reviewUsable = options.review === undefined || typeof options.review === 'boolean'

  const missing: SettingKey[] = []
  if (knows === '') missing.push('knows')
  if (learns === '') missing.push('learns')
  if (count === undefined) missing.push('count')
  if (difficulty === undefined) missing.push('difficulty')
  if (!reviewUsable) missing.push('review')
  const saved = savedVersion(raw.version)
  const fresh = (Object.keys(addedIn) as SettingKey[]).filter((key) => (addedIn[key] ?? 0) > saved)

  if (missing.length === 0 && fresh.length === 0 && knows !== '' && learns !== '' && count !== undefined && difficulty !== undefined) {
    return { kind: 'complete', defaults: { knows, learns, options: { count, difficulty, review } } }
  }
  return {
    kind: 'incomplete',
    draft: {
      knows,
      learns,
      options: { count: count ?? DEFAULT_ROUND_OPTIONS.count, difficulty: difficulty ?? DEFAULT_ROUND_OPTIONS.difficulty, review },
    },
    missing,
    fresh: fresh.filter((key) => !missing.includes(key)),
  }
}

/** The settings the game can start from, or null if there are none or some still need the player's attention. */
export function loadHostDefaults(): HostDefaults | null {
  const status = loadSettingsStatus()
  return status.kind === 'complete' ? status.defaults : null
}

export const saveHostDefaults = ({ knows, learns, options }: HostDefaults) =>
  write(DEFAULTS_KEY, JSON.stringify({ version: SETTINGS_VERSION, knows, learns, options }))

/** The topic of the host's last game: a preset's id, or the text they typed. */
export function loadLastTopic(): string | null {
  const stored = read(TOPIC_KEY)?.trim()
  return stored && stored.length <= MAX_TOPIC_LENGTH ? stored : null
}

export const saveLastTopic = (topic: string) => write(TOPIC_KEY, topic)

/** What a first visit starts from: a German speaker learns English, anyone else learns German. */
export function suggestHostDefaults(browserLanguage: string = navigator.language): HostDefaults {
  const german = browserLanguage.toLowerCase().startsWith('de')
  return { knows: german ? 'de' : 'en', learns: german ? 'en' : 'de', options: DEFAULT_ROUND_OPTIONS }
}
