import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { loadHostDefaults, loadLastTopic, saveHostDefaults, saveLastTopic } from '../game/hostPreferences'
import { OnlineGame } from './OnlineGame'
import { SAVED_DEFAULTS, languages, open } from '../test/devices'
import { instantGenerator } from '../test/generators'
import { createMemoryNetwork } from '../test/memoryNetwork'

const saved = { knows: 'de', learns: 'en', options: { count: 3, difficulty: 'hard' } } as const

describe('the first visit', () => {
  it('shows the tutorial, then asks for the settings with nothing to go back to, and saves them', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), undefined, null)
    expect(ui.getByRole('heading', { name: 'Welcome to Tandem Game' })).toBeInTheDocument()
    await user.click(ui.getByRole('button', { name: 'Skip tutorial' }))
    expect(ui.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(ui.queryByRole('button', { name: '1 player' })).not.toBeInTheDocument()
    expect(ui.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()

    await user.selectOptions(ui.getByLabelText('I speak'), 'de')
    await user.selectOptions(ui.getByLabelText("I'm learning"), 'en')
    await user.selectOptions(ui.getByLabelText('Sentences per player'), '3')
    await user.selectOptions(ui.getByLabelText('Difficulty'), 'hard')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))

    expect(loadHostDefaults()).toEqual(saved)
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
  })

  it('starts the settings from a suggestion, so a first game can begin without choosing anything', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), undefined, null)
    await user.click(ui.getByRole('button', { name: 'Skip tutorial' }))
    expect(ui.getByLabelText('I speak')).toHaveValue('en')
    expect(ui.getByLabelText("I'm learning")).toHaveValue('de')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))
    expect(loadHostDefaults()).toMatchObject({ knows: 'en', learns: 'de' })
  })

  it('does not ask again once they are saved', () => {
    const { ui } = open(createMemoryNetwork())
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
  })
})

describe('a returning player whose saved settings need a look', () => {
  const store = (value: unknown) => localStorage.setItem('tandem.hostDefaults.v2', JSON.stringify(value))
  const render_ = (initialCode?: string) => {
    const view = render(<OnlineGame network={createMemoryNetwork()} languages={languages} initialCode={initialCode} />)
    return within(view.container)
  }

  it('goes straight to the settings, not the tutorial, with what they had kept and the rest highlighted', () => {
    store({ knows: 'de', options: { count: 4, difficulty: 'hard' } })
    const ui = render_()
    expect(ui.queryByRole('heading', { name: 'Welcome to Tandem Game' })).not.toBeInTheDocument()
    expect(ui.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(ui.queryByRole('button', { name: '1 player' })).not.toBeInTheDocument()
    expect(ui.getByLabelText('I speak')).toHaveValue('de')
    expect(ui.getByLabelText('I speak')).toBeValid()
    expect(ui.getByLabelText("I'm learning")).toHaveValue('')
    expect(ui.getByLabelText("I'm learning")).toBeInvalid()
    expect(ui.getByLabelText('Sentences per player')).toHaveValue('4')
    expect(ui.getByLabelText('Difficulty')).toHaveValue('hard')
    expect(ui.getByText(/need your attention/)).toBeInTheDocument()
  })

  it('cannot play until they have saved, and then reaches the start screen with everything kept', async () => {
    const user = userEvent.setup()
    store({ knows: 'de', options: { count: 4, difficulty: 'hard' } })
    const ui = render_()
    expect(ui.getByRole('button', { name: 'Save settings' })).toBeDisabled()
    expect(ui.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()

    await user.selectOptions(ui.getByLabelText("I'm learning"), 'en')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
    expect(loadHostDefaults()).toEqual({ knows: 'de', learns: 'en', options: { count: 4, difficulty: 'hard' } })
  })

  it('is asked about an option that has no saved value, with the default shown', () => {
    store({ knows: 'de', learns: 'en', options: { difficulty: 'easy' } })
    const ui = render_()
    expect(ui.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(ui.getByLabelText('Sentences per player')).toHaveAccessibleDescription(/Not set yet/)
    expect(ui.getByLabelText('Difficulty')).toHaveValue('easy')
  })

  it('sees the same page before joining through an invite link, and joins once it is saved', async () => {
    const user = userEvent.setup()
    store({ learns: 'de', options: { count: 2, difficulty: 'medium' } })
    const ui = render_('999999')
    expect(ui.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(ui.getByLabelText("I'm learning")).toHaveValue('de')
    expect(ui.getByLabelText('I speak')).toBeInvalid()
    expect(ui.queryByRole('alert')).not.toBeInTheDocument()

    await user.selectOptions(ui.getByLabelText('I speak'), 'en')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))
    expect(await ui.findByRole('alert')).toHaveTextContent(/couldn't find a game/i) // it tried to join
  })

  it('does not interrupt a player whose settings are complete', () => {
    store({ version: 1, knows: 'de', learns: 'en', options: { count: 2, difficulty: 'medium' } })
    const ui = render_()
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
    expect(ui.queryByText(/need your attention/)).not.toBeInTheDocument()
  })
})

describe('How to play on the start screen', () => {
  it('opens the tutorial and returns to the start screen, keeping the saved settings', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(ui.getByRole('button', { name: 'How to play' }))
    expect(ui.getByRole('heading', { name: 'Welcome to Tandem Game' })).toBeInTheDocument()
    await user.click(ui.getByRole('button', { name: 'Next' }))
    await user.click(ui.getByRole('button', { name: 'Done' }))
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
    expect(loadHostDefaults()).toMatchObject({ knows: 'de', learns: 'en' })
  })

  it('can be left from the first step without reading it', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(ui.getByRole('button', { name: 'How to play' }))
    await user.click(ui.getByRole('button', { name: 'Back to the start' }))
    expect(ui.getByRole('button', { name: '2 players' })).toBeInTheDocument()
  })
})

describe('Settings on the start screen', () => {
  it('opens the saved values, can be left with Back, and saves changes', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork())
    await user.click(ui.getByRole('button', { name: 'Settings' }))
    expect(ui.getByLabelText('I speak')).toHaveValue('de')
    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()

    await user.click(ui.getByRole('button', { name: 'Settings' }))
    await user.selectOptions(ui.getByLabelText('Difficulty'), 'easy')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))
    expect(loadHostDefaults()).toEqual({ ...SAVED_DEFAULTS, options: { ...SAVED_DEFAULTS.options, difficulty: 'easy' } })
    expect(ui.getByRole('button', { name: '1 player' })).toBeInTheDocument()
  })
})

describe('creating a game from the saved settings', () => {
  it('shows a summary and starts a one-player game with the saved languages, options and topic', async () => {
    saveLastTopic('weather')
    const user = userEvent.setup()
    const { generator, asked } = instantGenerator()
    const { ui } = open(createMemoryNetwork(), generator, saved)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    expect(ui.getByText('German')).toBeInTheDocument()
    expect(ui.getByText('English')).toBeInTheDocument()
    await user.click(ui.getByRole('button', { name: 'Start' }))

    await ui.findByText(/^Turn 1 of/)
    expect(asked[0]).toMatchObject({
      language: 'de',
      count: 3,
      difficulty: 'hard',
      topic: { kind: 'preset', id: 'weather' },
    })
  })

  it('goes to the settings from Edit, and comes back to the summary with the changes', async () => {
    saveLastTopic('weather')
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), undefined, saved)
    await user.click(ui.getByRole('button', { name: '2 players' }))
    await user.click(ui.getByRole('button', { name: 'Create a game' }))
    await user.click(ui.getByRole('button', { name: 'Edit settings' }))
    expect(ui.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()

    await user.selectOptions(ui.getByLabelText('Sentences per player'), '5')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))
    expect(ui.getByRole('heading', { name: 'Create a game' })).toBeInTheDocument()
    expect(ui.getByText('5')).toBeInTheDocument()
    expect(loadHostDefaults()?.options.count).toBe(5)
    // The topic chosen before is still chosen.
    expect(ui.getByRole('button', { name: 'Weather' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('can leave Edit with Back to the summary, unchanged', async () => {
    const user = userEvent.setup()
    const { ui } = open(createMemoryNetwork(), undefined, saved)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    await user.click(ui.getByRole('button', { name: 'Edit settings' }))
    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('heading', { name: 'Practise on your own' })).toBeInTheDocument()
    expect(loadHostDefaults()).toEqual(saved)
  })

  it('remembers the topic of the last game', async () => {
    const user = userEvent.setup()
    const { generator } = instantGenerator()
    const { ui } = open(createMemoryNetwork(), generator, saved)
    await user.click(ui.getByRole('button', { name: '1 player' }))
    expect(ui.getByText('Choose a topic to start.')).toBeInTheDocument()
    await user.click(ui.getByRole('button', { name: 'Greetings and small talk' }))
    await user.click(ui.getByRole('button', { name: 'Start' }))
    await ui.findByText(/^Turn 1 of/)

    expect(loadLastTopic()).toBe('greetings')
    expect(loadHostDefaults()).toEqual(saved)
  })
})

describe('joining through an invite link', () => {
  function openInvite() {
    const view = render(<OnlineGame network={createMemoryNetwork()} languages={languages} initialCode="999999" />)
    return within(view.container)
  }

  it('joins at once for a guest who has saved settings', async () => {
    saveHostDefaults(saved)
    const ui = openInvite()
    expect(await ui.findByRole('alert')).toHaveTextContent(/couldn't find a game/i) // it tried to join
    expect(ui.queryByRole('heading', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('asks a guest without settings for them first, saves them and then joins', async () => {
    const user = userEvent.setup()
    const ui = openInvite()
    expect(ui.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(ui.queryByRole('alert')).not.toBeInTheDocument()

    await user.selectOptions(ui.getByLabelText('I speak'), 'en')
    await user.selectOptions(ui.getByLabelText("I'm learning"), 'de')
    await user.click(ui.getByRole('button', { name: 'Save settings' }))

    expect(loadHostDefaults()).toMatchObject({ knows: 'en', learns: 'de' })
    expect(await ui.findByRole('alert')).toHaveTextContent(/couldn't find a game/i) // it tried to join
  })

  it('goes back to the menu from the settings without joining', async () => {
    const user = userEvent.setup()
    const ui = openInvite()
    await user.click(ui.getByRole('button', { name: 'Back' }))
    expect(ui.getByRole('button', { name: 'Create a game' })).toBeInTheDocument()
  })
})
