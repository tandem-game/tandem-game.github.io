import { describe, expect, it } from 'vitest'
import { parseModelOutput, parseTranslatedOutput } from './validate'

const german = ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.']
const english = ['She can speak English fluently.', 'They should try harder today.']
const json = (sentences: unknown) => JSON.stringify({ sentences })

describe('parseModelOutput', () => {
  it('accepts a clean JSON string', () => {
    expect(parseModelOutput(json(german), 'de')).toEqual({ ok: true, sentences: german })
  })

  it('accepts an already parsed object, which some models return', () => {
    expect(parseModelOutput({ sentences: english }, 'en')).toEqual({ ok: true, sentences: english })
  })

  it('accepts a bare array', () => {
    expect(parseModelOutput(JSON.stringify(german), 'de')).toEqual({ ok: true, sentences: german })
    expect(parseModelOutput(german, 'de')).toEqual({ ok: true, sentences: german })
  })

  it('unwraps markdown code fences', () => {
    expect(parseModelOutput('```json\n' + json(german) + '\n```', 'de')).toEqual({
      ok: true,
      sentences: german,
    })
    expect(parseModelOutput('```json { "sentences": ["Ich kann schwimmen.", "Er muss lernen."] } ```', 'de')).toMatchObject({ ok: true })
  })

  it('finds the JSON when the model adds chatter around it', () => {
    expect(parseModelOutput('Sure! Here you go: ' + json(german) + ' Enjoy.', 'de')).toMatchObject({
      ok: true,
    })
  })

  it('trims whitespace around sentences', () => {
    expect(parseModelOutput(json(['  Ich kann schwimmen.  ', 'Er muss lernen.\n']), 'de')).toEqual({
      ok: true,
      sentences: ['Ich kann schwimmen.', 'Er muss lernen.'],
    })
  })

  describe('rejects', () => {
    const reason = (raw: unknown, language: 'en' | 'de' = 'de') => {
      const result = parseModelOutput(raw, language)
      return result.ok ? 'ok' : result.reason
    }

    it('a refusal or other text that is not JSON', () => {
      expect(reason('I am sorry, I can not do that.')).toBe('not-json')
      expect(reason('')).toBe('not-json')
      expect(reason(null)).toBe('not-json')
      expect(reason(undefined)).toBe('not-json')
    })

    it('JSON of the wrong shape', () => {
      expect(reason('{"answer": "Ich kann schwimmen."}')).toBe('bad-shape')
      expect(reason('{"sentences": "Ich kann schwimmen."}')).toBe('bad-shape')
      expect(reason(json([1, 2]))).toBe('bad-shape')
      expect(reason(json([null, 'Er muss lernen.']))).toBe('bad-shape')
      expect(reason('42')).toBe('bad-shape')
    })

    it('the wrong number of sentences', () => {
      expect(reason(json(['Ich kann schwimmen.']))).toBe('wrong-count')
      expect(reason(json([...german, 'Wir wollen ins Kino gehen.']))).toBe('wrong-count')
      expect(reason(json([]))).toBe('wrong-count')
    })

    it('accepts the long sentences a Hard German answer has, which run past the 11 words that were asked for', () => {
      const long = 'Nachdem wir den Flughafen erreicht hatten, erfuhren wir leider von der langen Verspätung unseres Fluges'
      expect(parseModelOutput(json([long, 'Er muss lernen.']), 'de')).toMatchObject({ ok: true })
    })

    it('accepts a C2 German sentence that runs past what was asked for, which is more than 120 characters', () => {
      const long = 'Ungeachtet des außergewöhnlichen Andrangs bewahrten die erfahrenen Händler, deren Waren keineswegs alltäglich waren, stets eine gelassene Ruhe'
      expect(long.length).toBeGreaterThan(120)
      expect(parseModelOutput(json([long, 'Er muss lernen.']), 'de')).toMatchObject({ ok: true })
    })

    it('sentences that are too short or too long', () => {
      expect(reason(json(['Ich', 'Er muss lernen.']))).toBe('bad-length')
      expect(reason(json([Array(23).fill('ich').join(' '), 'Er muss lernen.']))).toBe('bad-length')
      expect(reason(json(['Ich kann ' + 'x'.repeat(200), 'Er muss lernen.']))).toBe('bad-length')
      expect(reason(json(['   ', 'Er muss lernen.']))).toBe('bad-length')
    })

    it('links, markup and control characters', () => {
      expect(reason(json(['Ich sehe https://example.com heute.', 'Er muss lernen.']))).toBe('markup')
      expect(reason(json(['Ich sehe www.example.com heute.', 'Er muss lernen.']))).toBe('markup')
      expect(reason(json(['Ich kann <b>gut</b> schwimmen.', 'Er muss lernen.']))).toBe('markup')
      expect(reason(json(['Ich kann `gut` schwimmen.', 'Er muss lernen.']))).toBe('markup')
      expect(reason(json(['Ich kann gut\u0000 schwimmen.', 'Er muss lernen.']))).toBe('markup')
    })

    it('duplicates, ignoring case and spacing', () => {
      expect(reason(json(['Ich kann schwimmen.', 'ich kann  schwimmen.']))).toBe('duplicate')
    })

    it('sentences in the wrong language', () => {
      // What Llama 70B returned for German when the topic held an injection.
      const insults = ['You are very annoying', 'I do not like you']
      expect(reason(json(insults), 'de')).toBe('wrong-language')
      expect(reason(json(german), 'en')).toBe('wrong-language')
    })

    it('a single sentence in the wrong language among good ones', () => {
      expect(reason(json(['Ich kann gut schwimmen.', 'She can swim very well.']))).toBe('wrong-language')
    })
  })

  describe('language check', () => {
    it('accepts every German and English batch the model produced in the spike', () => {
      const batches: [string[], 'de' | 'en'][] = [
        [['Ich füttere meinen Drachen jeden Tag.', 'Mein Drache ist grün und blau.'], 'de'],
        [['Das Wetter ist schlecht, also bleiben wir zu Hause.', 'Sie geht einkaufen und kauft Brot.'], 'de'],
        [['Bringt mir bitte die Rechnung.', 'Haben Sie noch freien Tisch?'], 'de'],
        [['My dragon loves to play.', 'I feed my dragon every day.'], 'en'],
        [['Can I have a menu, please?', "I'll have the burger, please."], 'en'],
      ]
      for (const [sentences, language] of batches) {
        expect(parseModelOutput(json(sentences), language)).toMatchObject({ ok: true })
      }
    })

    it('does not reject sentences with no common words, since there is no evidence', () => {
      expect(parseModelOutput(json(['Pizza Margherita bitte', 'Kaffee Milch Zucker']), 'de')).toMatchObject({ ok: true })
    })
  })

  it('never throws, whatever it is given', () => {
    for (const raw of [{}, [], [[]], { sentences: {} }, 'null', '[', '{"sentences": [', Symbol.iterator, 7n]) {
      expect(() => parseModelOutput(raw, 'de')).not.toThrow()
    }
  })
})

describe('parseModelOutput with a count', () => {
  const five = ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.', 'Wir wollen heute ins Kino gehen.', 'Sie darf später schlafen.', 'Das ist mein bester Freund.']

  it('wants exactly the number of sentences asked for', () => {
    expect(parseModelOutput(json(five), 'de', 5)).toEqual({ ok: true, sentences: five })
    expect(parseModelOutput(json(five), 'de', 4)).toEqual({ ok: false, reason: 'wrong-count' })
    expect(parseModelOutput(json(five.slice(0, 1)), 'de', 1)).toMatchObject({ ok: true })
    expect(parseModelOutput(json(five.slice(0, 1)), 'de')).toEqual({ ok: false, reason: 'wrong-count' })
  })
})

describe('parseTranslatedOutput', () => {
  const pairs = [
    { text: 'Ich kann gut schwimmen.', translation: 'I can swim very well.' },
    { text: 'Er muss seine Hausaufgaben machen.', translation: 'He has to do his homework.' },
  ]

  it('splits the pairs into sentences and their translations, in order', () => {
    const expected = {
      ok: true,
      sentences: ['Ich kann gut schwimmen.', 'Er muss seine Hausaufgaben machen.'],
      translations: ['I can swim very well.', 'He has to do his homework.'],
    }
    expect(parseTranslatedOutput(json(pairs), 'de')).toEqual(expected)
    expect(parseTranslatedOutput({ sentences: pairs }, 'de')).toEqual(expected)
    expect(parseTranslatedOutput(pairs, 'de')).toEqual(expected)
    expect(parseTranslatedOutput('```json\n' + json(pairs) + '\n```', 'de')).toEqual(expected)
  })

  it('checks the count', () => {
    expect(parseTranslatedOutput(json(pairs), 'de', 3)).toEqual({ ok: false, reason: 'wrong-count' })
    expect(parseTranslatedOutput(json(pairs.slice(0, 1)), 'de', 1)).toMatchObject({ ok: true })
  })

  it('rejects items that are not a text with a translation', () => {
    for (const bad of [['Ich kann gut schwimmen.', 'Er muss gehen.'], [{ text: 'Ich kann gut schwimmen.' }, pairs[1]], [{ text: 1, translation: 2 }, pairs[1]], [null, pairs[1]]]) {
      expect(parseTranslatedOutput(json(bad), 'de'), JSON.stringify(bad)).toEqual({ ok: false, reason: 'bad-shape' })
    }
    expect(parseTranslatedOutput('no json here', 'de')).toEqual({ ok: false, reason: 'not-json' })
    expect(parseTranslatedOutput(json({ no: 'list' }), 'de')).toEqual({ ok: false, reason: 'bad-shape' })
  })

  it('wants the sentences in the language asked for and the translations in the other one', () => {
    const swapped = pairs.map(({ text, translation }) => ({ text: translation, translation: text }))
    expect(parseTranslatedOutput(json(swapped), 'de')).toEqual({ ok: false, reason: 'wrong-language' })
    expect(parseTranslatedOutput(json(swapped), 'en')).toMatchObject({ ok: true })
    const sameLanguage = pairs.map(({ text }) => ({ text, translation: text.replace('.', '!') }))
    expect(parseTranslatedOutput(json(sameLanguage), 'de')).toEqual({ ok: false, reason: 'wrong-language' })
  })

  it('applies the same checks to translations as to sentences', () => {
    const withLink = [{ ...pairs[0], translation: 'I can swim, see http://example.com now' }, pairs[1]]
    expect(parseTranslatedOutput(json(withLink), 'de')).toEqual({ ok: false, reason: 'markup' })
    const tooShort = [{ ...pairs[0], translation: 'Yes.' }, pairs[1]]
    expect(parseTranslatedOutput(json(tooShort), 'de')).toEqual({ ok: false, reason: 'bad-length' })
    const repeated = [pairs[0], { ...pairs[1], translation: pairs[0].translation }]
    expect(parseTranslatedOutput(json(repeated), 'de')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('never throws, whatever it is given', () => {
    for (const raw of [undefined, null, 5, {}, [], '', '{', [[]], { sentences: [[]] }]) {
      expect(() => parseTranslatedOutput(raw, 'de')).not.toThrow()
    }
  })
})
