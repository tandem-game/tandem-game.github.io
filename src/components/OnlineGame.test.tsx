import { render, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { saveHostDefaults } from '../game/hostPreferences'
import {
  SAVED_DEFAULTS,
  chooseTopic,
  createGame,
  currentStep,
  joinGame,
  languages,
  open,
  sentenceOn,
  startJoining,
  startRound,
} from '../test/devices'
import { english, german, instantGenerator } from '../test/generators'
import { createMemoryNetwork } from '../test/memoryNetwork'
import { OnlineGame } from './OnlineGame'

describe('OnlineGame menu', () => {
  it('first asks whether to play alone or with a partner', () => {
    const { ui } = open(createMemoryNetwork())
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
    expect(ui.getByRole('button', { name: '2 players' })).toBeInTheDocument()
    expect(ui.queryByRole('button', { name: 'Create a game' })).not.toBeInTheDocument()
    expect(ui.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('offers to create or join a game once two players are chosen, and can go back', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(ui.getByRole('button', { name: '2 players' }))
    expect(ui.getByRole('button', { name: 'Create a game' })).toBeInTheDocument()
    expect(ui.getByRole('button', { name: 'Join a game' })).toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('button', { name: '2 players' })).toBeInTheDocument()
  })

  it.each([
    ['Create a game', 'Create game'],
    ['Join a game', 'Join game'],
  ])('can go back to the menu from "%s"', async (menuButton, formButton) => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(ui.getByRole('button', { name: '2 players' }))
    await user.click(ui.getByRole('button', { name: menuButton }))
    expect(ui.getByRole('button', { name: formButton })).toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('button', { name: 'Create a game' })).toBeInTheDocument()
  })
})

describe('playing alone', () => {
  it('sets the round up, plays the sentences as soon as they are written, then leaves back to the start', async () => {
    const user = userEvent.setup()
    const { generator, asked } = instantGenerator()
    const { ui, container } = open(createMemoryNetwork(), generator)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Weather' }))
    await user.click(ui.getByRole('button', { name: 'Start' }))

    await ui.findByText(/^Turn 1 of/)
    expect(german).toContain(sentenceOn({ container }))
    await user.click(ui.getByRole('button', { name: 'Show translation' }))
    await user.click(ui.getByRole('button', { name: 'Next turn' }))
    await user.click(ui.getByRole('button', { name: 'Finish round' }))
    expect(ui.getByRole('heading', { name: 'Round complete' })).toBeInTheDocument()
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ language: 'de', topic: { kind: 'preset', id: 'weather' } })

    await user.click(ui.getByRole('button', { name: 'Leave' }))
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
  })

  it('can go back from the setup to the first choice', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('button', { name: '2 players' })).toBeInTheDocument()
  })

  it('does not touch the network', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = vi.spyOn(network, 'createRoom')
    const join = vi.spyOn(network, 'join')
    const { ui } = open(network, instantGenerator().generator)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Weather' }))
    await user.click(ui.getByRole('button', { name: 'Start' }))
    await ui.findByText(/^Turn 1 of/)

    expect(host).not.toHaveBeenCalled()
    expect(join).not.toHaveBeenCalled()
  })
})

describe('playing a whole round on two devices', () => {
  it('keeps both devices in step and only lets the player whose turn it is move on', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    expect(await host.ui.findByText(/waiting for your partner to join/i)).toBeInTheDocument()

    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)
    expect(host.ui.getByText('You are learning English')).toBeInTheDocument()
    expect(host.ui.getByText('Your partner is learning German')).toBeInTheDocument()
    expect(guest.ui.getByText('You are learning German')).toBeInTheDocument()
    expect(guest.ui.getByText('Your partner is learning English')).toBeInTheDocument()

    await startRound(host, guest)
    await host.ui.findByText('Turn 1 of 4')
    await guest.ui.findByText('Turn 1 of 4')

    // Player 1 (host) reads a German sentence; the partner sees the same one.
    expect(german).toContain(sentenceOn(host))
    expect(sentenceOn(guest)).toBe(sentenceOn(host))
    expect(guest.ui.queryByRole('button', { name: /next turn/i })).not.toBeInTheDocument()
    expect(guest.ui.getByRole('status')).toHaveTextContent('Waiting for your partner')

    for (const [turn, mover, other] of [
      [1, host, guest],
      [2, guest, host],
      [3, host, guest],
    ] as const) {
      await user.click(mover.ui.getByRole('button', { name: 'Next turn' }))
      await other.ui.findByText(`Turn ${turn + 1} of 4`)
      await mover.ui.findByText(`Turn ${turn + 1} of 4`)
      expect(mover.ui.queryByRole('button', { name: /next turn|finish/i })).not.toBeInTheDocument()
      expect(other.ui.getByRole('button', { name: /next turn|finish/i })).toBeInTheDocument()
    }

    // Player 2 (guest) reads English and finishes the round.
    expect(english).toContain(sentenceOn(guest))
    await user.click(guest.ui.getByRole('button', { name: 'Finish round' }))
    await host.ui.findByRole('heading', { name: 'Round complete' })
    await guest.ui.findByRole('heading', { name: 'Round complete' })
    expect(guest.ui.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument()
    expect(guest.ui.getByText(/waiting for the host to start another round/i)).toBeInTheDocument()

    await user.click(host.ui.getByRole('button', { name: 'Play again' }))
    await startRound(host, guest)
    await host.ui.findByText('Turn 1 of 4')
    await guest.ui.findByText('Turn 1 of 4')
  })

  it('lets only the host go back to earlier sentences, during the round and after it', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)
    await host.ui.findByText('Turn 1 of 4')
    const first = sentenceOn(host)
    const previous = { name: 'Previous sentence' }
    expect(host.ui.queryByRole('button', previous)).not.toBeInTheDocument()

    await user.click(host.ui.getByRole('button', { name: 'Next turn' }))
    await guest.ui.findByText('Turn 2 of 4')
    expect(guest.ui.queryByRole('button', previous)).not.toBeInTheDocument()

    // The host goes back although it is now the guest's turn; both devices show the first sentence again.
    await user.click(host.ui.getByRole('button', previous))
    await host.ui.findByText('Turn 1 of 4')
    await guest.ui.findByText('Turn 1 of 4')
    expect(sentenceOn(host)).toBe(first)
    expect(sentenceOn(guest)).toBe(first)

    // Play on to the end, then step back from "Round complete".
    for (const mover of [host, guest, host]) {
      await user.click(await mover.ui.findByRole('button', { name: 'Next turn' }))
    }
    await user.click(await guest.ui.findByRole('button', { name: 'Finish round' }))
    await host.ui.findByRole('heading', { name: 'Round complete' })
    await user.click(host.ui.getByRole('button', previous))
    await host.ui.findByText('Turn 4 of 4')
    await guest.ui.findByText('Turn 4 of 4')
    expect(guest.ui.queryByRole('button', previous)).not.toBeInTheDocument()
  })

  it('lets the host go back to choose another topic', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user, undefined, { topic: 'Weather' })
    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)
    await guest.ui.findByText('Turn 1 of 4')

    await user.click(host.ui.getByRole('button', { name: 'Change topic' }))
    await host.ui.findByRole('button', { name: 'Greetings and small talk' })
    await guest.ui.findByText(/waiting for the host to choose a topic/i)
  })

  it('says AI is not available, and keeps the guest waiting, in a build without it', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user, null)
    const guest = await joinGame(network, user, host.code)

    expect(await host.ui.findByRole('alert')).toHaveTextContent(/AI sentences aren't available/i)
    expect(host.ui.queryByRole('button', { name: 'Greetings and small talk' })).not.toBeInTheDocument()
    // The host did choose a topic, so the guest is told the sentences could not be written, not that the host has to choose.
    expect(await guest.ui.findByRole('alert')).toHaveTextContent(/can't be reached/i)
    expect(guest.ui.queryByText(/waiting for the host to choose a topic/i)).not.toBeInTheDocument()
  })
})

describe('invite links', () => {
  it('shows the host a link that carries the game code', async () => {
    const user = userEvent.setup()
    const host = await createGame(createMemoryNetwork(), user)
    expect(host.ui.getByLabelText('Invite link')).toHaveDisplayValue(new RegExp(`\\?join=${host.code}$`))
    expect(host.ui.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument()
  })

  it('joins straight away when opened with a code, with nothing to choose', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)

    const view = render(<OnlineGame network={network} languages={languages} initialCode={host.code} />)
    const guest = within(view.container)
    await guest.findByText(/^Turn 1 of/)
    expect(guest.queryByLabelText('I speak')).not.toBeInTheDocument()
  })

  it('starts on the menu when there is no code', () => {
    saveHostDefaults(SAVED_DEFAULTS)
    const view = render(<OnlineGame network={createMemoryNetwork()} languages={languages} />)
    expect(within(view.container).getByRole('button', { name: '2 players' })).toBeInTheDocument()
  })
})

describe('joining', () => {
  it('starts the round on both devices as soon as the guest joins, with no language to choose', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    expect(host.ui.getByLabelText('Invite link')).toBeInTheDocument()

    const guest = await startJoining(network, user, host.code)
    await startRound(host, guest)
    expect(host.ui.queryByLabelText('Invite link')).not.toBeInTheDocument()
    expect(guest.ui.queryByLabelText('I speak')).not.toBeInTheDocument()
  })

  it("gives the guest the language the host is learning, and the host's own to practise", async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    const guest = await joinGame(network, user, host.code)

    await guest.ui.findByText('You are learning German')
    expect(guest.ui.getByText('Your partner is learning English')).toBeInTheDocument()
  })
})

describe('progress steps', () => {
  it('move from Connect to Sentences to Play on both devices', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    // The sentences are held back until the test lets them through, so the middle step can be looked at.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { generator: instant } = instantGenerator()
    const host = await createGame(network, user, { generate: async (request, signal) => (await gate, instant.generate(request, signal)) })
    expect(currentStep(host)).toBe('Connect')

    const guest = await startJoining(network, user, host.code)
    await host.ui.findByRole('heading', { name: 'Getting your sentences ready' })
    await guest.ui.findByRole('heading', { name: 'Getting your sentences ready' })
    expect(currentStep(host)).toBe('Sentences')
    expect(currentStep(guest)).toBe('Sentences')
    release()

    await startRound(host, guest)
    await guest.ui.findByText('Turn 1 of 4')
    expect(currentStep(host)).toBe('Play')
    expect(currentStep(guest)).toBe('Play')
  })
})

describe('joining a game that is not there, or is full', () => {
  it('says so when there is no game with that code', async () => {
    const user = userEvent.setup()
    const guest = await startJoining(createMemoryNetwork(), user, '999999')
    expect(await guest.ui.findByRole('alert')).toHaveTextContent(/couldn't find a game with that code/i)

    await user.click(guest.ui.getByRole('button', { name: 'Enter a different code' }))
    expect(guest.ui.getByLabelText('Game code')).toBeInTheDocument()
  })

  it('lets the partner back in on a new connection before the host noticed the old one die', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)

    const returning = await startJoining(network, user, host.code)
    await returning.ui.findByText('Turn 1 of 4')
    expect(await guest.ui.findByRole('alert')).toHaveTextContent(/connection .* lost/i)
    expect(host.ui.getByText('Turn 1 of 4')).toBeInTheDocument()
    expect(host.ui.queryByText(/partner is disconnected/i)).not.toBeInTheDocument()
  })
})

describe('connection problems', () => {
  it('reports that the game service cannot be reached when creating a game', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    network.unavailable = true
    const device = open(network)
    await user.click(device.ui.getByRole('button', { name: '2 players' }))
    await user.click(device.ui.getByRole('button', { name: 'Create a game' }))
    await chooseTopic(device, user)
    await user.click(device.ui.getByRole('button', { name: 'Create game' }))

    expect(await device.ui.findByRole('alert')).toHaveTextContent(/couldn't (open|reach)/i)
  })

  it('lets a partner who dropped rejoin and pick up where the game was', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)
    await user.click(await host.ui.findByRole('button', { name: 'Next turn' }))
    await guest.ui.findByText('Turn 2 of 4')

    guest.unmount()
    expect(await host.ui.findByText(/partner is disconnected/i)).toBeInTheDocument()

    const returning = await startJoining(network, user, host.code)
    await returning.ui.findByText('Turn 2 of 4')
    expect(returning.ui.getByRole('button', { name: 'Next turn' })).toBeInTheDocument()
    await waitFor(() => expect(host.ui.queryByText(/partner is disconnected/i)).not.toBeInTheDocument())
  })

  it('tells the host they can end the round when the partner dropped mid-round, and lets them', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)
    await user.click(await host.ui.findByRole('button', { name: 'Next turn' }))
    await guest.ui.findByText('Turn 2 of 4')

    guest.unmount()
    expect(await host.ui.findByText(/partner is disconnected.*end this round with Change topic/i)).toBeInTheDocument()

    await user.click(host.ui.getByRole('button', { name: 'Change topic' }))
    expect(await host.ui.findByLabelText('Or enter your own topic')).toBeInTheDocument()
  })

  it('tells the guest when the host leaves', async () => {
    const user = userEvent.setup()
    const network = createMemoryNetwork()
    const host = await createGame(network, user)
    const guest = await joinGame(network, user, host.code)
    await startRound(host, guest)

    await user.click(host.ui.getByRole('button', { name: 'Leave game' }))
    expect(host.ui.getByRole('button', { name: 'Create a game' })).toBeInTheDocument()
    expect(await guest.ui.findByRole('alert')).toHaveTextContent(/connection .* lost/i)
  })
})
