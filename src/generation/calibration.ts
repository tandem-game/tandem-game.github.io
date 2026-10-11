import type { LanguageCode } from '../content/types'

/** Rough markers of the grammar a sentence uses, found by pattern: a guide for tuning the prompts, not a parser. */
const MARKERS: Record<LanguageCode, Record<string, RegExp>> = {
  en: {
    'past simple': /\b(was|were|did|\w+ed)\b/i,
    'perfect tenses': /\b(have|has|had)\s+(\w+ed|been|gone|done|seen|made|taken|known|\w+en)\b/i,
    future: /\b(will|going to|shall)\b/i,
    modal: /\b(can|could|must|should|may|might|would)\b/i,
    conditional: /\b(if|unless)\b/i,
    'subordinate clause': /\b(because|although|though|while|since|that|which|who|whose|whom)\b/i,
    passive: /\b(is|are|was|were|been|being)\s+\w+(ed|en)\b/i,
  },
  de: {
    'past (Perfekt/Präteritum)': /\b(habe|hast|hat|haben|habt|hatte|hatten|bin|bist|ist|sind|seid|war|waren)\b.*\b(ge\w+|\w+ten?)\b/i,
    future: /\bwerd(e|en|et|e?st)?\b/i,
    modal: /\b(kann|kannst|können|muss|musst|müssen|soll|sollen|darf|dürfen|will|wollen|möchte)\b/i,
    conditional: /\b(wenn|falls)\b/i,
    'subordinate clause': /,\s*(weil|dass|obwohl|während|damit|der|die|das|deren|dessen|wie|ob)\b/i,
    'Konjunktiv II': /\b(würde|würden|hätte|hätten|wäre|wären|könnte|könnten)\b/i,
    passive: /\b(wird|werden|wurde|wurden)\b.*\bge\w+/i,
  },
}

export interface LevelReport {
  sentences: number
  /** Word counts of the sentences. */
  min: number
  median: number
  max: number
  mean: number
  /** For each marker, the share of sentences it was found in (0 to 1). */
  markers: Record<string, number>
}

const wordCount = (sentence: string) => sentence.split(/\s+/).filter(Boolean).length

/** How long the sentences are and which grammar they use, for one level in one language. */
export function summarise(sentences: string[], language: LanguageCode): LevelReport | null {
  if (sentences.length === 0) return null
  const counts = sentences.map(wordCount).sort((a, b) => a - b)
  const middle = Math.floor(counts.length / 2)
  const median = counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2
  const markers = Object.fromEntries(
    Object.entries(MARKERS[language]).map(([name, pattern]) => [
      name,
      sentences.filter((sentence) => pattern.test(sentence)).length / sentences.length,
    ]),
  )
  const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length
  return { sentences: sentences.length, min: counts[0], median, max: counts.at(-1) ?? 0, mean: Math.round(mean * 10) / 10, markers }
}

/** One line a person can read in a terminal. */
export function formatReport(level: string, language: LanguageCode, rejected: number, requests: number, report: LevelReport | null) {
  const head = `${level} ${language}: ${rejected}/${requests} requests rejected`
  if (report === null) return `${head}, no sentences`
  const markers = Object.entries(report.markers)
    .filter(([, share]) => share > 0)
    .map(([name, share]) => `${name} ${Math.round(share * 100)}%`)
    .join(', ')
  return `${head}; ${report.sentences} sentences, words ${report.min}-${report.max} (median ${report.median}, mean ${report.mean}); ${markers || 'no markers found'}`
}
