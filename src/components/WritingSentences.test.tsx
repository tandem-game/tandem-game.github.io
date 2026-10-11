import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerationErrorKind } from '../generation/types'
import { SLOW_AFTER_MS } from './Waiting'
import { WritingSentences } from './WritingSentences'


afterEach(() => vi.useRealTimers())

describe('WritingSentences', () => {
  it('says what topic the sentences are for, and that they are being written', () => {
    render(<WritingSentences writing={{ busy: true, error: null }} topicLabel="Weather" />)
    expect(screen.getByRole('heading', { name: 'Getting your sentences ready' })).toBeInTheDocument()
    expect(screen.getByText('Topic: Weather')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Generating sentences…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has nothing to confirm or review', () => {
    render(<WritingSentences writing={{ busy: true, error: null }} topicLabel="Weather" />)
    expect(screen.queryByRole('button', { name: /looks good|regenerate/i })).not.toBeInTheDocument()
  })

  it('offers a guest no buttons, however it goes', () => {
    render(<WritingSentences writing={{ busy: true, error: null }} topicLabel="Weather" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    render(<WritingSentences writing={{ busy: false, error: 'invalid' }} topicLabel="Weather" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets the host cancel while it works, and not try again yet', async () => {
    const onRetry = vi.fn()
    const onBack = vi.fn()
    render(<WritingSentences writing={{ busy: true, error: null }} topicLabel="Weather" onRetry={onRetry} onBack={onBack} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it.each<[GenerationErrorKind, RegExp]>([
    ['unavailable', /can't be reached/],
    ['limit-reached', /allowance is used up for today. It resets at/],
    ['invalid', /didn't give usable sentences/],
  ])('tells the host about %s, and lets them try again or choose another topic', async (error, message) => {
    const onRetry = vi.fn()
    const onBack = vi.fn()
    render(<WritingSentences writing={{ busy: false, error }} topicLabel="Weather" onRetry={onRetry} onBack={onBack} />)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).toHaveTextContent('Try again or choose another topic.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await user.click(screen.getByRole('button', { name: 'Choose another topic' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('tells the guest to wait for the host after a failure', () => {
    render(<WritingSentences writing={{ busy: false, error: 'unavailable' }} topicLabel="Weather" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Wait for the host to try again or choose another topic.')
  })

  it('says it is taking longer than usual, and only the host is told they can cancel', () => {
    vi.useFakeTimers()
    const { unmount } = render(<WritingSentences writing={{ busy: true, error: null }} topicLabel="Weather" onBack={vi.fn()} />)
    act(() => vi.advanceTimersByTime(SLOW_AFTER_MS))
    expect(screen.getByText(/taking longer than usual. You can wait, or cancel and try again./)).toBeInTheDocument()
    unmount()

    render(<WritingSentences writing={{ busy: true, error: null }} topicLabel="Weather" />)
    act(() => vi.advanceTimersByTime(SLOW_AFTER_MS))
    expect(screen.getByText('The AI is taking longer than usual.')).toBeInTheDocument()
  })
})
