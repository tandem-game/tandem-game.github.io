import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ROUND_OPTIONS, type RoundOptions } from '../generation/types'
import type { Topic } from '../content/types'
import { TopicPicker } from './TopicPicker'

const topics: Topic[] = [
  { id: 'greetings', name: 'Greetings and small talk' },
  { id: 'weather', name: 'Weather' },
]

function setup(props: { topics?: Topic[]; options?: RoundOptions } = {}) {
  const onSelect = vi.fn()
  const onOptionsChange = vi.fn()
  const user = userEvent.setup()
  render(
    <TopicPicker
      topics={props.topics ?? topics}
      options={props.options ?? DEFAULT_ROUND_OPTIONS}
      onOptionsChange={onOptionsChange}
      onSelect={onSelect}
    />,
  )
  return {
    user,
    onSelect,
    onOptionsChange,
    input: screen.getByLabelText('Or enter your own topic'),
    useButton: screen.getByRole('button', { name: 'Use this topic' }),
  }
}

describe('TopicPicker', () => {
  it('shows a button for each preset topic', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Greetings and small talk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weather' })).toBeInTheDocument()
  })

  it('reports the id of a preset topic when it is clicked', async () => {
    const { user, onSelect } = setup()
    await user.click(screen.getByRole('button', { name: 'Weather' }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('weather')
  })

  it('says so when there are no preset topics but still allows a custom one', async () => {
    const { user, onSelect, input } = setup({ topics: [] })
    expect(screen.getByText(/no topics/i)).toBeInTheDocument()
    await user.type(input, 'Football{Enter}')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Football')
  })

  it('disables the custom topic button while the input is blank or only spaces', async () => {
    const { user, onSelect, input, useButton } = setup()
    expect(useButton).toBeDisabled()
    await user.type(input, '   ')
    expect(useButton).toBeDisabled()
    await user.type(input, '{Enter}')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reports a trimmed custom topic', async () => {
    const { user, onSelect, input, useButton } = setup()
    await user.type(input, '  Food and drink  ')
    expect(useButton).toBeEnabled()
    await user.click(useButton)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('Food and drink')
  })

  it('limits the length of a custom topic', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('maxlength', '60')
  })

  it('shows the round options and reports a change', async () => {
    const { user, onOptionsChange } = setup({ options: { count: 2, difficulty: 'medium' } })
    await user.selectOptions(screen.getByLabelText('Difficulty'), 'hard')
    expect(onOptionsChange).toHaveBeenCalledExactlyOnceWith({ count: 2, difficulty: 'hard' })
  })
})
