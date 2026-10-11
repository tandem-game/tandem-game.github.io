import type { LanguageCode } from '../content/types'
import type { Turn } from '../game/buildTurns'
import type { Favourite } from './favourites'

/** What the player's own sentences are called while they practise them. */
export const PRACTISE_TOPIC = 'Your favourites'

export interface Practice {
  /** The turns of one round: a random pick, no more than `count`. */
  turns: Turn[]
  /** Every sentence in the direction the player practises, whether or not this round has room for it. */
  matching: number
  /** Saved the other way round (the other language to read), so not for this player's settings. */
  otherDirection: number
}

/** Fisher–Yates; it leaves the list it is given alone. */
function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** The favourites that read in the language the player speaks and translate into the one they learn, as turns for a 1-player round. */
export function practiceFor(list: Favourite[], knows: LanguageCode, learns: LanguageCode, count: number, random: () => number = Math.random): Practice {
  const matching = list.filter((favourite) => favourite.textLanguage === knows && favourite.translationLanguage === learns)
  const turns = shuffled(matching, random)
    .slice(0, Math.max(0, count))
    .map(({ id, text, translation }): Turn => ({ player: 1, sentence: { id, text, translation }, learning: learns }))
  return { turns, matching: matching.length, otherDirection: list.length - matching.length }
}

/** A new random order of the same turns, for playing again. */
export const reshuffle = (turns: Turn[], random: () => number = Math.random) => shuffled(turns, random)
