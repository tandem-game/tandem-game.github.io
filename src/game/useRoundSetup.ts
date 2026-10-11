import { useCallback, useEffect, useRef, useState } from 'react'
import { staticSource } from '../content/staticSource'
import type { ContentSource, Players } from '../content/types'
import { GenerationError, generateForLanguage, generateForPair, type SentenceGenerator } from '../generation/generator'
import { DEFAULT_ROUND_OPTIONS, type GenerateTopic, type GenerationErrorKind, type RoundOptions } from '../generation/types'
import { buildSoloTurns, buildTurns, type Turn } from './buildTurns'

export type RoundSetup =
  /** Picking a topic. */
  | { phase: 'choosing' }
  /** The AI is writing the sentences of the round, or failed to. */
  | {
      phase: 'writing'
      topic: GenerateTopic
      options: RoundOptions
      /** An AI request is running; if not, it failed with `error`. */
      busy: boolean
      error: GenerationErrorKind | null
    }

const choosing: RoundSetup = { phase: 'choosing' }

interface RoundSetupOptions {
  /** One player: only sentences in their own language are written, and every turn is theirs. */
  solo?: boolean
  source?: ContentSource
  /** Called with the sentences as soon as they are written, so the round can start. */
  onReady: (topic: GenerateTopic, turns: Turn[]) => void
}

/**
 * The host's side of starting a round: pick a topic, and the AI's sentences are written and handed to `onReady`.
 * `players` is null until the partner has joined, and nothing can be chosen before then.
 * With `solo`, only the first player counts and there is no partner.
 */
export function useRoundSetup(
  players: Players | null,
  generator: SentenceGenerator | undefined,
  { solo = false, source = staticSource, onReady }: RoundSetupOptions,
) {
  const [state, setState] = useState<RoundSetup>(choosing)
  // The request that may still change the state; aborting it makes its result count for nothing.
  const current = useRef<AbortController | null>(null)
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })

  const stop = useCallback(() => {
    current.current?.abort()
    current.current = null
  }, [])
  useEffect(() => stop, [stop])

  const run = useCallback(
    async (topic: GenerateTopic, options: RoundOptions, fresh: boolean) => {
      if (!generator || players === null) return
      stop()
      const mine = new AbortController()
      current.current = mine
      try {
        const turns = solo
          ? buildSoloTurns(
              players[0].learns,
              await generateForLanguage(generator, players[0].knows, topic, fresh, options, mine.signal),
              options.count,
            )
          : buildTurns(
              players,
              await generateForPair(generator, [players[0].knows, players[1].knows], topic, fresh, options, mine.signal),
              options.count,
            )
        if (mine.signal.aborted) return
        setState(choosing)
        ready.current(topic, turns)
      } catch (error) {
        if (mine.signal.aborted) return
        const kind = error instanceof GenerationError ? error.kind : 'unavailable'
        setState((previous) => (previous.phase === 'writing' ? { ...previous, busy: false, error: kind } : previous))
      } finally {
        if (current.current === mine) current.current = null
      }
    },
    [generator, players, solo, stop],
  )

  /** `topic` is a preset's id or the text the host typed. `fresh` skips sentences the Worker has already stored. */
  const choose = useCallback(
    (topic: string, options: RoundOptions = DEFAULT_ROUND_OPTIONS, fresh = false) => {
      if (!generator || players === null) return
      const isPreset = source.getTopics().some((preset) => preset.id === topic)
      const chosen: GenerateTopic = isPreset ? { kind: 'preset', id: topic } : { kind: 'custom', text: topic }
      setState({ phase: 'writing', topic: chosen, options, busy: true, error: null })
      void run(chosen, options, fresh)
    },
    [generator, players, run, source],
  )

  /** Ask again after a failure, for the same topic. */
  const retry = useCallback(() => {
    if (!generator || state.phase !== 'writing' || state.busy) return
    setState({ ...state, busy: true, error: null })
    void run(state.topic, state.options, true)
  }, [generator, run, state])

  /** Stop the request, or give up after a failure, and go back to choosing a topic. */
  const back = useCallback(() => {
    stop()
    setState(choosing)
  }, [stop])

  return { state, choose, retry, back }
}
