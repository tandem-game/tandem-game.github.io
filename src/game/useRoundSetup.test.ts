import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GenerationError, type SentenceGenerator } from '../generation/generator'
import type { GeneratedSentences, GenerateRequest, GenerationErrorKind } from '../generation/types'
import type { Turn } from './buildTurns'
import { useRoundSetup } from './useRoundSetup'

// The host speaks German and learns English, the guest the other way round.
const players = [{ knows: 'de', learns: 'en' }, { knows: 'en', learns: 'de' }] as const
const german = ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.']
const english = ['She can swim very well.', 'They should try harder today.']

interface Pending {
  request: GenerateRequest
  signal?: AbortSignal
  resolve: (answer: GeneratedSentences) => void
  reject: (error: unknown) => void
}

/** A generator the test answers by hand, so it can look at the state while a request is in flight. */
function manualGenerator() {
  const pending: Pending[] = []
  const generator: SentenceGenerator = {
    generate: (request, signal) =>
      new Promise<GeneratedSentences>((resolve, reject) => {
        pending.push({ request, signal, resolve, reject })
      }),
  }
  const answerAll = (lang: Record<string, string[]> = { de: german, en: english }) => {
    for (const p of pending.splice(0)) p.resolve({ sentences: lang[p.request.language], translations: lang[p.request.language === 'de' ? 'en' : 'de'] })
  }
  const failAll = (kind: GenerationErrorKind) => {
    for (const p of pending.splice(0)) p.reject(new GenerationError(kind))
  }
  return { generator, pending, answerAll, failAll }
}

const preset = 'greetings'
const options = { count: 2, difficulty: 'B1' } as const

/** A hook with nothing chosen yet, and a spy for the sentences it hands over once they are written. */
function start(who: Parameters<typeof useRoundSetup>[0] = players, solo = false) {
  const manual = manualGenerator()
  const onReady = vi.fn<(topic: unknown, turns: Turn[]) => void>()
  const { result, unmount } = renderHook(() =>
    useRoundSetup(who, manual.generator, { solo, onReady }),
  )
  return { ...manual, result, unmount, onReady }
}

describe('useRoundSetup', () => {
  it('starts by letting the host choose', () => {
    const { result } = start()
    expect(result.current.state).toEqual({ phase: 'choosing' })
  })

  it('asks for stored sentences by default and for fresh ones when told to', () => {
    const { result, pending } = start()
    act(() => result.current.choose(preset))
    expect(pending.map((p) => p.request.fresh)).toEqual([false, false])

    pending.length = 0
    act(() => result.current.choose(preset, undefined, true))
    expect(pending.map((p) => p.request.fresh)).toEqual([true, true])
  })

  it('does nothing until the partner has joined', () => {
    const { generator, pending } = manualGenerator()
    const onReady = vi.fn()
    const { result } = renderHook(() => useRoundSetup(null, generator, { onReady }))
    act(() => result.current.choose(preset))
    act(() => result.current.choose('my pet dragon'))
    expect(result.current.state).toEqual({ phase: 'choosing' })
    expect(pending).toHaveLength(0)
  })

  it('does nothing without a generator', () => {
    const { result } = renderHook(() => useRoundSetup(players, undefined, { onReady: vi.fn() }))
    act(() => result.current.choose(preset))
    act(() => result.current.choose('my pet dragon'))
    expect(result.current.state).toEqual({ phase: 'choosing' })
  })

  describe('choosing a preset topic', () => {
    it('asks the AI for both languages straight away and hands over the turns once they are written', async () => {
      const { pending, answerAll, result, onReady } = start()
      act(() => result.current.choose(preset))

      expect(result.current.state).toMatchObject({ phase: 'writing', topic: { kind: 'preset', id: preset }, busy: true, error: null })
      expect(pending.map((p) => [p.request.language, p.request.topic, p.request.fresh]).sort()).toEqual([
        ['de', { kind: 'preset', id: preset }, false],
        ['en', { kind: 'preset', id: preset }, false],
      ])
      expect(onReady).not.toHaveBeenCalled()

      await act(async () => answerAll())
      expect(onReady).toHaveBeenCalledExactlyOnceWith({ kind: 'preset', id: preset }, expect.any(Array))
      const turns = onReady.mock.calls[0][1]
      expect(turns.map((turn) => turn.player)).toEqual([1, 2, 1, 2])
      expect(result.current.state).toEqual({ phase: 'choosing' })
    })

    it('treats text that is not a preset id as a custom topic', () => {
      const { pending, result } = start()
      act(() => result.current.choose('greetings and more'))
      expect(result.current.state).toMatchObject({ topic: { kind: 'custom', text: 'greetings and more' } })
      expect(pending.every((p) => p.request.topic.kind === 'custom')).toBe(true)
    })
  })

  describe('round options', () => {
    it('asks for the chosen number of sentences and builds that many turns', async () => {
      const { result, pending, onReady } = start()
      act(() => result.current.choose(preset, { count: 1, difficulty: 'B1' }))
      expect(pending.map((p) => p.request)).toEqual(
        expect.arrayContaining([expect.objectContaining({ count: 1, difficulty: 'B1' })]),
      )
      expect(result.current.state).toMatchObject({ options: { count: 1, difficulty: 'B1' } })
      await act(async () => {
        for (const p of pending.splice(0)) {
          p.resolve({
            sentences: [(p.request.language === 'de' ? german : english)[0]],
            translations: [(p.request.language === 'de' ? english : german)[0]],
          })
        }
      })
      expect(onReady.mock.calls[0][1]).toHaveLength(2)
    })

    it('keeps the options, difficulty included, when it tries again', async () => {
      const { result, pending, failAll } = start()
      act(() => result.current.choose(preset, { count: 3, difficulty: 'B2' }))
      await act(async () => failAll('unavailable'))
      expect(result.current.state).toMatchObject({ busy: false, error: 'unavailable' })
      act(() => result.current.retry())
      expect(pending.map((p) => p.request)).toEqual(
        expect.arrayContaining([expect.objectContaining({ count: 3, difficulty: 'B2', fresh: true })]),
      )
    })
  })

  describe('when the sentences cannot be written', () => {
    it.each<GenerationErrorKind>(['unavailable', 'limit-reached', 'invalid'])('reports %s and hands over nothing', async (kind) => {
      const { result, failAll, onReady } = start()
      act(() => result.current.choose('my pet dragon'))
      await act(async () => failAll(kind))
      expect(result.current.state).toMatchObject({ phase: 'writing', busy: false, error: kind })
      expect(onReady).not.toHaveBeenCalled()
    })

    it('treats an unexpected failure as the service being unavailable', async () => {
      const generator: SentenceGenerator = { generate: () => Promise.reject(new Error('boom')) }
      const { result } = renderHook(() => useRoundSetup(players, generator, { onReady: vi.fn() }))
      act(() => result.current.choose(preset))
      await waitFor(() => expect(result.current.state).toMatchObject({ error: 'unavailable' }))
    })

    it('tries again for new sentences, clearing the error, and hands them over', async () => {
      const { failAll, answerAll, result, pending, onReady } = start()
      act(() => result.current.choose(preset))
      await act(async () => failAll('unavailable'))

      act(() => result.current.retry())
      expect(result.current.state).toMatchObject({ busy: true, error: null })
      expect(pending.map((p) => p.request.fresh)).toEqual([true, true])
      await act(async () => answerAll())
      expect(onReady).toHaveBeenCalledOnce()
    })

    it('ignores a retry while a request is running, or when nothing was chosen', () => {
      const { pending, result } = start()
      act(() => result.current.retry())
      expect(pending).toHaveLength(0)

      act(() => result.current.choose(preset))
      act(() => result.current.retry())
      expect(pending).toHaveLength(2) // one per language, not four
    })
  })

  describe('leaving', () => {
    it('back() stops the request, returns to choosing, and ignores a late answer', async () => {
      const { pending, result, answerAll, onReady } = start()
      act(() => result.current.choose(preset))
      const signals = pending.map((p) => p.signal)
      act(() => result.current.back())
      expect(signals.every((signal) => signal?.aborted)).toBe(true)
      expect(result.current.state).toEqual({ phase: 'choosing' })

      await act(async () => answerAll())
      expect(onReady).not.toHaveBeenCalled()
      expect(result.current.state).toEqual({ phase: 'choosing' })
    })

    it('ignores a failure that arrives after going back', async () => {
      const { result, failAll } = start()
      act(() => result.current.choose(preset))
      act(() => result.current.back())
      await act(async () => failAll('cancelled'))
      expect(result.current.state).toEqual({ phase: 'choosing' })
    })

    it('back() after a failure returns to choosing', async () => {
      const { result, failAll } = start()
      act(() => result.current.choose(preset))
      await act(async () => failAll('invalid'))
      act(() => result.current.back())
      expect(result.current.state).toEqual({ phase: 'choosing' })
    })

    it('does not count an answer to an earlier request once a new topic was chosen', async () => {
      const { result, pending, answerAll, onReady } = start()
      act(() => result.current.choose(preset))
      const first = pending.splice(0)
      act(() => result.current.choose('my pet dragon'))
      await act(async () => {
        for (const p of first) p.resolve({ sentences: german, translations: english })
      })
      expect(onReady).not.toHaveBeenCalled()

      await act(async () => answerAll())
      expect(onReady).toHaveBeenCalledExactlyOnceWith({ kind: 'custom', text: 'my pet dragon' }, expect.any(Array))
    })

    it('stops the request when the screen goes away', () => {
      const { pending, result, unmount } = start()
      act(() => result.current.choose(preset))
      unmount()
      expect(pending.every((p) => p.signal?.aborted)).toBe(true)
    })

    it('does not update, or hand anything over, after unmounting when a late answer arrives', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { result, unmount, answerAll, onReady } = start()
      act(() => result.current.choose(preset))
      unmount()
      await act(async () => answerAll())
      expect(spy).not.toHaveBeenCalled()
      expect(onReady).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})

describe('useRoundSetup when both players speak the same language', () => {
  const bothGerman = [{ knows: 'de', learns: 'en' }, { knows: 'de', learns: 'en' }] as const
  const moreGerman = ['Wir fahren morgen nach Berlin.', 'Sie hat einen kleinen Hund.']

  it('asks for German twice, the second time for new sentences, and gives each player different sentences to translate into English', async () => {
    const { result, pending, onReady } = start(bothGerman)
    act(() => result.current.choose(preset, options))

    expect(pending.map((p) => [p.request.language, p.request.fresh])).toEqual([['de', false], ['de', true]])
    await act(async () => {
      const [first, second] = pending.splice(0)
      first.resolve({ sentences: german, translations: english })
      second.resolve({ sentences: moreGerman, translations: english })
    })

    const turns = onReady.mock.calls[0][1]
    expect(turns.map((turn) => [turn.player, turn.learning])).toEqual([[1, 'en'], [2, 'en'], [1, 'en'], [2, 'en']])
    const texts = turns.map((turn) => turn.sentence.text)
    expect(new Set(texts).size).toBe(4)
    expect(texts.sort()).toEqual([...german, ...moreGerman].sort())
  })
})

describe('useRoundSetup for one player', () => {
  // The player speaks German and learns English; the second player is not used.
  const me = { knows: 'de', learns: 'en' } as const
  const solo = [me, me] as const

  it('asks only for sentences in the language the player speaks', async () => {
    const { result, pending, answerAll, onReady } = start(solo, true)
    act(() => result.current.choose(preset, options))
    expect(pending.map((p) => p.request.language)).toEqual(['de'])
    await act(async () => answerAll())
    expect(onReady).toHaveBeenCalledOnce()
  })

  it("makes every turn the player's, reading German and translating into English", async () => {
    const { result, answerAll, onReady } = start(solo, true)
    act(() => result.current.choose(preset, options))
    await act(async () => answerAll())

    const turns = onReady.mock.calls[0][1]
    expect(turns).toHaveLength(2)
    expect(turns.every((turn) => turn.player === 1 && turn.learning === 'en')).toBe(true)
    expect(turns.map((turn) => turn.sentence.text).sort()).toEqual([...german].sort())
  })

  it('asks for one new request when trying again, skipping the stored sentences', async () => {
    const { result, pending, failAll } = start(solo, true)
    act(() => result.current.choose(preset, options))
    await act(async () => failAll('limit-reached'))
    expect(result.current.state).toMatchObject({ busy: false, error: 'limit-reached' })

    act(() => result.current.retry())
    expect(pending).toHaveLength(1)
    expect(pending[0].request).toMatchObject({ language: 'de', fresh: true })
  })

  it('stops the running request when the player goes back', () => {
    const { result, pending } = start(solo, true)
    act(() => result.current.choose(preset, options))
    act(() => result.current.back())
    expect(pending[0].signal?.aborted).toBe(true)
    expect(result.current.state).toEqual({ phase: 'choosing' })
  })
})
