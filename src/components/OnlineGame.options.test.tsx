import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createGame, joinGame, sentenceOn, startRound, type HostChoices } from '../test/devices'
import { english, german, instantGenerator } from '../test/generators'
import { createMemoryNetwork } from '../test/memoryNetwork'

/** The host chooses the round before the link exists; the sentences are asked for once the guest joins. */
async function start(choices: HostChoices = {}) {
  const user = userEvent.setup()
  const network = createMemoryNetwork()
  const { generator, asked } = instantGenerator()
  const host = await createGame(network, user, generator, choices)
  const guest = await joinGame(network, user, host.code)
  return { user, host, guest, asked }
}

describe('round options', () => {
  it.each(['A2', 'B1', 'B2'] as const)('asks for %s sentences for both players when the host chose that', async (difficulty) => {
    const { asked } = await start({ difficulty })
    expect(asked.map((request) => request.difficulty)).toEqual([difficulty, difficulty])
  })

  it('keeps the difficulty for Play again, and lets the host change it with Change topic', async () => {
    const { user, host, guest, asked } = await start({ difficulty: 'B2' })
    await startRound(host, guest)
    await host.ui.findByText('Turn 1 of 4')

    await user.click(host.ui.getByRole('button', { name: 'Change topic' }))
    // The in-room picker still has the host's earlier choices, and they can change them.
    expect(await host.ui.findByLabelText('Difficulty')).toHaveValue('B2')
    asked.length = 0
    await user.selectOptions(host.ui.getByLabelText('Difficulty'), 'A2')
    await user.click(host.ui.getByRole('button', { name: 'Weather' }))
    await waitFor(() => expect(asked).toHaveLength(2))
    expect(asked.every((request) => request.difficulty === 'A2' && request.topic.kind === 'preset')).toBe(true)
  })

  it('plays two sentences each, at medium difficulty, unless the host chooses otherwise', async () => {
    const { host, guest, asked } = await start()
    expect(asked.every((request) => request.count === 2 && request.difficulty === 'B1')).toBe(true)
    await startRound(host, guest)
    await host.ui.findByText('Turn 1 of 4')
  })

  it('plays as many turns as the host chose', async () => {
    const { host, guest, asked } = await start({ count: 5 })
    expect(asked.every((request) => request.count === 5)).toBe(true)
    await startRound(host, guest)
    await host.ui.findByText('Turn 1 of 10')
    await guest.ui.findByText('Turn 1 of 10')
  })

  describe('translations', () => {
    it('stay hidden when the round starts, which only shows the sentence the speaker reads', async () => {
      const { host, guest } = await start()
      await startRound(host, guest)
      // The host reads German first, so the English translations are on neither screen.
      expect(german).toContain(sentenceOn(host))
      for (const device of [host, guest]) {
        for (const sentence of english.slice(0, 2)) expect(device.ui.queryByText(sentence)).not.toBeInTheDocument()
      }
    })

    it('hides it from both players until the speaker shows it, then moves on', async () => {
      const { user, host, guest } = await start()
      await startRound(host, guest)
      await host.ui.findByText('Turn 1 of 4')
      await guest.ui.findByText('Turn 1 of 4')

      // Player 1 (host) reads German and translates into English; the translation is English.
      expect(host.ui.queryByText('Translation')).not.toBeInTheDocument()
      expect(guest.ui.queryByText('Translation')).not.toBeInTheDocument()
      // The speaker can show it or move on; the other player can do neither.
      expect(host.ui.getByRole('button', { name: 'Show translation' })).toBeInTheDocument()
      expect(guest.ui.queryByRole('button', { name: /Show translation|Next turn/ })).not.toBeInTheDocument()

      await user.click(host.ui.getByRole('button', { name: 'Show translation' }))
      await host.ui.findByText('Translation')
      await guest.ui.findByText('Translation')
      expect(guest.container.querySelector('.translation')?.textContent).toBe(
        host.container.querySelector('.translation')?.textContent,
      )

      await user.click(host.ui.getByRole('button', { name: 'Next turn' }))
      await guest.ui.findByText('Turn 2 of 4')
      // The next turn is the guest's, and the translation is hidden again.
      expect(host.ui.queryByText('Translation')).not.toBeInTheDocument()
      await waitFor(() => expect(guest.ui.getByRole('button', { name: 'Show translation' })).toBeInTheDocument())
      expect(sentenceOn(guest)).toBe(sentenceOn(host))
    })

    it('lets a speaker skip the translation and go straight to the next turn, on both devices', async () => {
      const { user, host, guest } = await start()
      await startRound(host, guest)
      await host.ui.findByText('Turn 1 of 4')

      await user.click(host.ui.getByRole('button', { name: 'Next turn' }))
      await guest.ui.findByText('Turn 2 of 4')
      await host.ui.findByText('Turn 2 of 4')
      expect(host.ui.queryByText('Translation')).not.toBeInTheDocument()
      expect(guest.ui.queryByText('Translation')).not.toBeInTheDocument()

      // The next turn is the guest's, who may skip too; the other player has no way to move on.
      expect(host.ui.queryByRole('button', { name: /next turn/i })).not.toBeInTheDocument()
      await user.click(await guest.ui.findByRole('button', { name: 'Next turn' }))
      await host.ui.findByText('Turn 3 of 4')
    })

    it('can skip the translation on the last turn to finish the round', async () => {
      const { user, host, guest } = await start()
      await startRound(host, guest)
      for (const device of [host, guest, host]) {
        await user.click(await device.ui.findByRole('button', { name: 'Next turn' }))
      }
      await guest.ui.findByText('Turn 4 of 4')
      await user.click(await guest.ui.findByRole('button', { name: 'Finish round' }))
      await host.ui.findByRole('heading', { name: 'Round complete' })
      await guest.ui.findByRole('heading', { name: 'Round complete' })
    })

    it('lets the guest show the translation on their own turn', async () => {
      const { user, host, guest } = await start()
      await startRound(host, guest)
      await host.ui.findByText('Turn 1 of 4')
      await user.click(host.ui.getByRole('button', { name: 'Show translation' }))
      await host.ui.findByText('Translation')
      await user.click(host.ui.getByRole('button', { name: 'Next turn' }))
      await guest.ui.findByText('Turn 2 of 4')
      await user.click(await guest.ui.findByRole('button', { name: 'Show translation' }))
      await host.ui.findByText('Translation')
      await user.click(guest.ui.getByRole('button', { name: 'Next turn' }))
      await host.ui.findByText('Turn 3 of 4')
    })

    it('plays a whole round, showing each translation first, and keeps the options for Play again', async () => {
      const { user, host, guest, asked } = await start()
      await startRound(host, guest)
      await host.ui.findByText('Turn 1 of 4')
      for (const device of [host, guest, host, guest]) {
        await user.click(await device.ui.findByRole('button', { name: 'Show translation' }))
        // Wait for the translation itself: moving on is possible before it, so the button alone proves nothing.
        await device.ui.findByText('Translation')
        await user.click(await device.ui.findByRole('button', { name: /next turn|finish round/i }))
      }
      await host.ui.findByRole('heading', { name: 'Round complete' })

      asked.length = 0
      await user.click(host.ui.getByRole('button', { name: 'Play again' }))
      await waitFor(() => expect(asked).toHaveLength(2))
      expect(asked.every((request) => request.count === 2 && request.fresh === true)).toBe(true)
    })
  })
})
