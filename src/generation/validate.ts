import type { LanguageCode } from '../content/types'
import { DEFAULT_COUNT } from './types'

const MIN_WORDS = 3
const MAX_WORDS = 22
export const MAX_CHARACTERS = 160

export type ParseResult =
  | { ok: true; sentences: string[] }
  | {
      ok: false
      reason: 'not-json' | 'bad-shape' | 'wrong-count' | 'bad-length' | 'markup' | 'duplicate' | 'wrong-language'
    }

type Failure = Extract<ParseResult, { ok: false }>['reason']

// Common words that belong to one of the two languages only, so a hit is
// evidence for that language. Words both languages use (in, an, was, will,
// bin, so, also) are left out on purpose.
const WORDS: Record<LanguageCode, ReadonlySet<string>> = {
  de: new Set(
    'ich du er sie wir ihr der die das den dem und oder aber weil wenn nicht ist ein eine mit zu mein meine bitte kann muss hier ja nein auch nach auf für von'.split(' '),
  ),
  en: new Set(
    'i the and or but is are to a my you he she we they can must not with please it of on for your his her'.split(' '),
  ),
}

/** Pulls the model's answer out of whatever it returned: text, fenced text or an object. */
function extractCandidate(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  const unfenced = raw.replace(/```(?:json)?/gi, '').trim()
  const attempts = [unfenced]
  const open = unfenced.search(/[{[]/)
  const close = Math.max(unfenced.lastIndexOf('}'), unfenced.lastIndexOf(']'))
  if (open >= 0 && close > open) attempts.push(unfenced.slice(open, close + 1))
  for (const text of attempts) {
    try {
      return JSON.parse(text)
    } catch {
      // try the next form
    }
  }
  return undefined
}

function listOf(candidate: unknown): unknown[] | null {
  if (Array.isArray(candidate)) return candidate
  if (typeof candidate === 'object' && candidate !== null && 'sentences' in candidate) {
    const { sentences } = candidate
    return Array.isArray(sentences) ? sentences : null
  }
  return null
}

const wordsOf = (sentence: string) => sentence.toLowerCase().match(/[\p{L}']+/gu) ?? []

const hits = (words: string[], language: LanguageCode) => words.filter((word) => WORDS[language].has(word)).length

function problemWith(sentence: string, language: LanguageCode): Failure | null {
  const words = wordsOf(sentence)
  if (words.length < MIN_WORDS || sentence.split(/\s+/).length > MAX_WORDS || sentence.length > MAX_CHARACTERS) {
    return 'bad-length'
  }
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected here
  if (/[<>{}[\]`\u0000-\u001f]|https?:|www\./i.test(sentence)) return 'markup'
  const other: LanguageCode = language === 'de' ? 'en' : 'de'
  return hits(words, other) > hits(words, language) ? 'wrong-language' : null
}

/**
 * Checks what a model (or the server) returned and turns it into exactly
 * `count` clean sentences in `language`. Both the Worker and the
 * browser use it, and it never throws.
 */
export function parseModelOutput(raw: unknown, language: LanguageCode, count: number = DEFAULT_COUNT): ParseResult {
  const candidate = extractCandidate(raw)
  if (candidate === undefined || candidate === null) return { ok: false, reason: 'not-json' }

  const list = listOf(candidate)
  if (list === null || list.some((item) => typeof item !== 'string')) return { ok: false, reason: 'bad-shape' }
  if (list.length !== count) return { ok: false, reason: 'wrong-count' }

  const sentences = (list as string[]).map((sentence) => sentence.trim())
  for (const sentence of sentences) {
    const reason = problemWith(sentence, language)
    if (reason) return { ok: false, reason }
  }

  const normalised = sentences.map((sentence) => sentence.toLowerCase().replace(/\s+/g, ' '))
  if (new Set(normalised).size !== sentences.length) return { ok: false, reason: 'duplicate' }

  return { ok: true, sentences }
}

export type ParseTranslatedResult =
  | { ok: true; sentences: string[]; translations: string[] }
  | { ok: false; reason: Failure }

const otherLanguage = (language: LanguageCode): LanguageCode => (language === 'de' ? 'en' : 'de')

/**
 * Like `parseModelOutput`, for sentences that come with a translation: a list of
 * `{ text, translation }`, bare or inside `{ "sentences": [...] }`. The sentences
 * must be in `language` and the translations in the other one, and both must pass every check.
 */
export function parseTranslatedOutput(raw: unknown, language: LanguageCode, count: number = DEFAULT_COUNT): ParseTranslatedResult {
  const candidate = extractCandidate(raw)
  if (candidate === undefined || candidate === null) return { ok: false, reason: 'not-json' }

  const list = listOf(candidate)
  if (list === null) return { ok: false, reason: 'bad-shape' }
  const pairs = list.map((item) =>
    isPair(item) ? { text: item.text, translation: item.translation } : null,
  )
  if (pairs.some((pair) => pair === null)) return { ok: false, reason: 'bad-shape' }

  const written = parseModelOutput(pairs.map((pair) => pair?.text), language, count)
  if (!written.ok) return written
  const translated = parseModelOutput(pairs.map((pair) => pair?.translation), otherLanguage(language), count)
  if (!translated.ok) return translated
  return { ok: true, sentences: written.sentences, translations: translated.sentences }
}

const isPair = (item: unknown): item is { text: string; translation: string } =>
  typeof item === 'object' &&
  item !== null &&
  typeof (item as Record<string, unknown>).text === 'string' &&
  typeof (item as Record<string, unknown>).translation === 'string'
