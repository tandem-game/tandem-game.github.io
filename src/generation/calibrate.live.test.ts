// @vitest-environment node
import { describe, it } from 'vitest'
import type { LanguageCode } from '../content/types'
import { formatReport, summarise } from './calibration'
import { generatorFromUrl } from './config'
import { GenerationError } from './generator'
import { DIFFICULTIES } from './types'

// An opt-in check of how the levels read against a real Worker, so it never runs in CI. Start one with
//   cd worker && npx wrangler@4 dev --port 8787
// then run
//   VITE_LIVE_WORKER_URL=http://localhost:8787 npx vitest run src/generation/calibrate.live
// It prints, for each level and language, how long the sentences are, how often a request was rejected and which
// grammar showed up. CALIBRATE_BATCHES (default 3) batches are asked for per level, language and topic, each of 3
// sentences, and each batch is one AI call: 6 levels x 2 languages x 2 topics x 3 batches is 72 calls, so mind the
// free daily allowance. Each batch is a fresh request, so the Worker's stored batches never answer it.
const url = import.meta.env.VITE_LIVE_WORKER_URL
const batches = Number(import.meta.env.CALIBRATE_BATCHES ?? 3)
const TOPICS = ['weather', 'food']
const LANGUAGES: LanguageCode[] = ['en', 'de']

describe.skipIf(!url)('how the levels read', () => {
  it('prints the length and grammar of each level', async () => {
    const generator = generatorFromUrl(url)
    if (!generator) throw new Error('VITE_LIVE_WORKER_URL is not a usable address')
    const medians: Record<string, number[]> = { en: [], de: [] }

    for (const language of LANGUAGES) {
      for (const difficulty of DIFFICULTIES) {
        const sentences: string[] = []
        let rejected = 0
        let requests = 0
        for (const id of TOPICS) {
          for (let i = 0; i < batches; i++) {
            requests++
            try {
              const answer = await generator.generate({ language, topic: { kind: 'preset', id }, fresh: true, count: 3, difficulty })
              sentences.push(...answer.sentences)
            } catch (error) {
              if (!(error instanceof GenerationError) || error.kind !== 'invalid') throw error
              rejected++
            }
          }
        }
        const report = summarise(sentences, language)
        console.log(formatReport(difficulty, language, rejected, requests, report))
        medians[language].push(report?.median ?? 0)
      }
      const rising = medians[language].every((median, i, all) => i === 0 || median >= all[i - 1])
      console.log(`${language}: median length per level ${medians[language].join(', ')}${rising ? '' : ' (NOT rising: two levels overlap)'}`)
    }
  }, 600_000)
})
