import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Tutorial } from './Tutorial'

function setup(replay = false) {
  const onDone = vi.fn()
  render(<Tutorial onDone={onDone} replay={replay} />)
  return { user: userEvent.setup(), onDone }
}

describe('Tutorial', () => {
  it('starts with a welcome and nothing to go back to', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Welcome to Tandem Game' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('walks to the last step and back', async () => {
    const { user, onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'On your own or with a partner' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Welcome to Tandem Game' })).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('ends on the settings, with no way to skip what is already the last step', async () => {
    const { user, onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Choose my languages' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('can be skipped from the first step', async () => {
    const { user, onDone } = setup()
    await user.click(screen.getByRole('button', { name: 'Skip tutorial' }))
    expect(onDone).toHaveBeenCalledOnce()
  })

  describe('opened again from the start screen', () => {
    it('ends with Done, and says nothing about choosing languages next', async () => {
      const { user, onDone } = setup(true)
      await user.click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.queryByText(/Next you pick the languages/)).not.toBeInTheDocument()
      expect(screen.getByText(/Your languages are saved in this browser/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Choose my languages' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Done' }))
      expect(onDone).toHaveBeenCalledOnce()
    })

    it('can be left from the first step', async () => {
      const { user, onDone } = setup(true)
      expect(screen.queryByRole('button', { name: 'Skip tutorial' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Back to the start' }))
      expect(onDone).toHaveBeenCalledOnce()
    })
  })
})
