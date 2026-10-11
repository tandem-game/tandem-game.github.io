import { useState } from 'react'
import type { Language, LanguageCode, Topic } from '../content/types'
import type { HostDefaults } from '../game/hostPreferences'
import type { RoundOptions } from '../generation/types'
import { DIFFICULTY_NAMES } from './difficultyText'
import { TopicChoice } from './TopicChoice'

/** What the host decides before the invite link exists. */
export interface HostSettings {
  knows: LanguageCode
  learns: LanguageCode
  /** A preset topic's id, or the text the host typed. */
  topic: string
  options: RoundOptions
}

interface HostSetupProps {
  languages: Language[]
  topics: Topic[]
  /** The host's saved settings, shown here and used for the game. */
  defaults: HostDefaults
  /** The topic of the host's last game, chosen to begin with. */
  lastTopic: string | null
  onCreate: (settings: HostSettings) => void
  /** Opens the settings to change them. */
  onEdit: () => void
  onBack: () => void
  /** Practising alone: nothing is hosted, and translations are always on. */
  solo?: boolean
}

/** The host's saved settings as a summary to check, and the topic, which is chosen for every game. */
export function HostSetup({ languages, topics, defaults, lastTopic, onCreate, onEdit, onBack, solo = false }: HostSetupProps) {
  const [topic, setTopic] = useState<string | null>(lastTopic)
  const { knows, learns, options } = defaults
  const nameOf = (code: LanguageCode) => languages.find((language) => language.code === code)?.name ?? code

  const rows: [string, string][] = [
    ['I speak', nameOf(knows)],
    ["I'm learning", nameOf(learns)],
    [solo ? 'Sentences' : 'Sentences per player', String(options.count)],
    ['Difficulty', DIFFICULTY_NAMES[options.difficulty]],
  ]

  return (
    <section className="card">
      <h2>{solo ? 'Practise on your own' : 'Create a game'}</h2>
      <dl className="settings-summary">
        {rows.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onEdit}>
        Edit settings
      </button>
      <TopicChoice topics={topics} initial={topic} onChange={setTopic} />
      {topic === null && <p className="hint">Choose a topic to {solo ? 'start' : 'create the game'}.</p>}
      <button
        type="button"
        className="primary"
        disabled={topic === null}
        onClick={() => topic !== null && onCreate({ knows, learns, topic, options })}
      >
        {solo ? 'Start' : 'Create game'}
      </button>
      <button type="button" className="secondary" onClick={onBack}>
        Back
      </button>
    </section>
  )
}
