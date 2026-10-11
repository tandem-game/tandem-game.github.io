// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generatorFromUrl } from './config'
import { generateForPair } from './generator'
import type { GenerationOptions } from './types'

// An opt-in check against a real Worker, so it never runs in CI. Start one with
//   cd worker && npx wrangler@4 dev --port 8787
// then run
//   VITE_LIVE_WORKER_URL=http://localhost:8787 npx vitest run src/generation/live
// It uses a few AI calls from the free daily allowance.
const url = import.meta.env.VITE_LIVE_WORKER_URL

describe.skipIf(!url)('the real Worker', () => {
  // Not at the top: describe's callback runs even when the suite is skipped.
  const live = () => {
    const generator = generatorFromUrl(url)
    if (!generator) throw new Error('VITE_LIVE_WORKER_URL is not a usable address')
    return generator
  }

  it('generates sentences with translations, in the number the host chose', async () => {
    const answer = await live().generate({
      language: 'de',
      topic: { kind: 'preset', id: 'weather' },
      fresh: true,
      count: 3,
      difficulty: 'B1',
    })
    console.log('preset (de):', answer)
    expect(answer.sentences).toHaveLength(3)
    expect(answer.translations).toHaveLength(3)
  }, 30_000)

  it('generates both languages of a round for a custom topic', async () => {
    const options: GenerationOptions = { count: 2, difficulty: 'B1' }
    const result = await generateForPair(live(), ['en', 'de'], { kind: 'custom', text: 'a rainy day at the beach' }, false, options)
    console.log('custom round:', result)
    expect(result.de).toHaveLength(2)
    expect(result.en).toHaveLength(2)
  }, 30_000)

  it('refuses an invalid request without spending the AI', async () => {
    await expect(
      live().generate({ language: 'de', topic: { kind: 'custom', text: 'x'.repeat(61) }, fresh: false, count: 2, difficulty: 'B1' }),
    ).rejects.toMatchObject({ kind: 'invalid' })
  }, 30_000)
})
