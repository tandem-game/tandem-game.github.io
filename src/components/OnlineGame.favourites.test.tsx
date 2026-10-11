import { within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { favouriteId, loadFavourites, saveFavourites, type Favourite } from '../favourites/favourites'
import { saveLastTopic } from '../game/hostPreferences'
import { open } from '../test/devices'
import { german, instantGenerator } from '../test/generators'
import { createMemoryNetwork } from '../test/memoryNetwork'

const mine = (n: number): Favourite => ({
  id: favouriteId(`Satz ${n}`, `Sentence ${n}`, 'de', 'en'),
  text: `Satz ${n}`,
  translation: `Sentence ${n}`,
  textLanguage: 'de',
  translationLanguage: 'en',
  savedAt: 1,
})

const menu = (ui: ReturnType<typeof open>['ui']) => within(ui.getByRole('navigation', { name: 'Help and settings' }))

beforeEach(() => {
  localStorage.clear()
  saveLastTopic('weather')
})

describe('saving sentences while playing', () => {
  it('saves the sentence on the turn card, keeps it after the page is opened again, and shows it in Favourites', async () => {
    const user = userEvent.setup()
    const { ui, container } = open(createMemoryNetwork(), instantGenerator().generator)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Start' }))
    await ui.findByText(/^Turn 1 of/)

    const shown = container.querySelector('.sentence')?.textContent ?? ''
    expect(german).toContain(shown)
    await user.click(ui.getByRole('button', { name: 'Save sentence' }))
    expect(ui.getByRole('button', { name: 'Remove from favourites' })).toBeInTheDocument()
    expect(loadFavourites()).toEqual([
      expect.objectContaining({ text: shown, textLanguage: 'de', translationLanguage: 'en', topic: 'weather', difficulty: 'B1' }),
    ])

    await user.click(ui.getByRole('button', { name: 'Leave' }))
    await user.click(menu(ui).getByRole('button', { name: 'Favourites' }))
    expect(ui.getByText(shown)).toBeInTheDocument()
  })

  it('takes it out again with the same button', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), instantGenerator().generator)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Start' }))
    await ui.findByText(/^Turn 1 of/)
    await user.click(ui.getByRole('button', { name: 'Save sentence' }))
    await user.click(ui.getByRole('button', { name: 'Remove from favourites' }))
    expect(loadFavourites()).toEqual([])
  })
})

describe('the Favourites screen', () => {
  it('is in the menu, is marked as the current page there, and has the other links', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(menu(ui).getByRole('button', { name: 'Favourites' }))
    expect(ui.getByRole('heading', { name: 'Favourites' })).toBeInTheDocument()
    expect(menu(ui).getByRole('button', { name: 'Favourites' })).toBeDisabled()
    await user.click(menu(ui).getByRole('button', { name: 'Home' }))
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
  })

  it('is not in the menu while playing', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), instantGenerator().generator)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Start' }))
    await ui.findByText(/^Turn 1 of/)
    expect(ui.queryByRole('navigation', { name: 'Help and settings' })).not.toBeInTheDocument()
  })

  it('returns to it from Settings opened there', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(menu(ui).getByRole('button', { name: 'Favourites' }))
    await user.click(menu(ui).getByRole('button', { name: 'Settings' }))
    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('heading', { name: 'Favourites' })).toBeInTheDocument()
  })
})

describe('practising favourites', () => {
  it('plays the saved sentences without asking the AI, then plays them again in another order, and leaves for the list', async () => {
    saveFavourites([mine(1), mine(2), mine(3)])
    const { generator, asked } = instantGenerator()
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), generator)
    await user.click(menu(ui).getByRole('button', { name: 'Favourites' }))
    await user.click(ui.getByRole('button', { name: 'Practise 2 of them' }))

    expect(await ui.findByText(/^Turn 1 of 2/)).toBeInTheDocument()
    expect(ui.getByText('Topic: Your favourites')).toBeInTheDocument()
    expect(ui.getByText(/^Satz \d$/)).toBeInTheDocument()
    expect(ui.queryByRole('button', { name: 'Change topic' })).not.toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Next turn' }))
    await user.click(ui.getByRole('button', { name: 'Finish round' }))
    await user.click(ui.getByRole('button', { name: 'Play again' }))
    expect(await ui.findByText(/^Turn 1 of 2/)).toBeInTheDocument()
    expect(asked).toEqual([])

    await user.click(ui.getByRole('button', { name: 'Leave' }))
    expect(ui.getByRole('heading', { name: 'Favourites' })).toBeInTheDocument()
  })

  it('works even when AI sentences are not available in this version', async () => {
    saveFavourites([mine(1)])
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(menu(ui).getByRole('button', { name: 'Favourites' }))
    await user.click(ui.getByRole('button', { name: 'Practise 1 of them' }))
    expect(await ui.findByText('Satz 1')).toBeInTheDocument()
  })
})
