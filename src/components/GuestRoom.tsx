import { staticSource } from '../content/staticSource'
import type { Language, PlayerLanguages } from '../content/types'
import { learningPair } from '../game/learningPair'
import { topicName } from '../game/topicName'
import type { Network } from '../online/network'
import { useGuestSession, type GuestSession } from '../online/useGuestSession'
import { PlayerChips } from './PlayerChips'
import { StepIndicator } from './StepIndicator'
import { TurnView } from './TurnView'
import { Waiting } from './Waiting'
import { WritingSentences } from './WritingSentences'

interface GuestRoomProps {
  network: Network
  languages: Language[]
  /** What this guest saved: the host uses it to decide what each player reads and learns. */
  saved: PlayerLanguages
  code: string
  onRetry: () => void
  onChangeCode: () => void
  onLeave: () => void
}

const PROBLEMS: Record<Exclude<GuestSession['status'], 'connecting' | 'connected'>, string> = {
  'not-found': "We couldn't find a game with that code. Check it and try again.",
  unavailable: "We couldn't reach the game service. Check your internet connection and try again.",
  lost: 'The connection to your partner was lost.',
}

/** The device that joined: it is Player 2 and shows what the host says is happening. */
export function GuestRoom({ network, languages, saved, code, onRetry, onChangeCode, onLeave }: GuestRoomProps) {
  const { status, room, nextTurn, reveal } = useGuestSession(network, code, saved)

  function renderBody() {
    if (status === 'connecting') {
      return (
        <Waiting
          slow={`Still trying to reach game ${code}. Check the code and your internet connection.`}
          actions={
            <button type="button" onClick={onChangeCode}>
              Enter a different code
            </button>
          }
        >
          Connecting to the game…
        </Waiting>
      )
    }
    if (status !== 'connected') {
      return (
        <section className="card">
          <p role="alert">{PROBLEMS[status]}</p>
          <button type="button" className="primary" onClick={onRetry}>
            Try again
          </button>
          <button type="button" onClick={onChangeCode}>
            Enter a different code
          </button>
        </section>
      )
    }
    // The host decides the guest's languages when the guest says hello, so the first copy of the room already has them.
    if (room === null || room.guest === null) {
      return (
        <Waiting slow="The host's game is still starting. If this goes on, ask them to check their connection.">
          Connected. Waiting for the host to start the game…
        </Waiting>
      )
    }

    const { round } = room

    const pair = learningPair([room.host, room.guest])
    if (round === null) {
      const { writing } = room
      return (
        <>
          <PlayerChips pair={pair} languages={languages} me={2} />
          {writing === null ? (
            <Waiting>Waiting for the host to choose a topic…</Waiting>
          ) : (
            <WritingSentences writing={writing} topicLabel={topicName(staticSource, writing.topic)} />
          )}
        </>
      )
    }

    const { game } = round
    const myTurn = game.status === 'playing' && game.turns[game.index].player === 2
    return (
      <>
        <PlayerChips pair={pair} languages={languages} me={2} />
        <p className="topic">Topic: {topicName(staticSource, round.topic)}</p>
        <TurnView game={game} languages={languages} canAct={myTurn} onNext={nextTurn} onReveal={reveal} />
      </>
    )
  }

  const step = room === null || room.guest === null ? 1 : room.round === null ? 2 : 3

  return (
    <>
      <StepIndicator current={step} />
      {renderBody()}
      <div className="actions">
        <button type="button" className="secondary" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </>
  )
}
