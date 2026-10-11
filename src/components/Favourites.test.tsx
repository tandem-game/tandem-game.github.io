import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Language } from '../content/types'
import { MAX_FAVOURITES, favouriteId, loadFavourites, saveFavourites, serialise, type Favourite } from '../favourites/favourites'
import { Favourites, PAGE_SIZE } from './Favourites'

const languages: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
]

const make = (n: number | string, extra: Partial<Favourite> = {}): Favourite => ({
  id: favouriteId(`Satz ${n}`, `Sentence ${n}`, 'de', 'en'),
  text: `Satz ${n}`,
  translation: `Sentence ${n}`,
  textLanguage: 'de',
  translationLanguage: 'en',
  savedAt: 1,
  ...extra,
})

const mine = { knows: 'de', learns: 'en', options: { count: 2, difficulty: 'B1' } } as const
const show = (defaults: Parameters<typeof Favourites>[0]['defaults'] = null, onPractise = vi.fn()) => {
  render(<Favourites languages={languages} defaults={defaults} onPractise={onPractise} />)
  return onPractise
}

const file = (content: string) => new File([content], 'favourites.json', { type: 'application/json' })
const importing = async (content: string) => {
  const user = userEvent.setup()
  await user.upload(screen.getByLabelText('Import favourites'), file(content))
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('Favourites screen', () => {
  it('explains how to save one when there are none, and has nothing to export', () => {
    show()
    expect(screen.getByText(/No favourites yet/)).toBeInTheDocument()
    expect(screen.getByText('0 of 200 saved on this device.', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export favourites' })).toBeDisabled()
  })

  it('lists each sentence with its translation, languages, level and topic', () => {
    saveFavourites([make(1, { difficulty: 'B1', topic: 'weather' })])
    show()
    expect(screen.getByText('Satz 1')).toBeInTheDocument()
    expect(screen.getByText('Sentence 1')).toBeInTheDocument()
    expect(screen.getByText(/German → English · B1 · Weather/)).toBeInTheDocument()
  })

  it('removes one, here and in storage, and leaves the rest', async () => {
    saveFavourites([make(1), make(2)])
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Remove “Satz 1”' }))
    expect(screen.queryByText('Satz 1')).not.toBeInTheDocument()
    expect(screen.getByText('Satz 2')).toBeInTheDocument()
    expect(loadFavourites()).toEqual([make(2)])
  })
})

describe('export', () => {
  it('downloads the list as a file that Import can read back', async () => {
    saveFavourites([make(1), make(2)])
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn((given: Blob) => {
      blob = given
      return 'blob:x'
    })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Export favourites' }))
    expect(click).toHaveBeenCalled()
    expect(await blob?.text()).toBe(serialise([make(1), make(2)]))
  })
})

describe('import', () => {
  it('adds the new sentences and says what it skipped', async () => {
    saveFavourites([make(1)])
    show()
    await importing(JSON.stringify({ version: 1, favourites: [make(1), make(2), { nope: true }] }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added 1. Skipped 1 you already have, 1 that could not be used.')
    expect(screen.getByText('Satz 2')).toBeInTheDocument()
    expect(loadFavourites().map((favourite) => favourite.text)).toEqual(['Satz 1', 'Satz 2'])
  })

  it.each([
    ['text that is not JSON', 'nope'],
    ['a file from another version', JSON.stringify({ version: 9, favourites: [] })],
    ['a list that is not a list', JSON.stringify({ version: 1, favourites: 'x' })],
    ['a file that is far too big', JSON.stringify({ version: 1, favourites: [], padding: 'x'.repeat(300_000) })],
  ])('changes nothing for %s', async (_, content) => {
    saveFavourites([make(1)])
    show()
    await importing(content)
    expect(await screen.findByRole('status')).toHaveTextContent('Nothing was changed')
    expect(loadFavourites()).toEqual([make(1)])
  })

  it('adds only what fits when the list is nearly full', async () => {
    saveFavourites(Array.from({ length: MAX_FAVOURITES - 1 }, (_, i) => make(i)))
    show()
    await importing(JSON.stringify({ version: 1, favourites: [make('a'), make('b'), make('c')] }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added 1. Skipped 2 because the list is full.')
    await waitFor(() => expect(loadFavourites()).toHaveLength(MAX_FAVOURITES))
  })

  it('does not keep a hostile entry’s extra fields or its own id', async () => {
    show()
    await importing(JSON.stringify({ version: 1, favourites: [{ ...make(1), id: 'stolen', evil: '<img src=x onerror=alert(1)>' }] }))
    await screen.findByRole('status')
    const [saved] = loadFavourites()
    expect(saved.id).toBe(make(1).id)
    expect(saved).not.toHaveProperty('evil')
  })

  it('says so when the browser will not keep the new sentences', async () => {
    show()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    await importing(JSON.stringify({ version: 1, favourites: [make(1)] }))
    expect(await screen.findByRole('status')).toHaveTextContent("wouldn't keep them")
    expect(screen.queryByText('Satz 1')).not.toBeInTheDocument()
  })
})

describe('practice', () => {
  it('has no button without saved settings, since they say which direction to practise', () => {
    saveFavourites([make(1)])
    show(null)
    expect(screen.queryByRole('button', { name: /Practise/ })).not.toBeInTheDocument()
  })

  it('starts a round from the sentences that match the settings, up to the count', async () => {
    saveFavourites([make(1), make(2), make(3)])
    const onPractise = show(mine)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Practise 2 of them' }))
    expect(onPractise).toHaveBeenCalledTimes(1)
    const [turns] = onPractise.mock.calls[0]
    expect(turns).toHaveLength(2)
    expect(turns[0]).toMatchObject({ player: 1, learning: 'en' })
  })

  it('says how many are left out because they were saved the other way round', () => {
    saveFavourites([make(1), make(2, { textLanguage: 'en', translationLanguage: 'de' })])
    show(mine)
    expect(screen.getByText('1 saved the other way round, so they are left out of practice.')).toBeInTheDocument()
  })

  it('cannot start, and explains why, when none match', () => {
    saveFavourites([make(1, { textLanguage: 'en', translationLanguage: 'de' })])
    show(mine)
    expect(screen.getByRole('button', { name: 'Practise favourites' })).toBeDisabled()
    expect(screen.getByText(/None of them read in German and translate into English/)).toBeInTheDocument()
  })

  it('cannot start with no favourites at all', () => {
    show(mine)
    expect(screen.getByRole('button', { name: 'Practise favourites' })).toBeDisabled()
  })
})

describe('the table, pagination and search', () => {
  const lots = (count: number) => Array.from({ length: count }, (_, i) => make(i + 1))
  const rowsShown = () => screen.getAllByRole('row').length - 1 // without the header row

  it('lists the favourites in a table with headings', () => {
    saveFavourites([make(1)])
    show()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Sentence' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Translation' })).toBeInTheDocument()
  })

  it('shows one page of rows at a time, with Previous and Next that stop at the ends', async () => {
    saveFavourites(lots(25))
    const user = userEvent.setup()
    show()
    expect(rowsShown()).toBe(PAGE_SIZE)
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByText('Satz 1')).toBeInTheDocument()
    expect(screen.queryByText('Satz 11')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
    expect(screen.getByText('Satz 11')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(rowsShown()).toBe(5)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
  })

  it('has no page controls when everything fits on one page', () => {
    saveFavourites(lots(PAGE_SIZE))
    show()
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it('shows 200 favourites in pages, not all at once', () => {
    saveFavourites(lots(MAX_FAVOURITES))
    show()
    expect(rowsShown()).toBe(PAGE_SIZE)
    expect(screen.getByText(`Page 1 of ${MAX_FAVOURITES / PAGE_SIZE}`)).toBeInTheDocument()
  })

  it('searches the whole list, not only the page on show, and says how many match', async () => {
    saveFavourites(lots(25))
    const user = userEvent.setup()
    show()
    await user.type(screen.getByRole('searchbox', { name: 'Search favourites' }), 'Satz 23')
    expect(screen.getByText('1 of 25 match.')).toBeInTheDocument()
    expect(screen.getByText('Satz 23')).toBeInTheDocument()
    expect(rowsShown()).toBe(1)
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it('goes back to the first page when the search changes, and the whole list when it is cleared', async () => {
    saveFavourites(lots(25))
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByRole('searchbox'), 'sentence')
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    expect(screen.queryByText(/match\./)).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
  })

  it('matches without regard to case, in the translation, the topic, the level and the languages, and needs every word', async () => {
    saveFavourites([
      make(1, { topic: 'weather', difficulty: 'B2' }),
      make(2, { translation: 'A rainy Tuesday', topic: 'food-and-drink', difficulty: 'A1' }),
      make(3, { textLanguage: 'en', translationLanguage: 'de' }),
    ])
    const user = userEvent.setup()
    show()
    const box = screen.getByRole('searchbox')
    await user.type(box, 'RAINY')
    expect(screen.getByText('A rainy Tuesday')).toBeInTheDocument()
    expect(rowsShown()).toBe(1)
    await user.clear(box)
    await user.type(box, 'weather b2')
    expect(screen.getByText('Satz 1')).toBeInTheDocument()
    expect(rowsShown()).toBe(1)
    await user.clear(box)
    await user.type(box, 'weather a1')
    expect(screen.getByText(/No favourites match/)).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, 'german')
    expect(rowsShown()).toBe(3) // the language names are in every row, whichever way it was saved
  })

  it('says so when nothing matches, and keeps the search box to change it', async () => {
    saveFavourites(lots(3))
    const user = userEvent.setup()
    show()
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('No favourites match “zzz”.')).toBeInTheDocument()
    expect(screen.getByText('0 of 3 match.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('takes a typed word as text, not as a pattern', async () => {
    saveFavourites([make(1)])
    const user = userEvent.setup()
    show()
    await user.type(screen.getByRole('searchbox'), '.*(')
    expect(screen.getByText(/No favourites match/)).toBeInTheDocument()
  })

  it('moves back a page when removing the last row of the last page', async () => {
    saveFavourites(lots(PAGE_SIZE + 1))
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: `Remove “Satz ${PAGE_SIZE + 1}”` }))
    expect(rowsShown()).toBe(PAGE_SIZE)
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })

  it('removes from a search result and keeps the search', async () => {
    saveFavourites(lots(15))
    const user = userEvent.setup()
    show()
    await user.type(screen.getByRole('searchbox'), 'Satz 1')
    expect(screen.getByText('7 of 15 match.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove “Satz 10”' }))
    expect(screen.getByText('6 of 14 match.')).toBeInTheDocument()
  })

  it('exports the whole list, not only the rows found', async () => {
    saveFavourites(lots(15))
    let blob: Blob | undefined
    URL.createObjectURL = vi.fn((given: Blob) => ((blob = given), 'blob:x'))
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    show()
    await user.type(screen.getByRole('searchbox'), 'Satz 1')
    await user.click(screen.getByRole('button', { name: 'Export favourites' }))
    expect(JSON.parse((await blob?.text()) ?? '{}').favourites).toHaveLength(15)
  })
})
