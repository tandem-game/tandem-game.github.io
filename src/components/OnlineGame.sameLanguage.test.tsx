import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { SentenceGenerator } from '../generation/generator'
import type { GenerateRequest } from '../generation/types'
import { GUEST_DEFAULTS, SAVED_DEFAULTS, createGame, joinGame, sentenceOn, startRound } from '../test/devices'
import { createMemoryNetwork } from '../test/memoryNetwork'

const german = [
  'Mein Drache frisst gerne Süßigkeiten.',
  'Der Drache hat kleine grüne Schuppen.',
  'Wir gehen heute ins Kino.',
  'Sie trinkt jeden Morgen Tee.',
]
const english = [
  'My dragon likes to eat sweets.',
  'The dragon has small green scales.',
  'We are going to the cinema today.',
  'She drinks tea every morning.',
]

/** Answers each request for a language with the next two sentences, so two requests never give the same ones. */
function generatorWithNewSentencesEachTime() {
  const asked: GenerateRequest[] = []
  const given: Record<string, number> = {}
  const generator: SentenceGenerator = {
    generate: async (request) => {
      asked.push(request)
      const start = (given[request.language] = (given[request.language] ?? -2) + 2)
      const [own, other] = request.language === 'de' ? [german, english] : [english, german]
      return { sentences: own.slice(start, start + 2), translations: other.slice(start, start + 2) }
    },
  }
  return { generator, asked }
}

type Languages = { knows: 'de' | 'en'; learns: 'de' | 'en' }

/** A host and a guest in a round that has started, having saved the given languages. */
async function startGame(hostLanguages: Languages, guestLanguages: Languages) {
  const { generator, asked } = generatorWithNewSentencesEachTime()
  const user = userEvent.setup()
  const network = createMemoryNetwork()
  const host = await createGame(network, user, generator, {}, hostLanguages)
  const guest = await joinGame(network, user, host.code, { ...SAVED_DEFAULTS, ...guestLanguages })
  await startRound(host, guest)
  return { user, host, guest, asked }
}

describe('two players who speak and learn the same languages', () => {
  it('both read German and translate into English, each with sentences the other has not read', async () => {
    const { user, host, guest, asked } = await startGame({ knows: 'de', learns: 'en' }, { knows: 'de', learns: 'en' })

    // Only German is written, so it is asked for twice, the second time for new sentences.
    expect(asked.map((request) => [request.language, request.fresh])).toEqual([['de', false], ['de', true]])
    for (const device of [host, guest]) {
      expect(device.ui.getByText('You are learning English', { selector: `[data-player="${device === host ? 1 : 2}"]` })).toBeInTheDocument()
      expect(device.ui.getByText('Your partner is learning English')).toBeInTheDocument()
    }

    const shown: (string | null | undefined)[] = []
    for (const [turn, mover, other] of [
      [1, host, guest],
      [2, guest, host],
      [3, host, guest],
      [4, guest, host],
    ] as const) {
      await mover.ui.findByText(`Turn ${turn} of 4`)
      await other.ui.findByText(`Turn ${turn} of 4`)
      shown.push(sentenceOn(mover))
      expect(sentenceOn(other)).toBe(sentenceOn(mover))
      await user.click(mover.ui.getByRole('button', { name: turn === 4 ? 'Finish round' : 'Next turn' }))
    }

    expect(shown.every((text) => german.includes(text ?? ''))).toBe(true)
    expect(new Set(shown).size).toBe(4)
  })

  it('works the same way for two English speakers who learn German', async () => {
    const { host, asked } = await startGame({ knows: 'en', learns: 'de' }, { knows: 'en', learns: 'de' })
    expect(asked.map((request) => request.language)).toEqual(['en', 'en'])
    expect(english).toContain(sentenceOn(host))
    expect(host.ui.getByText('Your partner is learning German')).toBeInTheDocument()
  })
})

describe('two players who speak different languages', () => {
  it("still learn each other's language, as before", async () => {
    const { host, guest, asked } = await startGame({ knows: 'de', learns: 'en' }, GUEST_DEFAULTS)

    expect(asked.map((request) => request.language).sort()).toEqual(['de', 'en'])
    expect(asked.every((request) => !request.fresh)).toBe(true)
    expect(german).toContain(sentenceOn(host))
    expect(host.ui.getByText('Your partner is learning German')).toBeInTheDocument()
    expect(guest.ui.getByText('You are learning German')).toBeInTheDocument()
  })
})
