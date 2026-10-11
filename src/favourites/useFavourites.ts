import { useState } from 'react'
import { addFavourite, loadFavourites, removeFavourite, saveFavourites, type Favourite } from './favourites'

export type ToggleResult = 'added' | 'removed' | 'full' | 'failed'

/** What a screen needs from the player's favourites; `useFavourites` is the real one. */
export interface FavouritesApi {
  has(id: string): boolean
  toggle(favourite: Favourite): ToggleResult
}

/** The player's favourites, kept in step with the browser's storage: a change the browser refuses is not shown as saved. */
export function useFavourites() {
  const [list, setList] = useState(loadFavourites)

  const commit = (next: Favourite[]) => {
    if (!saveFavourites(next)) return false
    setList(next)
    return true
  }

  return {
    list,
    has: (id: string) => list.some((favourite) => favourite.id === id),
    toggle(favourite: Favourite): ToggleResult {
      if (list.some((existing) => existing.id === favourite.id)) return commit(removeFavourite(list, favourite.id)) ? 'removed' : 'failed'
      const { list: next, result } = addFavourite(list, favourite)
      if (result === 'full') return 'full'
      return commit(next) ? 'added' : 'failed'
    },
    /** False when the browser would not keep the change. */
    remove: (id: string) => commit(removeFavourite(list, id)),
    replace: commit,
  }
}
