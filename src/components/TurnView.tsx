import { useState } from 'react'
import type { Language } from '../content/types'
import { favouriteFromTurn, type FavouriteContext } from '../favourites/fromTurn'
import type { FavouritesApi } from '../favourites/useFavourites'
import type { GameState } from '../game/gameReducer'
import { FavouriteStar } from './FavouriteStar'
import { Spinner } from './Spinner'

interface TurnViewProps {
  game: GameState
  languages: Language[]
  /** Whether this device's player may move the game on. */
  canAct: boolean
  onNext: () => void
  /** Shows the translation to both players. */
  onReveal: () => void
  /** Only given on a device that may start another round. */
  onPlayAgain?: () => void
  /** Only given on a device that may go back to the previous sentence, whoever's turn it is. */
  onPrevious?: () => void
  /** Where a sentence can be saved; without it there is no star. */
  favourites?: FavouritesApi
  /** The round's topic and level, for the saved sentence's label. */
  favouriteContext?: FavouriteContext
}

/** Shows a round from the host's copy of the game; it owns no state itself. */
export function TurnView({ game, languages, canAct, onNext, onReveal, onPlayAgain, onPrevious, favourites, favouriteContext }: TurnViewProps) {
  // Either player can step back, so the other one is told when the sentence changes under them.
  // A finished round counts as one step past the last turn, since stepping back from it reopens that turn.
  const position = game.status === 'finished' ? game.turns.length : game.index
  const [seenPosition, setSeenPosition] = useState(position)
  const [wentBack, setWentBack] = useState(false)
  if (position !== seenPosition) {
    setSeenPosition(position)
    setWentBack(position < seenPosition)
  }

  const previousButton = (
    <button type="button" className="secondary quiet" onClick={onPrevious}>
      Previous sentence
    </button>
  )

  if (game.status === 'finished') {
    return (
      <section className="card finished">
        <h2>Round complete</h2>
        <p>{game.turns.length} sentences practised.</p>
        {onPrevious && game.turns.length > 0 && previousButton}
        {onPlayAgain ? (
          <>
            <p className="hint">Play again for new sentences on the same topic, or change the topic.</p>
            <button type="button" className="primary" onClick={onPlayAgain}>
              Play again
            </button>
          </>
        ) : (
          <p className="status-line" role="status">
            <Spinner /> Waiting for the host to start another round.
          </p>
        )}
      </section>
    )
  }

  const turn = game.turns[game.index]
  const isLastTurn = game.index === game.turns.length - 1
  const learning = languages.find((l) => l.code === turn.learning)?.name ?? turn.learning

  return (
    // data-player lets the CSS give each player their own colour.
    <section className="card" data-player={turn.player}>
      <p className="turn-count">
        Turn {game.index + 1} of {game.turns.length}
      </p>
      {wentBack && !game.revealed && (
        <p className="notice" role="status">
          Back to the previous sentence.
        </p>
      )}
      <progress value={game.index + 1} max={game.turns.length} aria-hidden="true" />
      <h2>
        {canAct ? 'Your turn' : "Your partner's turn"}: translate into {learning}
      </h2>
      <div className="sentence-row">
        <p className="sentence">{turn.sentence.text}</p>
        {favourites && <FavouriteStar favourite={favouriteFromTurn(turn, favouriteContext)} favourites={favourites} />}
      </div>
      {game.revealed && (
        <p className="translation">
          <span className="preview-who">Translation</span>
          {turn.sentence.translation}
        </p>
      )}
      <p className="hint">
        {canAct
          ? `Say it aloud in ${learning}. Show the translation to check yourself, or skip it.`
          : `Listen to your partner, and tell them if it sounds right.`}
      </p>
      {canAct ? (
        // The speaker may show the translation first, or move on without showing it.
        <>
          {!game.revealed && (
            <button type="button" className="primary" onClick={onReveal}>
              Show translation
            </button>
          )}
          {/* One main action at a time: show the translation first, and only then move on. */}
          <button type="button" className={game.revealed ? 'primary' : 'secondary'} onClick={onNext}>
            {isLastTurn ? 'Finish round' : 'Next turn'}
          </button>
        </>
      ) : (
        <p className="status-line" role="status">
          <Spinner /> Waiting for your partner to finish their turn…
        </p>
      )}
      {onPrevious && game.index > 0 && previousButton}
      <p className="preview-source">Written by AI, so a sentence can contain mistakes.</p>
    </section>
  )
}
