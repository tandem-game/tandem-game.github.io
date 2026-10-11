import { useEffect, useRef, useState } from 'react'
import { staticSource } from '../content/staticSource'
import type { Language } from '../content/types'
import { PRACTISE_TOPIC, reshuffle } from '../favourites/practise'
import { useFavourites } from '../favourites/useFavourites'
import type { Turn } from '../game/buildTurns'
import { createGame, gameReducer, type GameState } from '../game/gameReducer'
import { topicName } from '../game/topicName'
import { useRoundSetup } from '../game/useRoundSetup'
import type { SentenceGenerator } from '../generation/generator'
import type { GenerateTopic } from '../generation/types'
import type { HostSettings } from './HostSetup'
import { StepIndicator } from './StepIndicator'
import { TopicPicker } from './TopicPicker'
import { TurnView } from './TurnView'
import { WritingSentences } from './WritingSentences'

const topicText = (topic: GenerateTopic) => (topic.kind === 'preset' ? topic.id : topic.text)

interface SoloGameProps {
  languages: Language[]
  /** What the player chose before starting; the first round's sentences are written at once. */
  settings: HostSettings
  /** Where the AI's sentences come from; without it there is nothing to play. */
  generator?: SentenceGenerator
  /** The player's own sentences to practise, in place of written ones: no AI is called, and playing again reshuffles them. */
  practise?: Turn[]
  onLeave: () => void
}

interface Round {
  topic: string
  game: GameState
}

/** One player practising alone: the same turns as the two-player game, without a partner or a network. */
export function SoloGame({ languages, settings, generator, practise, onLeave }: SoloGameProps) {
  const { topic: firstTopic, options: firstOptions } = settings
  // The player can swap the two languages between rounds without going back to Settings.
  const [{ knows, learns }, setLanguages] = useState({ knows: settings.knows, learns: settings.learns })
  const setup = useRoundSetup([{ knows, learns }, { knows, learns }], generator, {
    solo: true,
    onReady: (topic, turns) => setRound({ topic: topicText(topic), game: createGame(turns) }),
  })
  const { state: setupState, choose, back } = setup
  const [options, setOptions] = useState(firstOptions)
  const favourites = useFavourites()
  const [round, setRound] = useState<Round | null>(() => (practise ? { topic: PRACTISE_TOPIC, game: createGame(reshuffle(practise)) } : null))
  // The topics are only shown once the player has left the writing screen (or the round); the first request is made on arrival.
  const [picking, setPicking] = useState(false)
  const toTopics = () => {
    back()
    setPicking(true)
  }

  const startFirstRound = useRef(() => {})
  useEffect(() => {
    startFirstRound.current = () => {
      if (!practise) choose(firstTopic, firstOptions)
    }
  })
  useEffect(() => startFirstRound.current(), [])

  const nameOf = (code: string) => languages.find((language) => language.code === code)?.name ?? code

  function renderBody() {
    if (generator === undefined && !practise) {
      return (
        <p className="card" role="alert">
          AI sentences aren't available in this version of the game, so there is nothing to play yet.
        </p>
      )
    }

    if (round !== null) {
      return (
        <>
          <p className="topic">Topic: {topicName(staticSource, round.topic)}</p>
          <TurnView
            game={round.game}
            languages={languages}
            canAct
            favourites={favourites}
            favouriteContext={{ topic: round.topic, difficulty: options.difficulty }}
            onNext={() => setRound({ ...round, game: gameReducer(round.game, { type: 'NEXT_TURN' }) })}
            onReveal={() => setRound({ ...round, game: gameReducer(round.game, { type: 'REVEAL' }) })}
            onPrevious={() => setRound({ ...round, game: gameReducer(round.game, { type: 'PREVIOUS_TURN' }) })}
            onPlayAgain={() => {
              if (practise) return setRound({ topic: PRACTISE_TOPIC, game: createGame(reshuffle(practise)) })
              // New sentences for the same topic, rather than the same ones.
              setRound(null)
              choose(round.topic, options, true)
            }}
          />
        </>
      )
    }

    if (setupState.phase === 'writing') {
      const { topic, busy, error } = setupState
      return (
        <WritingSentences
          writing={{ busy, error }}
          topicLabel={topicName(staticSource, topicText(topic))}
          onRetry={setup.retry}
          onBack={toTopics}
        />
      )
    }

    if (!picking) return null
    return (
      <>
        <button type="button" onClick={() => setLanguages({ knows: learns, learns: knows })}>
          Swap languages
        </button>
        <TopicPicker
          topics={staticSource.getTopics()}
          options={options}
          onOptionsChange={setOptions}
          onSelect={(topic) => choose(topic, options)}
          solo
        />
      </>
    )
  }

  return (
    <>
      <StepIndicator current={round === null ? 1 : 2} steps={['Sentences', 'Play']} />
      <ul className="players">
        <li data-player="1">You are learning {nameOf(learns)}</li>
      </ul>
      {renderBody()}
      <div className="actions">
        {round !== null && !practise && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRound(null)
              toTopics()
            }}
          >
            Change topic
          </button>
        )}
        <button type="button" className="secondary" onClick={onLeave}>
          Leave
        </button>
      </div>
    </>
  )
}
