import { useId } from 'react'
import { DIFFICULTIES, MAX_COUNT, MIN_COUNT, isDifficulty, type RoundOptions } from '../generation/types'
import { DIFFICULTY_HELP, DIFFICULTY_NAMES } from './difficultyText'
import { flagMessage, type Flags } from './settingFlags'

interface RoundOptionsFieldsProps {
  options: RoundOptions
  onChange: (options: RoundOptions) => void
  /** One player: the count is not per player. */
  solo?: boolean
  /** Explain each option under it. */
  withHelp?: boolean
  /** Options to highlight, because they are not set yet or are new to the player. */
  flags?: Flags
}

const COUNTS = Array.from({ length: MAX_COUNT - MIN_COUNT + 1 }, (_, i) => MIN_COUNT + i)

const COUNT_HELP = 'How many sentences each of you reads aloud in a round, from 1 to 5.'

/** The host's choices for a round: how many sentences, and how hard. */
export function RoundOptionsFields({ options, onChange, solo = false, withHelp = false, flags = {} }: RoundOptionsFieldsProps) {
  const id = useId()
  type Key = 'count' | 'difficulty'
  const describedBy = (key: Key) => [withHelp && `${id}-${key}`, flags[key] && `${id}-${key}-flag`].filter(Boolean).join(' ') || undefined
  const flagged = (key: Key) => {
    const flag = flags[key]
    return flag && <small id={`${id}-${key}-flag`} className="flag">{flagMessage(key, flag)}</small>
  }

  return (
    <fieldset className="round-options">
      <legend>Round options</legend>
      <div className="field" data-flag={flags.count}>
        <label>
          {solo ? 'Sentences' : 'Sentences per player'}
          <select
            value={options.count}
            aria-describedby={describedBy('count')}
            onChange={(e) => onChange({ ...options, count: Number(e.target.value) })}
          >
            {COUNTS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
        {withHelp && (
          <small id={`${id}-count`} className="help">
            {COUNT_HELP}
          </small>
        )}
        {flagged('count')}
      </div>
      <div className="field" data-flag={flags.difficulty}>
        <label>
          Difficulty
          <select
            value={options.difficulty}
            aria-describedby={describedBy('difficulty')}
            onChange={(e) => isDifficulty(e.target.value) && onChange({ ...options, difficulty: e.target.value })}
          >
            {DIFFICULTIES.map((level) => (
              <option key={level} value={level}>
                {DIFFICULTY_NAMES[level]}
              </option>
            ))}
          </select>
        </label>
        {withHelp && (
          <ul id={`${id}-difficulty`} className="help help-levels">
            {DIFFICULTIES.map((level) => (
              <li key={level} data-selected={level === options.difficulty || undefined}>
                <strong>{DIFFICULTY_NAMES[level]}:</strong> {DIFFICULTY_HELP[level]}
              </li>
            ))}
          </ul>
        )}
        {flagged('difficulty')}
      </div>
    </fieldset>
  )
}
