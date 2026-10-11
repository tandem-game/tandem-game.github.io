/// <reference types="node" />
// @vitest-environment node
import { writeFileSync } from 'node:fs'
import { describe, it } from 'vitest'
import { staticSource } from '../content/staticSource'
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
// The report is also written to CALIBRATE_OUT (default calibration-report.txt), because a reporter that hides the
// output of passing tests would otherwise swallow it.
const url = import.meta.env.VITE_LIVE_WORKER_URL
const batches = Number(import.meta.env.CALIBRATE_BATCHES ?? 3)
const out = process.env.CALIBRATE_OUT ?? 'calibration-report.txt'
const TOPICS = ['weather', 'food-and-drink']
const LANGUAGES: LanguageCode[] = ['en', 'de']

describe.skipIf(!url)('how the levels read', () => {
  it('prints the length and grammar of each level', async () => {
    const unknown = TOPICS.filter((id) => !staticSource.getTopics().some((topic) => topic.id === id))
    if (unknown.length > 0) throw new Error(`Not preset topics, so every request would be rejected: ${unknown.join(', ')}`)
    const generator = generatorFromUrl(url)
    if (!generator) throw new Error('VITE_LIVE_WORKER_URL is not a usable address')
    const medians: Record<string, number[]> = { en: [], de: [] }
    const lines: string[] = []
    const say = (line: string) => {
      console.log(line)
      lines.push(line)
      writeFileSync(out, lines.join('\n') + '\n')
    }

    for (const language of LANGUAGES) {
      for (const difficulty of DIFFICULTIES) {
        const sentences: string[] = []
        let rejected = 0
        let unreachable = 0
        let requests = 0
        for (const id of TOPICS) {
          for (let i = 0; i < batches; i++) {
            requests++
            try {
              const answer = await generator.generate({ language, topic: { kind: 'preset', id }, fresh: true, count: 3, difficulty })
              sentences.push(...answer.sentences)
            } catch (error) {
              // Out of allowance stops the run; a request that timed out or failed is counted and the run goes on.
              if (!(error instanceof GenerationError) || error.kind === 'limit-reached') throw error
              if (error.kind === 'invalid') rejected++
              else unreachable++
            }
          }
        }
        const report = summarise(sentences, language)
        say(formatReport(difficulty, language, rejected, requests, report) + (unreachable > 0 ? ` [${unreachable} requests got no answer]` : ''))
        medians[language].push(report?.median ?? 0)
      }
      const rising = medians[language].every((median, i, all) => i === 0 || median >= all[i - 1])
      say(`${language}: median length per level ${medians[language].join(', ')}${rising ? '' : ' (NOT rising: two levels overlap)'}`)
    }
  }, 600_000)
})
