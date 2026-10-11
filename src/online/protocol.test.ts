import { describe, expect, it } from 'vitest'
import { parseGuestMessage, parseHostMessage, type RoomState } from './protocol'

const roomState: RoomState = {
  host: { knows: 'en', learns: 'de' },
  guest: { knows: 'de', learns: 'en' },
  writing: null,
  round: {
    topic: 'modal-verbs',
    game: {
      turns: [
        { player: 1, sentence: { id: 'a', text: 'Ich kann schwimmen.', translation: 'I can swim.' }, learning: 'en' },
        { player: 2, sentence: { id: 'b', text: 'I can swim.', translation: 'Ich kann schwimmen.' }, learning: 'de' },
      ],
      index: 1,
      status: 'playing',
      revealed: false,
    },
  },
}

const withRound = (change: Record<string, unknown>) => ({
  ...roomState,
  round: { ...roomState.round, game: { ...roomState.round!.game, ...change } },
})

describe('parseGuestMessage', () => {
  it('accepts reveal', () => {
    expect(parseGuestMessage({ type: 'reveal', extra: 'x' })).toEqual({ type: 'reveal' })
  })

  it('no longer knows confirm or regenerate, which only the host acts on now', () => {
    expect(parseGuestMessage({ type: 'confirm' })).toBeNull()
    expect(parseGuestMessage({ type: 'regenerate' })).toBeNull()
  })

  it('accepts next-turn and drops unexpected fields', () => {
    expect(parseGuestMessage({ type: 'next-turn', extra: 'x' })).toEqual({ type: 'next-turn' })
  })

  describe('hello', () => {
    it('carries the languages the guest saved', () => {
      expect(parseGuestMessage({ type: 'hello', languages: { knows: 'de', learns: 'en', extra: 'x' } })).toEqual({
        type: 'hello',
        languages: { knows: 'de', learns: 'en' },
      })
    })

    it.each([
      ['no languages', { type: 'hello' }],
      ['only one language', { type: 'hello', languages: { knows: 'de' } }],
      ['an unknown language', { type: 'hello', languages: { knows: 'de', learns: 'xx' } }],
      ['languages that are not text', { type: 'hello', languages: { knows: 1, learns: {} } }],
      ['languages that are not an object', { type: 'hello', languages: 'de' }],
      ['the same language twice', { type: 'hello', languages: { knows: 'de', learns: 'de' } }],
    ])('is accepted with no languages when it has %s', (_name, raw) => {
      expect(parseGuestMessage(raw)).toEqual({ type: 'hello', languages: null })
    })
  })

  it.each([
    [{ type: 'explode' }],
    [{}],
    ['next-turn'],
    [null],
    [undefined],
    [42],
    [[]],
  ])('rejects %j', (raw) => {
    expect(parseGuestMessage(raw)).toBeNull()
  })
})

describe('parseHostMessage', () => {
  it('accepts a full room state', () => {
    expect(parseHostMessage({ type: 'state', state: roomState })).toEqual({
      type: 'state',
      state: roomState,
    })
  })

  it('keeps a translation and the reveal flag', () => {
    const state = withRound({
      turns: [{ player: 1, sentence: { id: 'a', text: 'Ich kann schwimmen.', translation: 'I can swim.' }, learning: 'en' }],
      index: 0,
      revealed: true,
    })
    expect(parseHostMessage({ type: 'state', state })).toEqual({ type: 'state', state })
  })

  it('drops unexpected fields from a sentence', () => {
    const turn = { player: 1, sentence: { id: 'a', text: 'x', translation: 'y', answer: 'z' }, learning: 'en' }
    const parsed = parseHostMessage({ type: 'state', state: withRound({ turns: [turn], index: 0 }) })
    expect(parsed?.state.round?.game.turns[0].sentence).toEqual({ id: 'a', text: 'x', translation: 'y' })
  })

  it('accepts a state where both players read and learn the same languages', () => {
    const same = { ...roomState, guest: roomState.host }
    expect(parseHostMessage({ type: 'state', state: same })).toEqual({ type: 'state', state: same })
  })

  it('accepts a lobby state with no guest and no round', () => {
    const lobby = { host: { knows: 'en', learns: 'de' }, guest: null, round: null, writing: null }
    expect(parseHostMessage({ type: 'state', state: lobby })).toEqual({ type: 'state', state: lobby })
  })

  it('rejects a state with no writing field, which every host sends', () => {
    const { writing: _writing, ...without } = roomState
    expect(parseHostMessage({ type: 'state', state: without })).toBeNull()
  })

  describe('sentences being written', () => {
    const writing = { topic: 'greetings', busy: true, error: null }
    const writingState = (change: Record<string, unknown>) => ({ ...roomState, writing: { ...writing, ...change } })

    it('is accepted with any known error', () => {
      const state = writingState({ error: 'limit-reached', busy: false })
      expect(parseHostMessage({ type: 'state', state })).toEqual({ type: 'state', state })
    })

    it('drops unexpected fields from it', () => {
      const parsed = parseHostMessage({ type: 'state', state: writingState({ secret: 'x', turns: [] }) })
      expect(parsed?.state.writing).toEqual(writing)
    })

    it.each([
      ['a writing state that is not an object', { ...roomState, writing: 'yes' }],
      ['no topic', writingState({ topic: '' })],
      ['a very long topic', writingState({ topic: 'x'.repeat(301) })],
      ['a busy flag that is not a boolean', writingState({ busy: 'yes' })],
      ['an error that does not exist', writingState({ error: 'boom' })],
      ['a missing error', writingState({ error: undefined })],
    ])('rejects %s', (_name, state) => {
      expect(parseHostMessage({ type: 'state', state })).toBeNull()
    })
  })

  it.each([
    ['an unknown host language', { ...roomState, host: { knows: 'xx', learns: 'de' } }],
    ['a host who reads and learns the same language', { ...roomState, host: { knows: 'en', learns: 'en' } }],
    ['no host languages', { ...roomState, host: undefined }],
    ['an unknown guest language', { ...roomState, guest: { knows: 'de', learns: 'xx' } }],
    ['a guest who reads and learns the same language', { ...roomState, guest: { knows: 'de', learns: 'de' } }],
    ['a guest that is neither languages nor null', { ...roomState, guest: 'de' }],
    ['a missing guest', { host: roomState.host, round: null }],
    ['a game status that does not exist', withRound({ status: 'paused' })],
    ['a turn index past the end', withRound({ index: 2 })],
    ['a game in progress with no turns', withRound({ turns: [], index: 0 })],
    ['a negative turn index', withRound({ index: -1 })],
    ['a fractional turn index', withRound({ index: 0.5 })],
    ['a player that is not 1 or 2', withRound({ turns: [{ player: 3, sentence: { id: 'a', text: 'x' }, learning: 'en' }], index: 0 })],
    ['a sentence without text', withRound({ turns: [{ player: 1, sentence: { id: 'a', text: '  ' }, learning: 'en' }], index: 0 })],
    ['a very long sentence', withRound({ turns: [{ player: 1, sentence: { id: 'a', text: 'x'.repeat(301) }, learning: 'en' }], index: 0 })],
    ['a game without its reveal flag', withRound({ revealed: undefined })],
    ['a reveal flag that is not a boolean', withRound({ revealed: 'yes' })],
    ['a sentence without a translation', withRound({ turns: [{ player: 1, sentence: { id: 'a', text: 'x' }, learning: 'en' }], index: 0 })],
    ['a translation that is not text', withRound({ turns: [{ player: 1, sentence: { id: 'a', text: 'x', translation: 5 }, learning: 'en' }], index: 0 })],
    ['a very long translation', withRound({ turns: [{ player: 1, sentence: { id: 'a', text: 'x', translation: 'x'.repeat(301) }, learning: 'en' }], index: 0 })],
    ['too many turns', withRound({ turns: Array.from({ length: 21 }, () => ({ player: 1, sentence: { id: 'a', text: 'x' }, learning: 'en' })), index: 0 })],
  ])('rejects a state with %s', (_name, state) => {
    expect(parseHostMessage({ type: 'state', state })).toBeNull()
  })

  it.each([[{ type: 'state' }], [{ type: 'nope', state: roomState }], ['state'], [null]])(
    'rejects %j',
    (raw) => {
      expect(parseHostMessage(raw)).toBeNull()
    },
  )
})
