import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SETTINGS_VERSION,
  SETTING_ADDED_IN,
  loadHostDefaults,
  loadLastTopic,
  loadSettingsStatus,
  saveHostDefaults,
  saveLastTopic,
  suggestHostDefaults,
} from './hostPreferences'

const defaults = { knows: 'de', learns: 'en', options: { count: 4, difficulty: 'hard' } } as const

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('host defaults', () => {
  it('are empty until saved', () => {
    expect(loadHostDefaults()).toBeNull()
  })

  it('round-trip', () => {
    saveHostDefaults(defaults)
    expect(loadHostDefaults()).toEqual(defaults)
  })

  it('saved before translations became automatic still load, without the old flag', () => {
    localStorage.setItem('tandem.hostDefaults.v2', JSON.stringify({ ...defaults, options: { ...defaults.options, translate: false } }))
    expect(loadHostDefaults()).toEqual(defaults)
  })

  it('saved while there was a review setting still load, without it', () => {
    localStorage.setItem('tandem.hostDefaults.v2', JSON.stringify({ ...defaults, options: { ...defaults.options, review: true } }))
    expect(loadHostDefaults()).toEqual(defaults)
    expect(loadSettingsStatus()).toEqual({ kind: 'complete', defaults })
  })

  it('ignore a review flag of any kind, since there is no review any more', () => {
    for (const review of ['no', 1, null]) {
      localStorage.setItem('tandem.hostDefaults.v2', JSON.stringify({ ...defaults, options: { ...defaults.options, review } }))
      expect(loadHostDefaults()).toEqual(defaults)
    }
  })

  it('save without a review flag', () => {
    saveHostDefaults(defaults)
    expect(JSON.parse(localStorage.getItem('tandem.hostDefaults.v2') ?? '{}').options).toEqual(defaults.options)
  })

  it.each([
    ['not JSON', 'nope'],
    ['not an object', '"x"'],
    ['null', 'null'],
    ['an unknown language', JSON.stringify({ ...defaults, knows: 'fr' })],
    ['an unknown learning language', JSON.stringify({ ...defaults, learns: 'fr' })],
    ['no learning language', JSON.stringify({ knows: 'de', options: defaults.options })],
    ['the same language to speak and to learn', JSON.stringify({ ...defaults, learns: 'de' })],
    ['a count below the minimum', JSON.stringify({ ...defaults, options: { ...defaults.options, count: 0 } })],
    ['a count above the maximum', JSON.stringify({ ...defaults, options: { ...defaults.options, count: 6 } })],
    ['a fractional count', JSON.stringify({ ...defaults, options: { ...defaults.options, count: 2.5 } })],
    ['an unknown difficulty', JSON.stringify({ ...defaults, options: { ...defaults.options, difficulty: 'insane' } })],
    ['missing options', JSON.stringify({ knows: 'en' })],
  ])('are ignored when the stored value is %s', (_, stored) => {
    localStorage.setItem('tandem.hostDefaults.v2', stored)
    expect(loadHostDefaults()).toBeNull()
  })

  it('drop unknown fields', () => {
    localStorage.setItem('tandem.hostDefaults.v2', JSON.stringify({ ...defaults, extra: 1 }))
    expect(loadHostDefaults()).toEqual(defaults)
  })

  it('survive storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadHostDefaults()).toBeNull()
    expect(() => saveHostDefaults(defaults)).not.toThrow()
  })
})

describe('settings status', () => {
  const store = (value: unknown) => localStorage.setItem('tandem.hostDefaults.v2', JSON.stringify(value))

  it('is none on a first visit and when what is stored is not an object', () => {
    expect(loadSettingsStatus()).toEqual({ kind: 'none' })
    for (const stored of ['nope', 'null', '"x"', '[1]']) {
      localStorage.setItem('tandem.hostDefaults.v2', stored)
      expect(loadSettingsStatus()).toEqual({ kind: 'none' })
    }
  })

  it('is complete for a full save, whether or not it has a version', () => {
    saveHostDefaults(defaults)
    expect(loadSettingsStatus()).toEqual({ kind: 'complete', defaults })
    store(defaults)
    expect(loadSettingsStatus()).toEqual({ kind: 'complete', defaults })
  })

  it('keeps what is usable and says what is missing', () => {
    store({ knows: 'de', options: { count: 4 } })
    expect(loadSettingsStatus()).toEqual({
      kind: 'incomplete',
      draft: { knows: 'de', learns: '', options: { count: 4, difficulty: 'medium' } },
      missing: ['learns', 'difficulty'],
      fresh: [],
    })
  })

  it('has no saved options at all when the options are missing', () => {
    store({ knows: 'en', learns: 'de' })
    expect(loadSettingsStatus()).toMatchObject({ kind: 'incomplete', missing: ['count', 'difficulty'] })
  })

  it('keeps the language to speak when both are the same, and asks for the other', () => {
    store({ ...defaults, learns: 'de' })
    expect(loadSettingsStatus()).toMatchObject({ kind: 'incomplete', draft: { knows: 'de', learns: '' }, missing: ['learns'] })
  })

  describe('when a setting is added later', () => {
    const addedInTwo = { difficulty: 2 } as const

    it('is incomplete, with the new setting listed and everything else kept, for a save from before it', () => {
      store(defaults) // no version: version 1
      expect(loadSettingsStatus(addedInTwo)).toEqual({ kind: 'incomplete', draft: defaults, missing: [], fresh: ['difficulty'] })
      store({ version: 1, ...defaults })
      expect(loadSettingsStatus(addedInTwo)).toMatchObject({ kind: 'incomplete', fresh: ['difficulty'] })
    })

    it('is complete once saved by an app that has it, so they are asked only once', () => {
      store({ version: 2, ...defaults })
      expect(loadSettingsStatus(addedInTwo)).toEqual({ kind: 'complete', defaults })
    })

    it('does not ask about a setting the player has to fill in anyway twice', () => {
      store({ knows: 'de', learns: 'en', options: { difficulty: 'easy' } })
      expect(loadSettingsStatus({ count: 2 })).toMatchObject({ missing: ['count'], fresh: [] })
    })

    it('keeps the game from starting until the new setting is confirmed', () => {
      store(defaults)
      expect(loadSettingsStatus(addedInTwo).kind).toBe('incomplete')
    })

    it('treats a version that is not a whole number from 1 as 1', () => {
      for (const version of [0, -1, 1.5, '2', null]) {
        store({ version, ...defaults })
        expect(loadSettingsStatus(addedInTwo)).toMatchObject({ kind: 'incomplete', fresh: ['difficulty'] })
      }
    })
  })

  it('never lists a setting as added in a version the app does not have yet, which would ask again after every save', () => {
    expect(Object.values(SETTING_ADDED_IN).every((version) => version <= SETTINGS_VERSION)).toBe(true)
  })

  it('writes the current version when saving', () => {
    saveHostDefaults(defaults)
    expect(JSON.parse(localStorage.getItem('tandem.hostDefaults.v2') ?? '{}')).toMatchObject({ version: SETTINGS_VERSION })
  })
})

describe('last topic', () => {
  it('is empty until saved', () => {
    expect(loadLastTopic()).toBeNull()
  })

  it('round-trips a preset id or custom text', () => {
    saveLastTopic('weather')
    expect(loadLastTopic()).toBe('weather')
    saveLastTopic('my pet dragon')
    expect(loadLastTopic()).toBe('my pet dragon')
  })

  it('is ignored when blank or longer than a topic may be', () => {
    localStorage.setItem('tandem.lastTopic.v1', '   ')
    expect(loadLastTopic()).toBeNull()
    localStorage.setItem('tandem.lastTopic.v1', 'x'.repeat(61))
    expect(loadLastTopic()).toBeNull()
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadLastTopic()).toBeNull()
    expect(() => saveLastTopic('weather')).not.toThrow()
  })
})

describe('suggested host defaults', () => {
  it('have a German browser speak German and learn English', () => {
    expect(suggestHostDefaults('de-AT')).toMatchObject({ knows: 'de', learns: 'en' })
  })

  it('have any other browser speak English and learn German', () => {
    expect(suggestHostDefaults('fr-FR')).toMatchObject({ knows: 'en', learns: 'de' })
    expect(suggestHostDefaults('')).toMatchObject({ knows: 'en', learns: 'de' })
  })
})
