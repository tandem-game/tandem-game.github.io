import { useState } from 'react'
import type { Favourite } from '../favourites/favourites'
import { MAX_FAVOURITES } from '../favourites/favourites'
import type { FavouritesApi } from '../favourites/useFavourites'

interface FavouriteStarProps {
  favourite: Favourite
  favourites: FavouritesApi
}

/** A heart that keeps the sentence in the player's favourites, or takes it out again. It does not touch the game. */
export function FavouriteStar({ favourite, favourites }: FavouriteStarProps) {
  const [problem, setProblem] = useState<string | null>(null)
  const saved = favourites.has(favourite.id)

  const toggle = () => {
    const result = favourites.toggle(favourite)
    if (result === 'full') setProblem(`Your favourites are full (${MAX_FAVOURITES}). Remove one first.`)
    else if (result === 'failed') setProblem("Your browser wouldn't keep it, so it is not saved.")
    else setProblem(null)
  }

  const label = saved ? 'Remove from favourites' : 'Save sentence'
  return (
    <>
      <button type="button" className={`heart${saved ? ' saved' : ''}`} onClick={toggle} aria-label={label} title={label}>
        <span aria-hidden="true">{saved ? '♥' : '♡'}</span>
      </button>
      {problem !== null && (
        <p className="notice favourite-problem" role="status">
          {problem}
        </p>
      )}
    </>
  )
}
