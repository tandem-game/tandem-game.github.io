// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createHttpGenerator, generateForLanguage, generateForPair, GenerationError, type SentenceGenerator } from './generator'
import type { GeneratedSentences, GenerateRequest, GenerationErrorKind, GenerationOptions } from './types'

const URL = 'https://worker.example/'
const request: GenerateRequest = {
  language: 'de',
  topic: { kind: 'preset', id: 'weather' },
  fresh: false,
  count: 2,
  difficulty: 'B1',
}
const sentences = ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.']
const translations = ['I can swim very well.', 'He has to do his homework.']
const good = { sentences, translations }

type FetchFn = typeof fetch
const answer = (body: unknown, status = 200) =>
  Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))

const kindOf = async (promise: Promise<unknown>): Promise<GenerationErrorKind | 'resolved'> => {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    if (error instanceof GenerationError) return error.kind
    throw error
  }
}

describe('createHttpGenerator', () => {
  it('posts the request as JSON, without cookies, and returns the sentences with their translations', async () => {
    const fetchFn = vi.fn<FetchFn>(() => answer(good))
    const result = await createHttpGenerator(URL, { fetch: fetchFn }).generate(request)
    expect(result).toEqual(good)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(URL)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(init?.body as string)).toEqual(request)
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(init?.credentials).toBe('omit')
  })

  describe('maps what went wrong to an error kind', () => {
    const kindFor = (response: () => Promise<Response>) =>
      kindOf(createHttpGenerator(URL, { fetch: response }).generate(request))

    it('429 means the free allowance is used up', async () => {
      expect(await kindFor(() => answer({ error: 'limit-reached' }, 429))).toBe('limit-reached')
    })

    it('server errors and a service that cannot be reached mean unavailable', async () => {
      expect(await kindFor(() => answer({ error: 'unavailable' }, 502))).toBe('unavailable')
      expect(await kindFor(() => answer({ error: 'unavailable' }, 503))).toBe('unavailable')
      expect(await kindFor(() => answer('<html>Bad gateway</html>', 500))).toBe('unavailable')
      expect(await kindFor(() => Promise.reject(new TypeError('Failed to fetch')))).toBe('unavailable')
    })

    it('the service giving up on bad output, or refusing the request, means invalid', async () => {
      expect(await kindFor(() => answer({ error: 'invalid' }, 502))).toBe('invalid')
      expect(await kindFor(() => answer({ error: 'bad-request' }, 400))).toBe('invalid')
    })

    it('a site the service does not allow means unavailable, not unusable sentences', async () => {
      expect(await kindFor(() => answer({ error: 'forbidden' }, 403))).toBe('unavailable')
    })
  })

  describe('does not trust a 200 answer', () => {
    const kindFor = (body: unknown) => kindOf(createHttpGenerator(URL, { fetch: () => answer(body) }).generate(request))

    it('rejects wrong counts, wrong languages and markup', async () => {
      expect(await kindFor({ sentences: [sentences[0]] })).toBe('invalid')
      expect(await kindFor({ sentences: ['You are very annoying', 'I do not like you'] })).toBe('invalid')
      expect(await kindFor({ sentences: ['Ich sehe <b>gut</b> aus.', sentences[1]] })).toBe('invalid')
    })

    it('rejects answers that are not the expected JSON', async () => {
      expect(await kindFor('not json')).toBe('invalid')
      expect(await kindFor({})).toBe('invalid')
      expect(await kindFor(null)).toBe('invalid')
      expect(await kindFor({ sentences: 'Ich kann schwimmen.' })).toBe('invalid')
    })

    it('rejects an oversized answer', async () => {
      expect(await kindFor({ ...good, padding: 'x'.repeat(10_000) })).toBe('invalid')
    })

    it('does not return extra fields from the answer', async () => {
      const result = await createHttpGenerator(URL, { fetch: () => answer({ ...good, extra: 'x' }) }).generate(request)
      expect(result).toEqual(good)
    })
  })

  describe('timeout and cancel', () => {
    /** A fetch that never answers, but rejects like the real one when aborted. */
    const hanging = (): FetchFn => (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })

    it('gives up after the timeout and reports unavailable', async () => {
      const generator = createHttpGenerator(URL, { fetch: hanging(), timeoutMs: 20 })
      expect(await kindOf(generator.generate(request))).toBe('unavailable')
    })

    it('stops the request itself when it times out', async () => {
      let seen: AbortSignal | null | undefined
      const fetchFn: FetchFn = (_url, init) => {
        seen = init?.signal
        return hanging()(_url, init)
      }
      await kindOf(createHttpGenerator(URL, { fetch: fetchFn, timeoutMs: 20 }).generate(request))
      expect(seen?.aborted).toBe(true)
    })

    it('reports cancelled, and stops the request, when the caller cancels mid-flight', async () => {
      const controller = new AbortController()
      let seen: AbortSignal | null | undefined
      const fetchFn: FetchFn = (url, init) => {
        seen = init?.signal
        return hanging()(url, init)
      }
      const pending = createHttpGenerator(URL, { fetch: fetchFn, timeoutMs: 5000 }).generate(request, controller.signal)
      controller.abort()
      expect(await kindOf(pending)).toBe('cancelled')
      expect(seen?.aborted).toBe(true)
    })

    it('does not call the service when already cancelled', async () => {
      const fetchFn = vi.fn<FetchFn>(() => answer(good))
      const controller = new AbortController()
      controller.abort()
      expect(await kindOf(createHttpGenerator(URL, { fetch: fetchFn }).generate(request, controller.signal))).toBe('cancelled')
      expect(fetchFn).not.toHaveBeenCalled()
    })

    it('ignores a cancel that comes after the answer', async () => {
      const controller = new AbortController()
      const generator = createHttpGenerator(URL, { fetch: () => answer(good) })
      expect(await generator.generate(request, controller.signal)).toEqual(good)
      expect(() => controller.abort()).not.toThrow()
    })

    it('does not leave a timer running after an answer', async () => {
      vi.useFakeTimers()
      try {
        await createHttpGenerator(URL, { fetch: () => answer(good), timeoutMs: 20_000 }).generate(request)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})

describe('translations from the Worker', () => {
  const generate = (body: unknown, asked: GenerateRequest = request) =>
    createHttpGenerator(URL, { fetch: (() => answer(body)) as FetchFn }).generate(asked)

  it('returns the sentences with their translations', async () => {
    expect(await generate({ sentences, translations })).toEqual({ sentences, translations })
  })

  it('rejects an answer without translations, with a wrong number or in the wrong language', async () => {
    expect(await kindOf(generate({ sentences }))).toBe('invalid')
    expect(await kindOf(generate({ sentences, translations: [translations[0]] }))).toBe('invalid')
    expect(await kindOf(generate({ sentences, translations: sentences }))).toBe('invalid')
  })

  it('rejects a different number of sentences than the host chose', async () => {
    expect(await kindOf(generate({ sentences }, { ...request, count: 3 }))).toBe('invalid')
  })

  it('sends the options to the Worker', async () => {
    const fetchFn = vi.fn((() => answer({ sentences, translations })) as FetchFn)
    await createHttpGenerator(URL, { fetch: fetchFn }).generate({ ...request, count: 2 })
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({ count: 2, difficulty: 'B1' })
  })
})

describe('generateForPair', () => {
  const pair = ['en', 'de'] as const
  const german = ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.']
  const english = ['She can swim very well.', 'They should try harder today.']
  const topic = { kind: 'custom', text: 'my pet dragon' } as const
  const options: GenerationOptions = { count: 2, difficulty: 'B1' }
  const answerFor = (language: string): GeneratedSentences => {
    const sentences = language === 'de' ? german : english
    return { sentences, translations: sentences.map((text) => `${text} (translated)`) }
  }

  const generatorOf = (handler: (request: GenerateRequest, signal?: AbortSignal) => Promise<GeneratedSentences>): SentenceGenerator => ({
    generate: handler,
  })

  it('asks for both languages of the pair and returns them as sentences', async () => {
    const asked: GenerateRequest[] = []
    const generator = generatorOf(async (req) => {
      asked.push(req)
      return answerFor(req.language)
    })
    const result = await generateForPair(generator, pair, topic, true, options)

    expect(asked.map((req) => req.language).sort()).toEqual(['de', 'en'])
    expect(asked.every((req) => req.fresh && req.topic === topic)).toBe(true)
    expect(result.de?.map((s) => s.text)).toEqual(german)
    expect(result.en?.map((s) => s.text)).toEqual(english)
  })

  it('passes the options on and keeps each translation with its sentence', async () => {
    const asked: GenerateRequest[] = []
    const generator = generatorOf(async (req) => {
      asked.push(req)
      return answerFor(req.language)
    })
    const result = await generateForPair(generator, pair, topic, false, options)
    expect(asked.every((req) => req.count === 2)).toBe(true)
    expect(result.de?.[0]).toEqual({ id: 'ai-de-1', text: german[0], translation: `${german[0]} (translated)` })
  })

  it('gives every sentence its own id', async () => {
    const generator = generatorOf(async (req) => answerFor(req.language))
    const result = await generateForPair(generator, pair, topic, false, options)
    const ids = [...(result.de ?? []), ...(result.en ?? [])].map((s) => s.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('fails with the error of whichever language failed, and cancels the other request', async () => {
    let otherSignal: AbortSignal | undefined
    const generator = generatorOf((req, signal) => {
      if (req.language === 'de') return Promise.reject(new GenerationError('limit-reached'))
      otherSignal = signal
      return new Promise<GeneratedSentences>(() => {})
    })
    expect(await kindOf(generateForPair(generator, pair, topic, false, options))).toBe('limit-reached')
    expect(otherSignal?.aborted).toBe(true)
  })

  it('cancels both requests when the caller cancels', async () => {
    const signals: AbortSignal[] = []
    const generator = generatorOf(
      (_req, signal) =>
        new Promise<GeneratedSentences>((_resolve, reject) => {
          if (signal) signals.push(signal)
          signal?.addEventListener('abort', () => reject(new GenerationError('cancelled')))
        }),
    )
    const controller = new AbortController()
    const pending = generateForPair(generator, pair, topic, false, options, controller.signal)
    controller.abort()
    expect(await kindOf(pending)).toBe('cancelled')
    expect(signals).toHaveLength(2)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('does not ask at all when already cancelled', async () => {
    const generate = vi.fn(async () => ({ sentences: german, translations: german }))
    const controller = new AbortController()
    controller.abort()
    expect(await kindOf(generateForPair({ generate }, pair, topic, false, options, controller.signal))).toBe('cancelled')
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('generateForPair when both players read the same language', () => {
  const topic = { kind: 'custom', text: 'my pet dragon' } as const
  const options: GenerationOptions = { count: 2, difficulty: 'B1' }
  const batch = (...texts: string[]): GeneratedSentences => ({ sentences: texts, translations: texts.map((text) => `${text} (translated)`) })
  const answers = (...batches: GeneratedSentences[]) => {
    const asked: GenerateRequest[] = []
    const generate = async (req: GenerateRequest) => {
      asked.push(req)
      return batches[asked.length - 1]
    }
    return { asked, generator: { generate } satisfies SentenceGenerator }
  }

  it('asks twice for that language, the second time for new sentences, and joins the answers', async () => {
    const { asked, generator } = answers(batch('Eins.', 'Zwei.'), batch('Drei.', 'Vier.'))
    const result = await generateForPair(generator, ['de', 'de'], topic, false, options)

    expect(asked.map((req) => [req.language, req.fresh])).toEqual([['de', false], ['de', true]])
    expect(Object.keys(result)).toEqual(['de'])
    expect(result.de?.map((s) => s.text)).toEqual(['Eins.', 'Zwei.', 'Drei.', 'Vier.'])
  })

  it('keeps a sentence once when both answers have it, whatever its case', async () => {
    const { generator } = answers(batch('Eins.', 'Zwei.'), batch('zwei. ', 'Drei.'))
    const result = await generateForPair(generator, ['de', 'de'], topic, false, options)
    expect(result.de?.map((s) => s.text)).toEqual(['Eins.', 'Zwei.', 'Drei.'])
  })

  it('gives every sentence its own id and keeps its translation', async () => {
    const { generator } = answers(batch('Eins.', 'Zwei.'), batch('Drei.', 'Vier.'))
    const result = await generateForPair(generator, ['de', 'de'], topic, false, options)
    expect(result.de?.map((s) => s.id)).toEqual(['ai-de-1', 'ai-de-2', 'ai-de-3', 'ai-de-4'])
    expect(result.de?.[2].translation).toBe('Drei. (translated)')
  })

  it('asks for new sentences both times when the caller wants new ones', async () => {
    const { asked, generator } = answers(batch('Eins.'), batch('Zwei.'))
    await generateForPair(generator, ['en', 'en'], topic, true, options)
    expect(asked.every((req) => req.fresh)).toBe(true)
  })

  it('fails when either request fails, and cancels the other', async () => {
    let otherSignal: AbortSignal | undefined
    let calls = 0
    const generator: SentenceGenerator = {
      generate: (_req, signal) => {
        if (++calls === 1) return Promise.reject(new GenerationError('limit-reached'))
        otherSignal = signal
        return new Promise<GeneratedSentences>(() => {})
      },
    }
    expect(await kindOf(generateForPair(generator, ['de', 'de'], topic, false, options))).toBe('limit-reached')
    expect(otherSignal?.aborted).toBe(true)
  })
})

describe('generateForLanguage', () => {
  const german = ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.']
  const topic = { kind: 'custom', text: 'my pet dragon' } as const
  const options: GenerationOptions = { count: 2, difficulty: 'B2' }

  it('makes exactly one request, for that language, with the options', async () => {
    const generate = vi.fn(async (_req: GenerateRequest) => ({ sentences: german, translations: ['one', 'two'] }))
    const result = await generateForLanguage({ generate }, 'de', topic, true, options)

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0][0]).toEqual({ language: 'de', topic, fresh: true, ...options })
    expect(result).toEqual([
      { id: 'ai-de-1', text: german[0], translation: 'one' },
      { id: 'ai-de-2', text: german[1], translation: 'two' },
    ])
  })

  it('fails with the generator error', async () => {
    const generator = { generate: () => Promise.reject(new GenerationError('invalid')) }
    expect(await kindOf(generateForLanguage(generator, 'de', topic, false, options))).toBe('invalid')
  })

  it('does not ask at all when already cancelled', async () => {
    const generate = vi.fn(async () => ({ sentences: german, translations: german }))
    const controller = new AbortController()
    controller.abort()
    expect(await kindOf(generateForLanguage({ generate }, 'de', topic, false, options, controller.signal))).toBe('cancelled')
    expect(generate).not.toHaveBeenCalled()
  })
})
