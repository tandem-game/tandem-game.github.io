import type { GenerationErrorKind } from '../generation/types'
import type { WritingState } from '../online/protocol'
import { allowanceResetTime } from '../generation/allowanceReset'
import { Waiting } from './Waiting'

interface WritingSentencesProps {
  writing: Pick<WritingState, 'busy' | 'error'>
  /** The readable name of the topic. */
  topicLabel: string
  /** Only the host can stop a request, ask again or go back to the topics. */
  onRetry?: () => void
  onBack?: () => void
}

const PROBLEMS: Record<GenerationErrorKind, () => string> = {
  unavailable: () => "The AI service can't be reached right now.",
  'limit-reached': () => `The free AI allowance is used up for today. It resets at ${allowanceResetTime()} your time.`,
  invalid: () => "The AI didn't give usable sentences this time.",
  cancelled: () => '',
}

/** Shown while the AI writes the sentences of a round, which then starts by itself, or after it failed to. */
export function WritingSentences({ writing, topicLabel, onRetry, onBack }: WritingSentencesProps) {
  const { busy, error } = writing

  return (
    <section className="card">
      <h2>Getting your sentences ready</h2>
      <p>Topic: {topicLabel}</p>

      {busy && (
        <Waiting slow={`The AI is taking longer than usual.${onBack ? ' You can wait, or cancel and try again.' : ''}`}>
          Generating sentences…
        </Waiting>
      )}

      {error !== null && (
        <p className="notice" role="alert">
          {PROBLEMS[error]()} {onBack ? 'Try again or choose another topic.' : 'Wait for the host to try again or choose another topic.'}
        </p>
      )}

      {!busy && onRetry && (
        <button type="button" className="primary" onClick={onRetry}>
          Try again
        </button>
      )}
      {onBack && (
        <button type="button" className="secondary" onClick={onBack}>
          {busy ? 'Cancel' : 'Choose another topic'}
        </button>
      )}
    </section>
  )
}
