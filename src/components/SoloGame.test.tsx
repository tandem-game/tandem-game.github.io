import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GenerationError, type SentenceGenerator } from '../generation/generator'
import type { RoundOptions } from '../generation/types'
import { languages } from '../test/devices'
import { english, german, instantGenerator } from '../test/generators'
import { SoloGame } from './SoloGame'

const options: RoundOptions = { count: 2, difficulty: 'B2' }
// A German speaker who is learning English.
const settings = { knows: 'de', learns: 'en', topic: 'greetings', options } as const

/** `null` is a build without AI. */
function play(generator: SentenceGenerator | null = instantGenerator().generator, onLeave = vi.fn()) {
  const view = render(<SoloGame languages={languages} settings={settings} generator={generator ?? undefined} onLeave={onLeave} />)
  return { ui: within(view.container), user: userEvent.setup(), onLeave, container: view.container, unmount: view.unmount }
}

const sentenceOn = (container: HTMLElement) => container.querySelector('.sentence')?.textContent

describe('SoloGame', () => {
  it('asks for one set of sentences, in the language the player speaks, with translations', async () => {
    const { generator, asked } = instantGenerator()
    const { ui } = play(generator)
    await ui.findByText('Turn 1 of 2')

    expect(asked).toEqual([{ language: 'de', topic: { kind: 'preset', id: 'greetings' }, fresh: false, count: 2, difficulty: 'B2' }])
  })

  it('goes straight to the first turn once the sentences are written, with nothing to confirm', async () => {
    const { ui } = play()
    expect(await ui.findByText('Turn 1 of 2')).toBeInTheDocument()
    expect(ui.queryByRole('button', { name: 'Looks good' })).not.toBeInTheDocument()
  })

  it('says it is writing sentences before they arrive, never offering the topics first', async () => {
    const { ui } = play({ generate: () => new Promise(() => {}) })
    expect(ui.queryByRole('heading', { name: 'Choose a topic' })).not.toBeInTheDocument()
    expect(ui.getByRole('status')).toHaveTextContent('Generating sentences…')
  })

  it('plays the sentences through with the translation on request', async () => {
    const { ui, user, container } = play()
    await ui.findByText('Turn 1 of 2')
    expect(ui.queryByText(/partner/i)).not.toBeInTheDocument()
    expect(german).toContain(sentenceOn(container))
    expect(ui.getByRole('heading', { name: /Your turn: translate into English/ })).toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Show translation' }))
    expect(english).toContain(container.querySelector('.translation')?.textContent?.replace('Translation', ''))
    await user.click(ui.getByRole('button', { name: 'Next turn' }))
    expect(ui.getByText('Turn 2 of 2')).toBeInTheDocument()
    expect(container.querySelector('.translation')).toBeNull()

    await user.click(ui.getByRole('button', { name: 'Finish round' }))
    expect(ui.getByRole('heading', { name: 'Round complete' })).toBeInTheDocument()
  })

  it('lets the player go back to earlier sentences, during the round and after it', async () => {
    const { ui, user, container } = play()
    await ui.findByText('Turn 1 of 2')
    const first = sentenceOn(container)
    expect(ui.queryByRole('button', { name: 'Previous sentence' })).not.toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Next turn' }))
    await user.click(ui.getByRole('button', { name: 'Previous sentence' }))
    expect(ui.getByText('Turn 1 of 2')).toBeInTheDocument()
    expect(sentenceOn(container)).toBe(first)

    await user.click(ui.getByRole('button', { name: 'Next turn' }))
    await user.click(ui.getByRole('button', { name: 'Finish round' }))
    await user.click(ui.getByRole('button', { name: 'Previous sentence' }))
    expect(ui.getByText('Turn 2 of 2')).toBeInTheDocument()
  })

  it('offers new sentences for the same topic after a round, and writes them again', async () => {
    const { generator, asked } = instantGenerator()
    const { ui, user } = play(generator)
    await ui.findByText('Turn 1 of 2')
    await user.click(ui.getByRole('button', { name: 'Next turn' }))
    await user.click(ui.getByRole('button', { name: 'Finish round' }))

    await user.click(ui.getByRole('button', { name: 'Play again' }))
    await ui.findByText('Turn 1 of 2')
    expect(asked).toHaveLength(2)
    expect(asked[1]).toMatchObject({ language: 'de', topic: { kind: 'preset', id: 'greetings' }, fresh: true })
  })

  it('goes back to the topics with Change topic, keeping the options, and plays the new topic', async () => {
    const { generator, asked } = instantGenerator()
    const { ui, user } = play(generator)
    await ui.findByText('Turn 1 of 2')
    await user.click(ui.getByRole('button', { name: 'Change topic' }))

    expect(ui.getByLabelText('Sentences')).toHaveValue('2')
    expect(ui.getByLabelText('Difficulty')).toHaveValue('B2')
    expect(ui.queryByLabelText('Show the translation after each turn')).not.toBeInTheDocument()
    await user.type(ui.getByLabelText('Or enter your own topic'), 'my pet dragon')
    await user.click(ui.getByRole('button', { name: 'Use this topic' }))
    await ui.findByText('Turn 1 of 2')
    expect(asked[1]).toMatchObject({ topic: { kind: 'custom', text: 'my pet dragon' }, })
  })

  it('swaps the two languages between rounds, so the next sentences are written in the other one', async () => {
    const { generator, asked } = instantGenerator()
    const { ui, user } = play(generator)
    await ui.findByText('Turn 1 of 2')
    await user.click(ui.getByRole('button', { name: 'Change topic' }))
    expect(ui.getByText('You are learning English')).toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Swap languages' }))
    expect(ui.getByText('You are learning German')).toBeInTheDocument()
    await user.click(ui.getByRole('button', { name: 'Weather' }))
    await ui.findByText('Turn 1 of 2')
    expect(asked[1]).toMatchObject({ language: 'en', topic: { kind: 'preset', id: 'weather' } })
    expect(ui.getByRole('heading', { name: /Your turn: translate into German/ })).toBeInTheDocument()
  })

  it('shows two steps, with no Connect step because there is nobody to connect to', async () => {
    const { ui } = play()
    expect(ui.getAllByRole('listitem').map((item) => item.textContent)).toContain('Sentences')
    expect(ui.queryByText('Connect')).not.toBeInTheDocument()
    expect(ui.getByText('Sentences', { selector: 'li.step' })).toHaveAttribute('aria-current', 'step')
    await ui.findByText('Turn 1 of 2')
    expect(ui.getByText('Play', { selector: 'li.step' })).toHaveAttribute('aria-current', 'step')
  })

  it('shows what went wrong and lets the player try again or pick another topic', async () => {
    let fail = true
    const generator: SentenceGenerator = {
      generate: async (request) => {
        if (fail) throw new GenerationError('limit-reached')
        return instantGenerator().generator.generate(request)
      },
    }
    const { ui, user } = play(generator)
    expect(await ui.findByRole('alert')).toHaveTextContent(/allowance is used up/i)
    expect(ui.queryByText(/Turn 1 of/)).not.toBeInTheDocument()

    fail = false
    await user.click(ui.getByRole('button', { name: 'Try again' }))
    expect(await ui.findByText('Turn 1 of 2')).toBeInTheDocument()
  })

  it('goes to the topics when the first request fails and the player chooses another topic', async () => {
    const generator: SentenceGenerator = { generate: () => Promise.reject(new GenerationError('unavailable')) }
    const { ui, user } = play(generator)
    await user.click(await ui.findByRole('button', { name: 'Choose another topic' }))
    expect(ui.getByRole('heading', { name: 'Choose a topic' })).toBeInTheDocument()
  })

  it('falls back to the topics when the player cancels the first request', async () => {
    const { ui, user } = play({ generate: () => new Promise(() => {}) })
    await user.click(await ui.findByRole('button', { name: 'Cancel' }))
    expect(ui.getByRole('heading', { name: 'Choose a topic' })).toBeInTheDocument()
  })

  it('says there is nothing to play without AI sentences', () => {
    const { ui } = play(null)
    expect(ui.getByRole('alert')).toHaveTextContent(/AI sentences aren't available/i)
  })

  it('leaves when asked, and stops a request that is still running once it is gone', async () => {
    let signal: AbortSignal | undefined
    const { ui, user, onLeave, unmount } = play({
      generate: (_request, s) => {
        signal = s
        return new Promise(() => {})
      },
    })
    await user.click(ui.getByRole('button', { name: 'Leave' }))
    expect(onLeave).toHaveBeenCalled()

    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
