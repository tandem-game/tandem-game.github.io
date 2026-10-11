import { useEffect, useMemo, useRef, useState } from 'react'
import { staticSource } from '../content/staticSource'
import type { Language, PlayerLanguages, Players } from '../content/types'
import type { SentenceGenerator } from '../generation/generator'
import type { GenerateTopic, RoundOptions } from '../generation/types'
import { learningPair } from '../game/learningPair'
import { topicName } from '../game/topicName'
import { useRoundSetup } from '../game/useRoundSetup'
import type { Network } from '../online/network'
import { useHostSession } from '../online/useHostSession'
import { buildInviteUrl } from '../online/inviteLink'
import { InviteLink } from './InviteLink'
import { PlayerChips } from './PlayerChips'
import { Spinner } from './Spinner'
import { StepIndicator } from './StepIndicator'
import { TopicPicker } from './TopicPicker'
import { TurnView } from './TurnView'
import { Waiting } from './Waiting'
import { WritingSentences } from './WritingSentences'

/** The topic as the rest of the game knows it: a preset's id or the text the host typed. */
const topicText = (topic: GenerateTopic) => (topic.kind === 'preset' ? topic.id : topic.text)

interface HostRoomProps {
  network: Network
  languages: Language[]
  /** What the host reads and translates into; the guest's languages are decided once they have joined. */
  host: PlayerLanguages
  /** The topic and options the host set before the game was opened; its sentences are written once the partner is in. */
  firstRound: { topic: string; options: RoundOptions }
  /** Where the AI's sentences come from; without it there is nothing to play. */
  generator?: SentenceGenerator
  onLeave: () => void
}

/** The device that created the game: it is Player 1 and runs the game for both. */
export function HostRoom({ network, languages, host, firstRound, generator, onLeave }: HostRoomProps) {
  const { status, code, room, partnerConnected, dispatch } = useHostSession(network, host, firstRound.topic, generator !== undefined)
  const { round } = room
  const players = useMemo((): Players | null => (room.guest === null ? null : [room.host, room.guest]), [room.host, room.guest])
  const pair = players === null ? null : learningPair(players)
  const setup = useRoundSetup(players, generator, {
    onReady: (topic, turns) => dispatch({ type: 'START_ROUND', topic: topicText(topic), turns }),
  })
  const { state: setupState, back: backToTopics } = setup
  const [options, setOptions] = useState(firstRound.options)
  const step = pair === null ? 1 : round === null ? 2 : 3

  // Once the partner has joined, the sentences can be written: the host already chose what for.
  const startFirstRound = useRef(() => {})
  useEffect(() => {
    startFirstRound.current = () => setup.choose(firstRound.topic, firstRound.options)
  })
  const partnerJoined = pair !== null
  useEffect(() => {
    if (partnerJoined) startFirstRound.current()
  }, [partnerJoined])

  // The guest sees what is happening to the sentences, so the room carries a copy of it.
  // Until the first request has begun, the room's starting state (see `createRoom`) stays.
  const firstWritingPending = useRef(true)
  useEffect(() => {
    if (setupState.phase === 'writing') {
      firstWritingPending.current = false
      const { topic, busy, error } = setupState
      dispatch({ type: 'WRITING_UPDATED', topic: topicText(topic), busy, error })
    } else if (!firstWritingPending.current) {
      dispatch({ type: 'WRITING_CLOSED' })
    }
  }, [setupState, dispatch])

  function renderBody() {
    if (status === 'opening') {
      return (
        <Waiting
          slow="This is taking longer than usual. Check your internet connection."
          actions={
            <button type="button" onClick={onLeave}>
              Go back
            </button>
          }
        >
          Setting up your game…
        </Waiting>
      )
    }
    if (status === 'error') {
      return (
        <p className="card" role="alert">
          We couldn't open a game. Check your internet connection and try again.
        </p>
      )
    }
    if (pair === null) {
      return (
        <section className="card">
          <h2>Invite your partner</h2>
          <p>Send your partner this link, or ask them to choose “Join a game” and enter this code:</p>
          <p className="room-code">{code}</p>
          {code !== null && <InviteLink url={buildInviteUrl(code, window.location.href)} />}
          <p className="status-line" role="status">
            <Spinner /> Waiting for your partner to join…
          </p>
        </section>
      )
    }
    if (round === null) {
      if (setupState.phase === 'writing') {
        const { topic, busy, error } = setupState
        return (
          <>
            <PlayerChips pair={pair} languages={languages} me={1} />
            <WritingSentences
              writing={{ busy, error }}
              topicLabel={topicName(staticSource, topicText(topic))}
              onRetry={setup.retry}
              onBack={backToTopics}
            />
          </>
        )
      }
      return (
        <>
          <PlayerChips pair={pair} languages={languages} me={1} />
          {generator === undefined ? (
            <p className="card" role="alert">
              AI sentences aren't available in this version of the game, so there is nothing to play yet.
            </p>
          ) : (
            <TopicPicker
              topics={staticSource.getTopics()}
              options={options}
              onOptionsChange={setOptions}
              onSelect={(topic) => setup.choose(topic, options)}
            />
          )}
        </>
      )
    }

    const { game } = round
    const myTurn = game.status === 'playing' && game.turns[game.index].player === 1
    return (
      <>
        <PlayerChips pair={pair} languages={languages} me={1} />
        <p className="topic">Topic: {topicName(staticSource, round.topic)}</p>
        <TurnView
          game={game}
          languages={languages}
          canAct={myTurn}
          onNext={() => dispatch({ type: 'NEXT_TURN', from: 1 })}
          onReveal={() => dispatch({ type: 'REVEAL', from: 1 })}
          onPrevious={() => dispatch({ type: 'PREVIOUS_TURN' })}
          onPlayAgain={() => {
            // New sentences for the same topic, rather than the same ones.
            dispatch({ type: 'CHANGE_TOPIC' })
            setup.choose(round.topic, options, true)
          }}
        />
      </>
    )
  }

  return (
    <>
      <StepIndicator current={step} />
      {pair !== null && !partnerConnected && (
        <p className="notice" role="status">
          Your partner is disconnected. They can rejoin with the code {code}
          {round !== null ? ', or you can end this round with Change topic.' : '.'}
        </p>
      )}
      {renderBody()}
      <div className="actions">
        {round !== null && (
          <button type="button" className="secondary" onClick={() => dispatch({ type: 'CHANGE_TOPIC' })}>
            Change topic
          </button>
        )}
        <button type="button" className="secondary" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </>
  )
}
