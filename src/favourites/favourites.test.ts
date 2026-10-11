import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_FAVOURITES,
  addFavourite,
  favouriteId,
  loadFavourites,
  mergeFavourites,
  parseFavourite,
  parseFavourites,
  parseFile,
  removeFavourite,
  saveFavourites,
  serialise,
  type Favourite,
} from './favourites'

const make = (n: number | string, extra: Partial<Favourite> = {}): Favourite => ({
  id: favouriteId(`Satz ${n}`, `Sentence ${n}`, 'de', 'en'),
  text: `Satz ${n}`,
  translation: `Sentence ${n}`,
  textLanguage: 'de',
  translationLanguage: 'en',
  savedAt: 1,
  ...extra,
})
const many = (count: number) => Array.from({ length: count }, (_, i) => make(i))

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('favouriteId', () => {
  it('is the same for the same sentence and different for another sentence, translation or direction', () => {
    const id = favouriteId('Hallo', 'Hello', 'de', 'en')
    expect(favouriteId('Hallo', 'Hello', 'de', 'en')).toBe(id)
    expect(favouriteId('Hallo!', 'Hello', 'de', 'en')).not.toBe(id)
    expect(favouriteId('Hallo', 'Hi', 'de', 'en')).not.toBe(id)
    expect(favouriteId('Hello', 'Hallo', 'en', 'de')).not.toBe(id)
  })

  it('does not mix up where the text ends and the translation begins', () => {
    expect(favouriteId('ab', 'c', 'de', 'en')).not.toBe(favouriteId('a', 'bc', 'de', 'en'))
  })
})

describe('parseFavourite', () => {
  it('keeps a good entry, with its extras', () => {
    expect(parseFavourite(make(1, { difficulty: 'B1', topic: 'weather' }))).toEqual(make(1, { difficulty: 'B1', topic: 'weather' }))
  })

  it('recomputes the id, so a file cannot claim someone else’s', () => {
    expect(parseFavourite({ ...make(1), id: 'stolen' })?.id).toBe(make(1).id)
  })

  it('drops fields it does not know, and unusable extras without dropping the entry', () => {
    const parsed = parseFavourite({ ...make(1), evil: '<script>', difficulty: 'D9', topic: 'x'.repeat(61), savedAt: -5 })
    expect(parsed).toEqual(make(1, { savedAt: 0 }))
    expect(parsed).not.toHaveProperty('evil')
  })

  it.each([
    ['not an object', 'x'],
    ['null', null],
    ['an array', [1]],
    ['no text', { ...make(1), text: undefined }],
    ['blank text', { ...make(1), text: '   ' }],
    ['a number as translation', { ...make(1), translation: 5 }],
    ['text over 160 characters', { ...make(1), text: 'x'.repeat(161) }],
    ['an unknown language', { ...make(1), textLanguage: 'fr' }],
    ['the same language both ways', { ...make(1), translationLanguage: 'de' }],
  ])('rejects %s', (_, value) => {
    expect(parseFavourite(value)).toBeNull()
  })
})

describe('parseFavourites', () => {
  it('keeps the good entries, without repeats, and drops the bad', () => {
    expect(parseFavourites([make(1), 'bad', make(1), make(2)])).toEqual([make(1), make(2)])
  })

  it('is empty for anything that is not a list', () => {
    expect(parseFavourites({ 0: make(1) })).toEqual([])
    expect(parseFavourites(null)).toEqual([])
  })

  it('keeps no more than the limit', () => {
    expect(parseFavourites(many(1000))).toHaveLength(MAX_FAVOURITES)
  })
})

describe('adding and removing', () => {
  it('adds a new one, ignores a repeat, and refuses when full', () => {
    expect(addFavourite([], make(1))).toEqual({ list: [make(1)], result: 'added' })
    expect(addFavourite([make(1)], make(1))).toEqual({ list: [make(1)], result: 'duplicate' })
    expect(addFavourite(many(MAX_FAVOURITES), make('new')).result).toBe('full')
  })

  it('still reports a repeat, not “full”, when the list is full', () => {
    expect(addFavourite(many(MAX_FAVOURITES), make(3)).result).toBe('duplicate')
  })

  it('removes by id, and leaves the rest', () => {
    expect(removeFavourite([make(1), make(2)], make(1).id)).toEqual([make(2)])
    expect(removeFavourite([make(1)], 'unknown')).toEqual([make(1)])
  })
})

describe('mergeFavourites', () => {
  it('adds what is new, and says what it skipped', () => {
    const result = mergeFavourites([make(1)], [make(1), make(2), { nope: true }])
    expect(result).toMatchObject({ added: 1, duplicates: 1, invalid: 1, leftOut: 0 })
    expect(result.list).toEqual([make(1), make(2)])
  })

  it('does not duplicate the same sentence saved on two devices', () => {
    const phone = [make(1, { savedAt: 10 })]
    const laptop = [make(1, { savedAt: 99 }), make(2)]
    expect(mergeFavourites(phone, laptop).list.map((favourite) => favourite.text)).toEqual(['Satz 1', 'Satz 2'])
  })

  it('adds only what fits, and counts the rest as left out', () => {
    const result = mergeFavourites(many(MAX_FAVOURITES - 1), [make('a'), make('b'), make('c')])
    expect(result).toMatchObject({ added: 1, leftOut: 2 })
    expect(result.list).toHaveLength(MAX_FAVOURITES)
  })

  it('does not change the list it was given', () => {
    const list = [make(1)]
    mergeFavourites(list, [make(2)])
    expect(list).toEqual([make(1)])
  })
})

describe('the export file', () => {
  it('round-trips', () => {
    const list = [make(1, { difficulty: 'A2', topic: 'weather' }), make(2)]
    expect(parseFavourites(parseFile(serialise(list)))).toEqual(list)
  })

  it.each([
    ['not JSON', 'nope'],
    ['not an object', '[1]'],
    ['another version', JSON.stringify({ version: 2, favourites: [] })],
    ['no list', JSON.stringify({ version: 1 })],
    ['a list that is not a list', JSON.stringify({ version: 1, favourites: 'x' })],
    ['far too big', JSON.stringify({ version: 1, favourites: [], padding: 'x'.repeat(300_000) })],
  ])('is refused when it is %s', (_, text) => {
    expect(parseFile(text)).toBeNull()
  })
})

describe('storage', () => {
  it('is empty at first, and round-trips', () => {
    expect(loadFavourites()).toEqual([])
    expect(saveFavourites([make(1)])).toBe(true)
    expect(loadFavourites()).toEqual([make(1)])
  })

  it.each(['nope', '"x"', 'null', '{"a":1}'])('reads %s as empty', (stored) => {
    localStorage.setItem('tandem.favourites.v1', stored)
    expect(loadFavourites()).toEqual([])
  })

  it('keeps the good entries of a damaged list', () => {
    localStorage.setItem('tandem.favourites.v1', JSON.stringify([make(1), 5, make(2)]))
    expect(loadFavourites()).toEqual([make(1), make(2)])
  })

  it('survives storage that throws, saying it could not save', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(loadFavourites()).toEqual([])
    expect(saveFavourites([make(1)])).toBe(false)
  })
})
