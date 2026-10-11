import type { Turn } from '../game/buildTurns'
import type { Difficulty } from '../generation/types'
import { favouriteId, type Favourite } from './favourites'

/** Where the sentence came from, when the device knows it; it is only shown in the list. */
export interface FavouriteContext {
  topic?: string
  difficulty?: Difficulty
}

/** The favourite for a turn: its sentence is in the other language than the one the player translates into. */
export function favouriteFromTurn({ sentence, learning }: Turn, { topic, difficulty }: FavouriteContext = {}, savedAt = Date.now()): Favourite {
  const textLanguage = learning === 'en' ? 'de' : 'en'
  const favourite: Favourite = {
    id: favouriteId(sentence.text, sentence.translation, textLanguage, learning),
    text: sentence.text,
    translation: sentence.translation,
    textLanguage,
    translationLanguage: learning,
    savedAt,
  }
  if (topic !== undefined) favourite.topic = topic
  if (difficulty !== undefined) favourite.difficulty = difficulty
  return favourite
}
