import { isLanguageCode, type LanguageCode } from '../content/types'
import { MAX_TOPIC_LENGTH } from '../generation/request'
import { isDifficulty, type Difficulty } from '../generation/types'
import { MAX_CHARACTERS } from '../generation/validate'

/** A sentence a player kept, with its translation. The text is in `textLanguage`; the player practises `translationLanguage`. */
export interface Favourite {
  /** Made from the sentence itself, so the same sentence is the same favourite on every device. */
  id: string
  text: string
  translation: string
  textLanguage: LanguageCode
  translationLanguage: LanguageCode
  /** Only for showing; the device that saved it may not have known them. */
  difficulty?: Difficulty
  topic?: string
  /** Milliseconds since 1970. */
  savedAt: number
}

export const MAX_FAVOURITES = 200
/** Far more than 200 sentences need (about 300 bytes each); a bigger file is not ours. */
export const MAX_FILE_CHARACTERS = 200_000
const STORAGE_KEY = 'tandem.favourites.v1'
const FILE_VERSION = 1

/** cyrb53: a small, well spread 53-bit hash. It only has to tell 200 sentences apart, not resist attack. */
function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export const favouriteId = (text: string, translation: string, textLanguage: LanguageCode, translationLanguage: LanguageCode) =>
  hash(JSON.stringify([textLanguage, text, translationLanguage, translation]))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const usableText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_CHARACTERS

/** Checks one untrusted entry; null if it cannot be used. Only known fields are kept, and the id is always recomputed. */
export function parseFavourite(value: unknown): Favourite | null {
  if (!isRecord(value)) return null
  const { text, translation, textLanguage, translationLanguage } = value
  if (!usableText(text) || !usableText(translation)) return null
  if (!isLanguageCode(textLanguage) || !isLanguageCode(translationLanguage) || textLanguage === translationLanguage) return null
  const favourite: Favourite = {
    id: favouriteId(text, translation, textLanguage, translationLanguage),
    text,
    translation,
    textLanguage,
    translationLanguage,
    savedAt: typeof value.savedAt === 'number' && Number.isSafeInteger(value.savedAt) && value.savedAt >= 0 ? value.savedAt : 0,
  }
  if (isDifficulty(value.difficulty)) favourite.difficulty = value.difficulty
  if (typeof value.topic === 'string' && value.topic.trim() !== '' && value.topic.length <= MAX_TOPIC_LENGTH) favourite.topic = value.topic
  return favourite
}

/** The usable entries of an untrusted list, without repeats, and no more than fit. */
export function parseFavourites(value: unknown): Favourite[] {
  if (!Array.isArray(value)) return []
  return merge([], value.slice(0, MAX_FAVOURITES * 2)).list
}

export interface MergeResult {
  list: Favourite[]
  added: number
  /** Already in the list. */
  duplicates: number
  /** Not usable. */
  invalid: number
  /** Usable and new, but the list was full. */
  leftOut: number
}

function merge(list: Favourite[], incoming: readonly unknown[]): MergeResult {
  const result: MergeResult = { list: [...list], added: 0, duplicates: 0, invalid: 0, leftOut: 0 }
  const known = new Set(list.map((favourite) => favourite.id))
  for (const entry of incoming) {
    const favourite = parseFavourite(entry)
    if (favourite === null) result.invalid++
    else if (known.has(favourite.id)) result.duplicates++
    else if (result.list.length >= MAX_FAVOURITES) result.leftOut++
    else {
      known.add(favourite.id)
      result.list.push(favourite)
      result.added++
    }
  }
  return result
}

/** Adds the entries that are usable, new and fit; says what happened to the rest. */
export const mergeFavourites = merge

export type AddResult = 'added' | 'duplicate' | 'full'

export function addFavourite(list: Favourite[], favourite: Favourite): { list: Favourite[]; result: AddResult } {
  if (list.some((existing) => existing.id === favourite.id)) return { list, result: 'duplicate' }
  if (list.length >= MAX_FAVOURITES) return { list, result: 'full' }
  return { list: [...list, favourite], result: 'added' }
}

export const removeFavourite = (list: Favourite[], id: string) => list.filter((favourite) => favourite.id !== id)

/** The text of the file Export downloads. */
export const serialise = (list: Favourite[]) => JSON.stringify({ version: FILE_VERSION, favourites: list }, null, 2)

/** The entries of a file made by Export, still untrusted; null if it is not such a file or is too big. */
export function parseFile(text: string): unknown[] | null {
  if (text.length > MAX_FILE_CHARACTERS) return null
  try {
    const file: unknown = JSON.parse(text)
    return isRecord(file) && file.version === FILE_VERSION && Array.isArray(file.favourites) ? file.favourites : null
  } catch {
    return null
  }
}

// Storage can be missing or throw (private windows, blocked site data), and what it holds is untrusted.
export function loadFavourites(): Favourite[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === null ? [] : parseFavourites(JSON.parse(stored))
  } catch {
    return []
  }
}

/** False when the browser would not keep it. */
export function saveFavourites(list: Favourite[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}
