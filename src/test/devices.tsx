import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { staticSource } from '../content/staticSource'
import type { Language } from '../content/types'
import type { SentenceGenerator } from '../generation/generator'
import { saveHostDefaults, type HostDefaults } from '../game/hostPreferences'
import { DEFAULT_ROUND_OPTIONS, type Difficulty } from '../generation/types'
import { OnlineGame } from '../components/OnlineGame'
import { instantGenerator } from './generators'
import type { MemoryNetwork } from './memoryNetwork'

export const languages: Language[] = staticSource.getLanguages()

export type User = ReturnType<typeof userEvent.setup>

/** What the host has saved on a device unless a test says otherwise: speaking German, learning English. */
export const SAVED_DEFAULTS: HostDefaults = { knows: 'de', learns: 'en', options: DEFAULT_ROUND_OPTIONS }

/** Shows a device. It starts with `saved` settings in the browser, so the settings are not asked first; `null` is a first visit. */
export function open(network: MemoryNetwork, generator?: SentenceGenerator, saved: HostDefaults | null = SAVED_DEFAULTS) {
  if (saved) saveHostDefaults(saved)
  const view = render(<OnlineGame network={network} languages={languages} generator={generator} />)
  return { ...view, ui: within(view.container) }
}

/** The label of the step the screen says we are on. */
export const currentStep = (device: { container: HTMLElement }) =>
  device.container.querySelector('[aria-current="step"]')?.textContent

/** What the host sets for a game. A preset topic is picked by its name. */
export interface HostChoices {
  topic?: string
  /** Typed instead of picking a preset. */
  customTopic?: string
  /** These two are the host's saved settings. */
  count?: number
  difficulty?: Difficulty
}

/** Picks the topic on the "Create a game" screen, which shows the saved settings. */
export async function chooseTopic(device: ReturnType<typeof open>, user: User, choices: HostChoices = {}) {
  if (choices.customTopic !== undefined) {
    await user.type(device.ui.getByLabelText('Or enter your own topic'), choices.customTopic)
  } else {
    await user.click(device.ui.getByRole('button', { name: choices.topic ?? 'Greetings and small talk' }))
  }
}

/**
 * A device that creates a game, speaking German and learning English unless `languages` says otherwise, with the topic
 * and options in `choices` (a preset topic and the default options unless said otherwise). Resolves once the code is shown.
 * It gets a generator that answers at once; pass `null` for a build without AI.
 */
export async function createGame(
  network: MemoryNetwork,
  user: User,
  generator: SentenceGenerator | null = instantGenerator().generator,
  choices: HostChoices = {},
  languages: Pick<HostDefaults, 'knows' | 'learns'> = SAVED_DEFAULTS,
) {
  const { count, difficulty } = choices
  const options = {
    count: count ?? DEFAULT_ROUND_OPTIONS.count,
    difficulty: difficulty ?? DEFAULT_ROUND_OPTIONS.difficulty,
  }
  const device = open(network, generator ?? undefined, { ...languages, options })
  await user.click(device.ui.getByRole('button', { name: '2 players' }))
  await user.click(device.ui.getByRole('button', { name: 'Create a game' }))
  await chooseTopic(device, user, choices)
  await user.click(device.ui.getByRole('button', { name: 'Create game' }))
  const code = (await device.ui.findByText(/^[0-9]{6}$/)).textContent ?? ''
  return { ...device, code }
}

/** What a guest has saved unless a test says otherwise: speaking English, learning German, so they and the default host learn each other's language. */
export const GUEST_DEFAULTS: HostDefaults = { ...SAVED_DEFAULTS, knows: 'en', learns: 'de' }

export async function startJoining(network: MemoryNetwork, user: User, code: string, saved: HostDefaults | null = GUEST_DEFAULTS) {
  const device = open(network, undefined, saved)
  await user.click(device.ui.getByRole('button', { name: '2 players' }))
  await user.click(device.ui.getByRole('button', { name: 'Join a game' }))
  await user.type(device.ui.getByLabelText('Game code'), code)
  await user.click(device.ui.getByRole('button', { name: 'Join game' }))
  return device
}

/** A device that joins, ending on the "waiting for the host" screen. It learns German, because the host learns English. */
export const joinGame = startJoining

export const sentenceOn = (device: { container: HTMLElement }) =>
  device.container.querySelector('.sentence')?.textContent

/** Both devices are on the first turn: the sentences were written and the round started by itself. */
export async function startRound(host: ReturnType<typeof open>, guest: ReturnType<typeof open>) {
  await host.ui.findByText(/^Turn 1 of/)
  await guest.ui.findByText(/^Turn 1 of/)
}
