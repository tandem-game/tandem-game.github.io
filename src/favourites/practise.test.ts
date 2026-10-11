import { describe, expect, it } from 'vitest'
import { favouriteId, type Favourite } from './favourites'
import { practiceFor, reshuffle } from './practise'

const make = (n: number, from: 'de' | 'en' = 'de'): Favourite => {
  const to = from === 'de' ? 'en' : 'de'
  return { id: favouriteId(`T${n}`, `U${n}`, from, to), text: `T${n}`, translation: `U${n}`, textLanguage: from, translationLanguage: to, savedAt: 0 }
}
const noShuffle = () => 0.999

describe('practiceFor', () => {
  it('uses the sentences that read in the language the player speaks and translate into the one they learn', () => {
    const { turns, matching, otherDirection } = practiceFor([make(1), make(2, 'en'), make(3)], 'de', 'en', 5, noShuffle)
    expect(turns.map((turn) => turn.sentence.text).sort()).toEqual(['T1', 'T3'])
    expect(matching).toBe(2)
    expect(otherDirection).toBe(1)
  })

  it('makes one-player turns that translate into the language being learned', () => {
    const [turn] = practiceFor([make(1)], 'de', 'en', 1, noShuffle).turns
    expect(turn).toEqual({ player: 1, sentence: { id: make(1).id, text: 'T1', translation: 'U1' }, learning: 'en' })
  })

  it('takes no more than the count, but still reports how many matched', () => {
    const result = practiceFor([make(1), make(2), make(3)], 'de', 'en', 2, noShuffle)
    expect(result.turns).toHaveLength(2)
    expect(result.matching).toBe(3)
  })

  it('has no turns when nothing matches, or the count is zero', () => {
    expect(practiceFor([make(1, 'en')], 'de', 'en', 3).turns).toEqual([])
    expect(practiceFor([make(1)], 'de', 'en', 0).turns).toEqual([])
  })

  it('picks in a random order and leaves the saved list alone', () => {
    const list = [make(1), make(2), make(3), make(4)]
    const copy = [...list]
    const order = (random: () => number) => practiceFor(list, 'de', 'en', 4, random).turns.map((turn) => turn.sentence.text)
    expect(order(() => 0)).not.toEqual(order(noShuffle))
    expect(list).toEqual(copy)
  })
})

describe('reshuffle', () => {
  it('keeps the same turns in another order', () => {
    const { turns } = practiceFor([make(1), make(2), make(3)], 'de', 'en', 3, noShuffle)
    const again = reshuffle(turns, () => 0)
    expect([...again].sort((a, b) => a.sentence.id.localeCompare(b.sentence.id))).toEqual([...turns].sort((a, b) => a.sentence.id.localeCompare(b.sentence.id)))
    expect(turns).toHaveLength(3)
  })
})
