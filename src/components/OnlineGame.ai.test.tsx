import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GenerationError, type SentenceGenerator } from '../generation/generator'
import type { GenerationErrorKind } from '../generation/types'
import { createGame, joinGame, sentenceOn, startJoining, startRound, type HostChoices } from '../test/devices'
import { english, german, instantGenerator } from '../test/generators'
import { createMemoryNetwork } from '../test/memoryNetwork'

const answers = { de: german, en: english }

/** A generator that waits until the test says so, so the "generating" screen can be looked at. */
function slowGenerator() {
  const signals: (AbortSignal | undefined)[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => (release = resolve))
  const generator: SentenceGenerator = {
    generate: async (request, signal) => {
      signals.push(signal)
      await gate
      if (signal?.aborted) throw new GenerationError('cancelled')
      return { sentences: answers[request.language], translations: answers[request.language === 'de' ? 'en' : 'de'] }
    },
  }
  return { generator, signals, release }
}

function failingGenerator(kind: GenerationErrorKind) {
  const generator: SentenceGenerator = { generate: () => Promise.reject(new GenerationError(kind)) }
  return generator
}

/** Fails the first `failures` requests, then answers like the instant generator. */
function flakyGenerator(failures: number) {
  const { generator: working, asked } = instantGenerator()
  let remaining = failures
  const generator: SentenceGenerator = {
    generate: (request, signal) => (remaining-- > 0 ? Promise.reject(new GenerationError('unavailable')) : working.generate(request, signal)),
  }
  return { generator, asked }
}

/** The host sets the topic first; the sentences are asked for as soon as the guest has joined. */
async function startWithGenerator(generator: SentenceGenerator, choices: HostChoices = {}) {
  const user = userEvent.setup()
  const network = createMemoryNetwork()
  const host = await createGame(network, user, generator, choices)
  const guest = await joinGame(network, user, host.code)
  return { user, host, guest }
}

/** A generated round that has been played through to its end. */
async function playThrough({ user, host, guest }: Awaited<ReturnType<typeof startWithGenerator>>) {
  await startRound(host, guest)
  for (const device of [host, guest, host, guest]) {
    await user.click(await device.ui.findByRole('button', { name: /next turn|finish round/i }))
  }
  await host.ui.findByRole('heading', { name: 'Round complete' })
  await guest.ui.findByRole('heading', { name: 'Round complete' })
}

describe('hosting with AI sentences', () => {
  describe('a custom topic', () => {
    it('is generated and played by both devices as soon as it is written, each reading their own language', async () => {
      const { generator, asked } = instantGenerator()
      const { host, guest } = await startWithGenerator(generator, { customTopic: 'my pet dragon' })

      await startRound(host, guest)
      expect(asked.map((request) => request.language).sort()).toEqual(['de', 'en'])
      expect(asked.every((request) => request.topic.kind === 'custom' && !request.fresh)).toBe(true)
      expect(host.ui.queryByRole('heading', { name: 'Getting your sentences ready' })).not.toBeInTheDocument()
      expect(german).toContain(sentenceOn(host))
      expect(sentenceOn(guest)).toBe(sentenceOn(host))
      expect(host.ui.getByText(/Topic: my pet dragon/)).toBeInTheDocument()
    })

    it('tells the guest sentences are being written from the moment they join, never that the host still has to choose', async () => {
      const { generator, release } = slowGenerator()
      const user = userEvent.setup()
      const network = createMemoryNetwork()
      const host = await createGame(network, user, generator, { customTopic: 'my pet dragon' })
      const guest = await startJoining(network, user, host.code)

      // Even a flash of the wrong message counts, so look at every change to the guest's screen.
      let sawWaiting = false
      const watch = new MutationObserver(() => {
        sawWaiting ||= /waiting for the host to choose a topic/i.test(guest.container.textContent ?? '')
      })
      watch.observe(guest.container, { subtree: true, childList: true, characterData: true })

      await waitFor(() => expect(guest.ui.getByRole('status')).toHaveTextContent(/generating/i))
      expect(guest.ui.getByText(/Topic: my pet dragon/)).toBeInTheDocument()
      watch.disconnect()
      expect(sawWaiting).toBe(false)
      release()
    })

    it('shows a loading state with Cancel, and Cancel returns to the topics', async () => {
      const { generator, signals, release } = slowGenerator()
      const { user, host, guest } = await startWithGenerator(generator, { customTopic: 'my pet dragon' })

      expect(await host.ui.findByRole('status')).toHaveTextContent(/generating/i)
      expect(host.ui.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      // The guest sees that sentences are on the way, but cannot cancel them.
      await waitFor(() => expect(guest.ui.getByRole('status')).toHaveTextContent(/generating/i))
      expect(guest.ui.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

      await user.click(host.ui.getByRole('button', { name: 'Cancel' }))
      await host.ui.findByRole('button', { name: 'Greetings and small talk' })
      await guest.ui.findByText(/waiting for the host to choose a topic/i)
      expect(signals.every((signal) => signal?.aborted)).toBe(true)
      release()
      // The late answer must not start a round the host cancelled.
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(host.ui.queryByText('Turn 1 of 4')).not.toBeInTheDocument()
      expect(guest.ui.queryByText('Turn 1 of 4')).not.toBeInTheDocument()
    })

    it('explains a failure to both players and lets the host choose another topic', async () => {
      const { user, host, guest } = await startWithGenerator(failingGenerator('limit-reached'), { customTopic: 'my pet dragon' })

      expect(await host.ui.findByRole('alert')).toHaveTextContent(/allowance is used up/i)
      expect(await guest.ui.findByRole('alert')).toHaveTextContent(/allowance is used up/i)
      expect(guest.ui.getByRole('alert')).toHaveTextContent(/wait for the host to try again or choose another topic/i)

      await user.click(host.ui.getByRole('button', { name: 'Choose another topic' }))
      expect(await host.ui.findByRole('button', { name: 'Greetings and small talk' })).toBeInTheDocument()
      expect(await guest.ui.findByText(/waiting for the host to choose a topic/i)).toBeInTheDocument()
    })
  })

  describe('a preset topic', () => {
    it('is generated and played by both devices as soon as it is written', async () => {
      const { generator, asked } = instantGenerator()
      const { host, guest } = await startWithGenerator(generator)

      await startRound(host, guest)
      expect(asked.map((request) => request.language).sort()).toEqual(['de', 'en'])
      expect(asked.every((request) => request.topic.kind === 'preset' && request.topic.id === 'greetings' && !request.fresh)).toBe(true)
      expect(german).toContain(sentenceOn(host))
      expect(sentenceOn(guest)).toBe(sentenceOn(host))
      expect(host.ui.getByText(/Topic: Greetings and small talk/)).toBeInTheDocument()
    })

    it('asks for fresh sentences when the host tries again after a failure, then starts the round', async () => {
      const { generator, asked } = flakyGenerator(2)
      const { user, host, guest } = await startWithGenerator(generator)

      expect(await host.ui.findByRole('alert')).toHaveTextContent(/can't be reached/i)
      await user.click(host.ui.getByRole('button', { name: 'Try again' }))

      await startRound(host, guest)
      expect(asked.length).toBeGreaterThan(0)
      expect(asked.every((request) => request.fresh)).toBe(true)
      expect(german).toContain(sentenceOn(host))
    })

    it('says why and offers the host Try again when the AI cannot be reached, and nothing starts', async () => {
      const { host, guest } = await startWithGenerator(failingGenerator('unavailable'))

      expect(await host.ui.findByRole('alert')).toHaveTextContent(/can't be reached/i)
      expect(host.ui.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      expect(await guest.ui.findByRole('alert')).toHaveTextContent(/can't be reached/i)
      // Only the host can ask again.
      expect(guest.ui.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      expect(host.ui.queryByText(/^Turn 1 of/)).not.toBeInTheDocument()
    })
  })

  it('asks the AI again, not for the same sentences, when playing a generated round again', async () => {
    const { generator, asked } = instantGenerator()
    const devices = await startWithGenerator(generator, { customTopic: 'my pet dragon' })
    const { user, host, guest } = devices
    await playThrough(devices)
    expect(asked).toHaveLength(2)

    await user.click(host.ui.getByRole('button', { name: 'Play again' }))
    await waitFor(() => expect(asked).toHaveLength(4))
    expect(asked.slice(2).every((request) => request.fresh)).toBe(true)
    await startRound(host, guest)
  })

  it('never tells the guest the host still has to choose a topic when Play again starts the next round', async () => {
    const { generator } = instantGenerator()
    const devices = await startWithGenerator(generator, { customTopic: 'my pet dragon' })
    const { user, host, guest } = devices
    await playThrough(devices)

    // Even a flash of the wrong message counts, so look at every change to the guest's screen.
    let sawWaiting = false
    const watch = new MutationObserver(() => {
      sawWaiting ||= /waiting for the host to choose a topic/i.test(guest.container.textContent ?? '')
    })
    watch.observe(guest.container, { subtree: true, childList: true, characterData: true })

    await user.click(host.ui.getByRole('button', { name: 'Play again' }))
    await guest.ui.findByText('Turn 1 of 4')
    watch.disconnect()
    expect(sawWaiting).toBe(false)
  })

  it('stops generating when the host leaves the game', async () => {
    const { generator, signals } = slowGenerator()
    const { user, host } = await startWithGenerator(generator, { customTopic: 'my pet dragon' })
    await host.ui.findByRole('status')

    await user.click(host.ui.getByRole('button', { name: 'Leave game' }))
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal?.aborted)).toBe(true)
  })
})
