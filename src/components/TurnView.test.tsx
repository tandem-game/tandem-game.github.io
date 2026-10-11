import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Language } from '../content/types'
import type { GameState } from '../game/gameReducer'
import { TurnView } from './TurnView'

const languages: Language[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'German' },
]

const turns: GameState['turns'] = [
  { player: 1, sentence: { id: 'a', text: 'Ich kann schwimmen.', translation: 'Ich kann schwimmen. (translated)' }, learning: 'en' },
  { player: 2, sentence: { id: 'b', text: 'You must leave now.', translation: 'You must leave now. (translated)' }, learning: 'de' },
]

const playing: GameState = { turns, index: 0, status: 'playing', revealed: false }
const finished: GameState = { turns, index: 1, status: 'finished', revealed: false }

function setup(
  game: GameState,
  props: { canAct?: boolean; onPlayAgain?: () => void; onPrevious?: () => void } = {},
) {
  const onNext = vi.fn()
  const onReveal = vi.fn()
  render(
    <TurnView
      game={game}
      languages={languages}
      canAct={props.canAct ?? true}
      onNext={onNext}
      onReveal={onReveal}
      onPlayAgain={props.onPlayAgain}
      onPrevious={props.onPrevious}
    />,
  )
  return { onNext, onReveal, user: userEvent.setup() }
}

describe('TurnView translations', () => {
  it('keeps the translation hidden and offers to show it', async () => {
    const { user, onReveal, onNext } = setup(playing)
    expect(screen.queryByText(/\(translated\)/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show translation' }))
    expect(onReveal).toHaveBeenCalledOnce()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('lets the player go to the next turn without showing the translation', async () => {
    const { user, onNext, onReveal } = setup(playing)
    await user.click(screen.getByRole('button', { name: 'Next turn' }))
    expect(onNext).toHaveBeenCalledOnce()
    expect(onReveal).not.toHaveBeenCalled()
    expect(screen.queryByText(/\(translated\)/)).not.toBeInTheDocument()
  })

  it('lets the player finish the round from the last turn without showing the translation', async () => {
    const { user, onNext } = setup({ ...playing, index: 1 })
    expect(screen.queryByRole('button', { name: 'Next turn' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish round' }))
    expect(onNext).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Show translation' })).toBeInTheDocument()
  })

  it('only offers the way on once the translation is shown', () => {
    setup({ ...playing, revealed: true })
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Next turn'])
  })

  it('offers no button to the player who is waiting', () => {
    setup(playing, { canAct: false })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the translation once revealed, and then lets the player move on', async () => {
    const { user, onNext } = setup({ ...playing, revealed: true })
    expect(screen.getByText('Ich kann schwimmen. (translated)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show translation' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next turn' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it("shows the other player's translation without a button once revealed", () => {
    setup({ ...playing, revealed: true }, { canAct: false })
    expect(screen.getByText('Ich kann schwimmen. (translated)')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never shows the translation to the player waiting before the reveal', () => {
    setup(playing, { canAct: false })
    expect(screen.queryByText(/\(translated\)/)).not.toBeInTheDocument()
  })
})

describe('TurnView', () => {
  it('shows the current turn and lets the acting player move on', async () => {
    const { user, onNext } = setup(playing)
    expect(screen.getByText('Turn 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your turn: translate into English' })).toBeInTheDocument()
    expect(screen.getByText('Ich kann schwimmen.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next turn' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('makes Show translation the main action, and Next turn the main action once it is shown', () => {
    const { unmount } = render(
      <TurnView game={playing} languages={languages} canAct onNext={vi.fn()} onReveal={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Show translation' })).toHaveClass('primary')
    expect(screen.getByRole('button', { name: 'Next turn' })).not.toHaveClass('primary')
    unmount()
    setup({ ...playing, revealed: true })
    expect(screen.getByRole('button', { name: 'Next turn' })).toHaveClass('primary')
  })

  it('keeps Previous sentence visually quiet', () => {
    setup({ ...playing, index: 1 }, { onPrevious: vi.fn() })
    expect(screen.getByRole('button', { name: 'Previous sentence' })).toHaveClass('quiet')
  })

  it("still shows the sentence but no button when it is the other player's turn", () => {
    setup(playing, { canAct: false })
    expect(screen.getByText('Ich kann schwimmen.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for your partner to finish their turn')
    expect(screen.getByRole('status').querySelector('.spinner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Your partner's turn: translate into English" })).toBeInTheDocument()
  })

  it('offers Finish round on the last turn', () => {
    setup({ ...playing, index: 1 })
    expect(screen.getByRole('button', { name: 'Finish round' })).toBeInTheDocument()
  })

  it('offers Play again when the round is over and the device may restart it', async () => {
    const onPlayAgain = vi.fn()
    const { user } = setup(finished, { onPlayAgain })
    expect(screen.getByRole('heading', { name: 'Round complete' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Play again' }))
    expect(onPlayAgain).toHaveBeenCalledOnce()
  })

  describe('telling a player the sentence went back', () => {
    const second: GameState = { ...playing, index: 1 }
    const view = (game: GameState) => <TurnView game={game} languages={languages} canAct={false} onNext={vi.fn()} onReveal={vi.fn()} />

    it('says so when the other player steps back', () => {
      const { rerender } = render(view(second))
      expect(screen.queryByText('Back to the previous sentence.')).not.toBeInTheDocument()
      rerender(view(playing))
      expect(screen.getByText('Back to the previous sentence.')).toBeInTheDocument()
    })

    it('says so when a finished round is reopened', () => {
      const { rerender } = render(view(finished))
      rerender(view({ ...finished, status: 'playing' }))
      expect(screen.getByText('Back to the previous sentence.')).toBeInTheDocument()
    })

    it('goes away once the translation is shown', () => {
      const { rerender } = render(view(second))
      rerender(view(playing))
      rerender(view({ ...playing, revealed: true }))
      expect(screen.queryByText('Back to the previous sentence.')).not.toBeInTheDocument()
    })

    it('goes away when the round moves on again', () => {
      const { rerender } = render(view(second))
      rerender(view(playing))
      rerender(view(second))
      expect(screen.queryByText('Back to the previous sentence.')).not.toBeInTheDocument()
    })

    it('says nothing when the round simply moves forward', () => {
      const { rerender } = render(view(playing))
      rerender(view(second))
      expect(screen.queryByText('Back to the previous sentence.')).not.toBeInTheDocument()
    })
  })

  describe('going back to the previous sentence', () => {
    const second: GameState = { ...playing, index: 1 }
    const previous = { name: 'Previous sentence' }

    it('is offered on a later turn, even to the player who is waiting', async () => {
      const onPrevious = vi.fn()
      const { user } = setup(second, { canAct: false, onPrevious })
      await user.click(screen.getByRole('button', previous))
      expect(onPrevious).toHaveBeenCalledOnce()
    })

    it('is not offered on the first turn', () => {
      setup(playing, { onPrevious: vi.fn() })
      expect(screen.queryByRole('button', previous)).not.toBeInTheDocument()
    })

    it('is not offered to a device that was not given it', () => {
      setup(second)
      expect(screen.queryByRole('button', previous)).not.toBeInTheDocument()
    })

    it('is offered on the round complete screen', async () => {
      const onPrevious = vi.fn()
      const { user } = setup(finished, { onPrevious })
      await user.click(screen.getByRole('button', previous))
      expect(onPrevious).toHaveBeenCalledOnce()
    })

    it('is not offered when the round has a single sentence and is still on it', () => {
      setup({ ...playing, turns: turns.slice(0, 1) }, { onPrevious: vi.fn() })
      expect(screen.queryByRole('button', previous)).not.toBeInTheDocument()
    })
  })

  it('tells a device that cannot restart the round to wait for the host', () => {
    setup(finished)
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for the host/i)
  })
})

describe('TurnView favourites', () => {
  const api = (saved = false) => ({ has: vi.fn(() => saved), toggle: vi.fn(() => 'added' as const) })

  it('has no star unless it is given somewhere to save', () => {
    setup(playing)
    expect(screen.queryByRole('button', { name: /sentence|favourites/i })).not.toBeInTheDocument()
  })

  it('saves the sentence with its translation and languages, even while the translation is hidden', async () => {
    const favourites = api()
    const user = userEvent.setup()
    render(
      <TurnView game={playing} languages={languages} canAct onNext={vi.fn()} onReveal={vi.fn()} favourites={favourites} favouriteContext={{ topic: 'weather', difficulty: 'B1' }} />,
    )
    await user.click(screen.getByRole('button', { name: /Save sentence/ }))
    expect(favourites.toggle).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Ich kann schwimmen.',
        translation: 'Ich kann schwimmen. (translated)',
        textLanguage: 'de',
        translationLanguage: 'en',
        topic: 'weather',
        difficulty: 'B1',
      }),
    )
  })

  it('offers to remove a sentence that is already saved, to the player who is only listening too', () => {
    render(<TurnView game={playing} languages={languages} canAct={false} onNext={vi.fn()} onReveal={vi.fn()} favourites={api(true)} />)
    expect(screen.getByRole('button', { name: /Remove from favourites/ })).toBeInTheDocument()
  })

  it.each([
    ['full', /favourites are full/],
    ['failed', /wouldn't keep it/],
  ] as const)('says so when saving is %s, and the game stays usable', async (result, message) => {
    const user = userEvent.setup()
    const favourites = { has: () => false, toggle: () => result }
    render(<TurnView game={playing} languages={languages} canAct onNext={vi.fn()} onReveal={vi.fn()} favourites={favourites} />)
    await user.click(screen.getByRole('button', { name: /Save sentence/ }))
    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Show translation' })).toBeEnabled()
  })
})
