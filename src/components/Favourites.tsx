import { useState } from 'react'
import { staticSource } from '../content/staticSource'
import type { Language } from '../content/types'
import { MAX_FAVOURITES, mergeFavourites, parseFile, serialise, type Favourite } from '../favourites/favourites'
import { practiceFor } from '../favourites/practise'
import type { Turn } from '../game/buildTurns'
import type { HostDefaults } from '../game/hostPreferences'
import { useFavourites } from '../favourites/useFavourites'
import { topicName } from '../game/topicName'

/** A file the size of the most it may hold, plus room for the formatting; anything bigger is not ours. */
const MAX_FILE_BYTES = 1_000_000

/** Sentences shown on one page of the table. */
export const PAGE_SIZE = 10

interface FavouritesProps {
  languages: Language[]
  /** The player's saved settings: they say which sentences can be practised. Without them there is no practice. */
  defaults: HostDefaults | null
  onPractise: (turns: Turn[]) => void
}

function download(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'tandem-favourites.json'
  link.click()
  URL.revokeObjectURL(url)
}

/** The sentences a player kept: look through them, remove some, and move them to another device by file. */
export function Favourites({ languages, defaults, onPractise }: FavouritesProps) {
  const { list, remove, replace } = useFavourites()
  const [message, setMessage] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [requestedPage, setRequestedPage] = useState(0)
  const nameOf = (code: string) => languages.find((language) => language.code === code)?.name ?? code

  // Everything a player might look for in a row: the sentence, its translation, the languages, the level and the topic.
  const haystack = (favourite: Favourite) =>
    [
      favourite.text,
      favourite.translation,
      nameOf(favourite.textLanguage),
      nameOf(favourite.translationLanguage),
      favourite.difficulty,
      favourite.topic && topicName(staticSource, favourite.topic),
    ]
      .join(' ')
      .toLowerCase()
  // The search covers the whole list, not the page on show; a row must contain every word typed.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length === 0 ? list : list.filter((favourite) => words.every((word) => haystack(favourite).includes(word)))
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  // Removing the last row of the last page, or searching, can leave the page past the end.
  const page = Math.min(requestedPage, pageCount - 1)
  const rows = shown.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const practice = defaults && practiceFor(list, defaults.knows, defaults.learns, defaults.options.count)

  async function importFile(file: File) {
    const entries = file.size > MAX_FILE_BYTES ? null : parseFile(await file.text())
    if (entries === null) {
      setMessage("That isn't a favourites file from this game, or it is too big. Nothing was changed.")
      return
    }
    const merged = mergeFavourites(list, entries)
    if (merged.added > 0 && !replace(merged.list)) {
      setMessage("Your browser wouldn't keep them, so nothing was added.")
      return
    }
    const skipped = [
      merged.duplicates > 0 && `${merged.duplicates} you already have`,
      merged.invalid > 0 && `${merged.invalid} that could not be used`,
      merged.leftOut > 0 && `${merged.leftOut} because the list is full`,
    ].filter(Boolean)
    setMessage(`Added ${merged.added}.${skipped.length > 0 ? ` Skipped ${skipped.join(', ')}.` : ''}`)
  }

  return (
    <section className="card">
      <h2>Favourites</h2>
      <p className="hint">
        {list.length} of {MAX_FAVOURITES} saved on this device. Export them to a file to use them on another device.
      </p>
      {list.length === 0 ? (
        <p>No favourites yet. Choose the heart on a sentence while you play.</p>
      ) : (
        <>
          <div className="favourites-tools">
            <input
              type="search"
              aria-label="Search favourites"
              placeholder="Search sentences, translations, topics…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setRequestedPage(0)
              }}
            />
          </div>
          {words.length > 0 && (
            <p className="hint" role="status">
              {shown.length} of {list.length} match.
            </p>
          )}
          {shown.length === 0 ? (
            <p>No favourites match “{query.trim()}”.</p>
          ) : (
            <div className="table-wrap">
              <table className="favourites-table">
                <caption className="visually-hidden">Your favourite sentences</caption>
                <thead>
                  <tr>
                    <th scope="col">Sentence</th>
                    <th scope="col">Translation</th>
                    <th scope="col">
                      <span className="visually-hidden">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((favourite) => (
                    <tr key={favourite.id}>
                      <td>
                        {favourite.text}
                        <span className="meta">
                          {nameOf(favourite.textLanguage)} → {nameOf(favourite.translationLanguage)}
                          {favourite.difficulty && ` · ${favourite.difficulty}`}
                          {favourite.topic && ` · ${topicName(staticSource, favourite.topic)}`}
                        </span>
                      </td>
                      <td>{favourite.translation}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          aria-label={`Remove “${favourite.text}”`}
                          onClick={() => !remove(favourite.id) && setMessage("Your browser wouldn't keep the change.")}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pageCount > 1 && (
            <nav className="pagination" aria-label="Pages">
              <button type="button" disabled={page === 0} onClick={() => setRequestedPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page + 1} of {pageCount}
              </span>
              <button type="button" disabled={page === pageCount - 1} onClick={() => setRequestedPage(page + 1)}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
      {practice && (
        <>
          <button type="button" className="primary" disabled={practice.turns.length === 0} onClick={() => onPractise(practice.turns)}>
            Practise {practice.turns.length > 0 ? `${practice.turns.length} of them` : 'favourites'}
          </button>
          {list.length > 0 && (
            <p className="hint">
              {practice.matching === 0
                ? `None of them read in ${nameOf(defaults.knows)} and translate into ${nameOf(defaults.learns)}, which is what your settings practise.`
                : practice.otherDirection > 0
                  ? `${practice.otherDirection} saved the other way round, so they are left out of practice.`
                  : `Up to ${defaults.options.count} at random, from your settings.`}
            </p>
          )}
        </>
      )}
      <button type="button" disabled={list.length === 0} onClick={() => download(serialise(list))}>
        Export favourites
      </button>
      <label className="file-button">
        Import favourites
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void importFile(file)
          }}
        />
      </label>
      {message !== null && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
