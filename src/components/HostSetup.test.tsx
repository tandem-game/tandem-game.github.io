import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { staticSource } from '../content/staticSource'
import type { HostDefaults } from '../game/hostPreferences'
import { HostSetup } from './HostSetup'

const languages = staticSource.getLanguages()
const topics = [
  { id: 'greetings', name: 'Greetings and small talk' },
  { id: 'weather', name: 'Weather' },
]
const defaults: HostDefaults = { knows: 'de', learns: 'en', options: { count: 4, difficulty: 'B2' } }

function setup(props: { lastTopic?: string | null; solo?: boolean; defaults?: HostDefaults } = {}) {
  const onCreate = vi.fn()
  const onEdit = vi.fn()
  const onBack = vi.fn()
  const user = userEvent.setup()
  render(
    <HostSetup
      languages={languages}
      topics={topics}
      defaults={props.defaults ?? defaults}
      lastTopic={props.lastTopic === undefined ? 'weather' : props.lastTopic}
      onCreate={onCreate}
      onEdit={onEdit}
      onBack={onBack}
      solo={props.solo}
    />,
  )
  return { user, onCreate, onEdit, onBack, create: screen.getByRole('button', { name: props.solo ? 'Start' : 'Create game' }) }
}

describe('HostSetup', () => {
  it('summarises the saved settings', () => {
    setup()
    const summary = screen.getByText('I speak').closest('dl')
    expect(summary).toHaveTextContent(/I speakGerman/)
    expect(summary).toHaveTextContent(/I'm learningEnglish/)
    expect(summary).toHaveTextContent(/Sentences per player4/)
    expect(summary).toHaveTextContent(/DifficultyB2 – Hard/)
    expect(summary).not.toHaveTextContent(/Translations/)
  })

  it('creates the game from the saved settings and the last topic', async () => {
    const { user, create, onCreate } = setup()
    expect(screen.getByRole('button', { name: 'Weather' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(create)
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({
      knows: 'de',
      learns: 'en',
      topic: 'weather',
      options: defaults.options,
    })
  })

  it('takes another topic for this game, preset or typed', async () => {
    const { user, create, onCreate } = setup()
    await user.click(screen.getByRole('button', { name: 'Greetings and small talk' }))
    await user.click(create)
    expect(onCreate).toHaveBeenLastCalledWith(expect.objectContaining({ topic: 'greetings' }))

    await user.type(screen.getByLabelText('Or enter your own topic'), '  my pet dragon ')
    await user.click(create)
    expect(onCreate).toHaveBeenLastCalledWith(expect.objectContaining({ topic: 'my pet dragon' }))
  })

  it('shows a typed last topic in the custom field', () => {
    setup({ lastTopic: 'my pet dragon' })
    expect(screen.getByLabelText('Or enter your own topic')).toHaveValue('my pet dragon')
  })

  it('cannot create the game without a topic, and says so', async () => {
    const { user, create, onCreate } = setup({ lastTopic: null })
    expect(create).toBeDisabled()
    expect(screen.getByText('Choose a topic to create the game.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Weather' }))
    expect(create).toBeEnabled()
    await user.clear(screen.getByLabelText('Or enter your own topic'))
    await user.click(create)
    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('treats a blank typed topic as none', async () => {
    const { user, create } = setup({ lastTopic: null })
    await user.type(screen.getByLabelText('Or enter your own topic'), '    ')
    expect(create).toBeDisabled()
  })

  it('opens the settings to edit them', async () => {
    const { user, onEdit, onCreate } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit settings' }))
    expect(onEdit).toHaveBeenCalledOnce()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('goes back', async () => {
    const { user, onBack } = setup()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('limits the length of a custom topic', () => {
    setup()
    expect(screen.getByLabelText('Or enter your own topic')).toHaveAttribute('maxlength', '60')
  })
})

describe('HostSetup for one player', () => {
  it('is about practising alone', async () => {
    const { user, create, onCreate } = setup({ solo: true })
    expect(screen.getByRole('heading', { name: 'Practise on your own' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create game' })).not.toBeInTheDocument()
    expect(screen.getByText('Sentences')).toBeInTheDocument()
    await user.click(create)
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ learns: 'en' }))
  })

  it('says what is missing in its own words', () => {
    setup({ solo: true, lastTopic: null })
    expect(screen.getByText('Choose a topic to start.')).toBeInTheDocument()
  })
})
