import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { staticSource } from '../content/staticSource'
import { DEFAULT_ROUND_OPTIONS } from '../generation/types'
import { SettingsForm } from './SettingsForm'

const languages = staticSource.getLanguages()

type Props = React.ComponentProps<typeof SettingsForm>

function setup(defaults = null as Props['defaults'], withBack = true, flags: Pick<Props, 'missing' | 'fresh'> = {}) {
  const onSave = vi.fn()
  const onBack = vi.fn()
  const user = userEvent.setup()
  render(<SettingsForm languages={languages} defaults={defaults} {...flags} onSave={onSave} onBack={withBack ? onBack : undefined} />)
  return { user, onSave, onBack }
}

describe('SettingsForm', () => {
  it('needs both languages before it saves', async () => {
    const { user, onSave } = setup()
    const save = screen.getByRole('button', { name: 'Save settings' })
    expect(save).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('I speak'), 'en')
    expect(save).toBeDisabled()
    await user.selectOptions(screen.getByLabelText("I'm learning"), 'de')
    await user.click(save)
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ knows: 'en', learns: 'de', options: DEFAULT_ROUND_OPTIONS })
  })

  it('cannot learn the language it speaks, and clears a learning choice that the speaking choice now clashes with', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('I speak'), 'en')
    const learning = screen.getByLabelText("I'm learning")
    expect(within(learning).queryByRole('option', { name: 'English' })).not.toBeInTheDocument()
    await user.selectOptions(learning, 'de')

    await user.selectOptions(screen.getByLabelText('I speak'), 'de')
    expect(screen.getByLabelText("I'm learning")).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  })

  it('starts from what is saved and saves the changes', async () => {
    const { user, onSave } = setup({ knows: 'de', learns: 'en', options: { count: 3, difficulty: 'A2' } })
    expect(screen.getByLabelText('I speak')).toHaveValue('de')
    expect(screen.getByLabelText("I'm learning")).toHaveValue('en')
    expect(screen.getByLabelText('Sentences per player')).toHaveValue('3')
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'B2')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      knows: 'de',
      learns: 'en',
      options: { count: 3, difficulty: 'B2' },
    })
  })

  it('says in one sentence what the chosen languages mean', async () => {
    const { user } = setup()
    expect(screen.queryByText(/You will read sentences/)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('I speak'), 'de')
    await user.selectOptions(screen.getByLabelText("I'm learning"), 'en')
    expect(screen.getByRole('status')).toHaveTextContent('You will read sentences in German and say them aloud in English.')
  })

  it('explains every setting', () => {
    setup()
    expect(screen.getByLabelText('I speak')).toHaveAccessibleDescription(/your sentences are written in/i)
    expect(screen.getByLabelText("I'm learning")).toHaveAccessibleDescription(/learn the language your partner speaks/i)
    expect(screen.getByLabelText('Sentences per player')).toHaveAccessibleDescription(/reads aloud in a round/i)
    expect(screen.getByLabelText('Difficulty')).toHaveAccessibleDescription(/A1 – Beginner: .*A2 – Easy: .*B1 – Medium: .*B2 – Hard: .*C1 – Advanced: .*C2 – Proficient: /)
  })

  it('goes back without saving, when there is somewhere to go back to', async () => {
    const { user, onSave, onBack } = setup()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('has no Back button when there is nowhere to go back to', () => {
    setup(null, false)
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })
})

describe('SettingsForm highlights', () => {
  const saved = { knows: 'de', learns: 'en', options: { count: 3, difficulty: 'A2' } } as const
  const field = (label: string) => screen.getByLabelText(label).closest('.field')

  it('points out both languages when neither is set, and says why Save is off', () => {
    setup()
    for (const label of ['I speak', "I'm learning"]) {
      expect(screen.getByLabelText(label)).toBeInvalid()
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(/Choose a language to continue/)
      expect(field(label)).toHaveAttribute('data-flag', 'missing')
    }
    expect(screen.getByRole('button', { name: 'Save settings' })).toHaveAccessibleDescription(
      "To save, choose the language you speak and the language you're learning.",
    )
  })

  it('points out only the language that is unset, and stops once it is chosen', async () => {
    const { user } = setup({ ...saved, learns: '' }, false, { missing: ['learns'] })
    expect(screen.getByLabelText('I speak')).toBeValid()
    expect(field('I speak')).not.toHaveAttribute('data-flag')
    expect(screen.getByLabelText("I'm learning")).toBeInvalid()
    expect(screen.getByRole('button', { name: 'Save settings' })).toHaveAccessibleDescription("To save, choose the language you're learning.")

    await user.selectOptions(screen.getByLabelText("I'm learning"), 'en')
    expect(screen.getByLabelText("I'm learning")).toBeValid()
    expect(field("I'm learning")).not.toHaveAttribute('data-flag')
    expect(screen.getByRole('button', { name: 'Save settings' })).not.toHaveAccessibleDescription()
  })

  it('points out a language again when choosing the other one clears it', async () => {
    const { user } = setup(saved)
    expect(screen.getByLabelText("I'm learning")).toBeValid()
    await user.selectOptions(screen.getByLabelText('I speak'), 'en')
    expect(screen.getByLabelText("I'm learning")).toBeInvalid()
  })

  it('highlights nothing, and says nothing, when everything is set', () => {
    setup(saved)
    expect(document.querySelector('[data-flag]')).toBeNull()
    expect(screen.queryByText(/need your attention/)).not.toBeInTheDocument()
  })

  it('tells the player something needs their attention, once, at the top', () => {
    setup({ ...saved, learns: '' }, false, { missing: ['learns'] })
    expect(screen.getAllByText(/Some settings need your attention before you play/)).toHaveLength(1)
  })

  it('marks a new setting, keeps its value, and stops marking it once the player changes it', async () => {
    const { user, onSave } = setup(saved, false, { fresh: ['count'] })
    expect(field('Sentences per player')).toHaveAttribute('data-flag', 'new')
    expect(screen.getByLabelText('Sentences per player')).toHaveAccessibleDescription(/New setting\. Check it, then save\./)
    expect(screen.getByText(/Some settings need your attention/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Sentences per player'), '4')
    expect(field('Sentences per player')).not.toHaveAttribute('data-flag')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith({ ...saved, options: { ...saved.options, count: 4 } })
  })

  it('lets a new setting be saved as it is, without touching it', async () => {
    const { user, onSave } = setup(saved, false, { fresh: ['difficulty'] })
    expect(field('Difficulty')).toHaveAttribute('data-flag', 'new')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(onSave).toHaveBeenCalledExactlyOnceWith(saved)
  })

  it('marks an option with no saved value as not set, and keeps the others unmarked', async () => {
    const { user } = setup(saved, false, { missing: ['count'] })
    expect(field('Sentences per player')).toHaveAttribute('data-flag', 'missing')
    expect(screen.getByLabelText('Sentences per player')).toHaveAccessibleDescription(/Not set yet/)
    expect(field('Difficulty')).not.toHaveAttribute('data-flag')

    await user.selectOptions(screen.getByLabelText('Sentences per player'), '4')
    expect(field('Sentences per player')).not.toHaveAttribute('data-flag')
  })
})

