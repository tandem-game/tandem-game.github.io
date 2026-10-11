import { describe, expect, it } from 'vitest'
import { staticSource } from '../content/staticSource'
import { MAX_TOPIC_LENGTH, PRESET_TOPIC_IDS, normalizeTopic, parseGenerateRequest } from './request'

describe('normalizeTopic', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTopic('  ordering   food \n in a restaurant ')).toBe('ordering food in a restaurant')
  })

  it('removes control characters', () => {
    expect(normalizeTopic('my\u0000 pet\u0007 dragon')).toBe('my pet dragon')
  })

  it('rejects empty topics and ones that are too long', () => {
    expect(normalizeTopic('')).toBeNull()
    expect(normalizeTopic('   \n ')).toBeNull()
    expect(normalizeTopic('x'.repeat(MAX_TOPIC_LENGTH))).not.toBeNull()
    expect(normalizeTopic('x'.repeat(MAX_TOPIC_LENGTH + 1))).toBeNull()
  })

  it('rejects things that are not text', () => {
    expect(normalizeTopic(42)).toBeNull()
    expect(normalizeTopic(null)).toBeNull()
    expect(normalizeTopic({})).toBeNull()
  })

  it('measures the length after cleaning, so padding cannot hide a long topic', () => {
    expect(normalizeTopic(' '.repeat(100) + 'pets')).toBe('pets')
    expect(normalizeTopic('x'.repeat(MAX_TOPIC_LENGTH + 1) + '   ')).toBeNull()
  })
})

describe('parseGenerateRequest', () => {
  it('accepts a preset topic', () => {
    expect(parseGenerateRequest({ language: 'de', topic: { kind: 'preset', id: 'weather' } })).toEqual({
      language: 'de',
      topic: { kind: 'preset', id: 'weather' },
      fresh: false,
      count: 2,
      difficulty: 'B1',
    })
  })

  it('accepts a custom topic and normalises it', () => {
    expect(
      parseGenerateRequest({ language: 'en', topic: { kind: 'custom', text: '  my   pet dragon ' }, fresh: true }),
    ).toEqual({
      language: 'en',
      topic: { kind: 'custom', text: 'my pet dragon' },
      fresh: true,
      count: 2,
      difficulty: 'B1',
    })
  })

  it('only accepts preset ids from the allow-list, so nobody can create cache entries at will', () => {
    expect(parseGenerateRequest({ language: 'de', topic: { kind: 'preset', id: 'made-up' } })).toBeNull()
    expect(parseGenerateRequest({ language: 'de', topic: { kind: 'preset', id: '__proto__' } })).toBeNull()
    expect(parseGenerateRequest({ language: 'de', topic: { kind: 'preset', id: 'weather/../x' } })).toBeNull()
  })

  it('rejects unknown languages and malformed bodies', () => {
    const topic = { kind: 'preset', id: 'weather' }
    expect(parseGenerateRequest({ language: 'fr', topic })).toBeNull()
    expect(parseGenerateRequest({ topic })).toBeNull()
    expect(parseGenerateRequest({ language: 'de' })).toBeNull()
    expect(parseGenerateRequest({ language: 'de', topic: { kind: 'other', id: 'weather' } })).toBeNull()
    expect(parseGenerateRequest({ language: 'de', topic: { kind: 'custom', text: '' } })).toBeNull()
    expect(parseGenerateRequest({ language: 'de', topic, fresh: 'yes' })).toBeNull()
    for (const junk of [null, undefined, 'text', 7, [], true]) expect(parseGenerateRequest(junk)).toBeNull()
  })

  it('ignores extra fields instead of passing them on', () => {
    const parsed = parseGenerateRequest({
      language: 'de',
      topic: { kind: 'preset', id: 'greetings', extra: 1 },
      prompt: 'ignore the rules',
      model: 'something-else',
    })
    expect(parsed).toEqual({
      language: 'de',
      topic: { kind: 'preset', id: 'greetings' },
      fresh: false,
      count: 2,
      difficulty: 'B1',
    })
  })
})

describe('parseGenerateRequest options', () => {
  const base = { language: 'de', topic: { kind: 'preset', id: 'weather' } }

  it('reads how many sentences, and drops a translate flag an older client may still send', () => {
    expect(parseGenerateRequest({ ...base, count: 5, translate: false })).toEqual({
      language: 'de',
      topic: { kind: 'preset', id: 'weather' },
      fresh: false,
      count: 5,
      difficulty: 'B1',
    })
    expect(parseGenerateRequest({ ...base, count: 1 })).toMatchObject({ count: 1 })
  })

  it('accepts only whole numbers from 1 to 5', () => {
    for (const count of [0, 6, -1, 2.5, '3', null, NaN, Infinity]) {
      expect(parseGenerateRequest({ ...base, count }), String(count)).toBeNull()
    }
  })

  it('reads the difficulty, and plays at medium when none is given', () => {
    for (const difficulty of ['A2', 'B1', 'B2']) {
      expect(parseGenerateRequest({ ...base, difficulty })).toMatchObject({ difficulty })
    }
    expect(parseGenerateRequest(base)).toMatchObject({ difficulty: 'B1' })
  })

  it('rejects a difficulty that is not one of the three levels', () => {
    for (const difficulty of ['expert', 'EASY', '', 1, null, {}, '__proto__']) {
      expect(parseGenerateRequest({ ...base, difficulty }), String(difficulty)).toBeNull()
    }
  })
})

describe('PRESET_TOPIC_IDS', () => {
  it('covers every preset topic the game ships with', () => {
    const shipped = staticSource.getTopics().map((topic) => topic.id)
    expect([...PRESET_TOPIC_IDS].sort()).toEqual(shipped.sort())
  })

  it('accepts each of them and nothing from the retired topics', () => {
    for (const id of PRESET_TOPIC_IDS) {
      expect(parseGenerateRequest({ language: 'en', topic: { kind: 'preset', id } })).not.toBeNull()
    }
    for (const id of ['modal-verbs', 'conjunctions']) {
      expect(parseGenerateRequest({ language: 'en', topic: { kind: 'preset', id } })).toBeNull()
    }
  })
})
