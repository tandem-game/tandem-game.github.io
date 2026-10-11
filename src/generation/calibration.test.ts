import { describe, expect, it } from 'vitest'
import { formatReport, summarise } from './calibration'

describe('summarise', () => {
  it('has nothing to say about no sentences', () => {
    expect(summarise([], 'en')).toBeNull()
  })

  it('counts the words: shortest, median, longest and mean', () => {
    const report = summarise(['One two three.', 'One two three four five.', 'One two three four five six seven.'], 'en')
    expect(report).toMatchObject({ sentences: 3, min: 3, median: 5, max: 7, mean: 5 })
  })

  it('takes the middle of the two middle counts when there is an even number of sentences', () => {
    expect(summarise(['a b c', 'a b c d', 'a b c d e', 'a b c d e f'], 'en')?.median).toBe(4.5)
  })

  it('finds English grammar markers and gives the share of sentences that have each', () => {
    const report = summarise(['We will walk home.', 'I have finished my work.', 'The cat sleeps.'], 'en')
    expect(report?.markers.future).toBeCloseTo(1 / 3)
    expect(report?.markers['perfect tenses']).toBeCloseTo(1 / 3)
    expect(report?.markers.passive).toBe(0)
  })

  it('finds German grammar markers', () => {
    const report = summarise(['Ich habe gestern gearbeitet.', 'Wir können gehen, weil es regnet.', 'Hätte ich Zeit, würde ich kommen.'], 'de')
    expect(report?.markers['past (Perfekt/Präteritum)']).toBeGreaterThan(0)
    expect(report?.markers.modal).toBeCloseTo(1 / 3)
    expect(report?.markers['subordinate clause']).toBeCloseTo(1 / 3)
    expect(report?.markers['Konjunktiv II']).toBeCloseTo(1 / 3)
  })
})

describe('formatReport', () => {
  it('says when a level gave no sentences', () => {
    expect(formatReport('B1', 'de', 3, 3, null)).toBe('B1 de: 3/3 requests rejected, no sentences')
  })

  it('shows the lengths and only the markers that were found', () => {
    const line = formatReport('A1', 'en', 0, 2, summarise(['We will go.', 'They will stay.'], 'en'))
    expect(line).toContain('A1 en: 0/2 requests rejected; 2 sentences, words 3-3')
    expect(line).toContain('future 100%')
    expect(line).not.toContain('passive')
  })
})
