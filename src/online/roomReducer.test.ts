import { describe, expect, it } from 'vitest'
import type { Turn } from '../game/buildTurns'
import { createRoom, roomReducer } from './roomReducer'

const turns: Turn[] = [
  { player: 1, sentence: { id: 'a', text: 'a', translation: 'a!' }, learning: 'en' },
  { player: 2, sentence: { id: 'b', text: 'b', translation: 'b!' }, learning: 'de' },
]

const host = { knows: 'en', learns: 'de' } as const
const guest = { knows: 'de', learns: 'en' } as const
const hello = { type: 'GUEST_HELLO', languages: guest } as const

const joined = roomReducer(createRoom(host), hello)
const playing = roomReducer(joined, { type: 'START_ROUND', topic: 'modal-verbs', turns })

describe('createRoom', () => {
  it('starts with only the host in it', () => {
    expect(createRoom(host)).toEqual({ host, guest: null, round: null, writing: null })
  })
})

describe('a room that already knows its first topic', () => {
  it("starts with that topic's sentences on the way, so the joining guest never sees an empty room", () => {
    const room = createRoom(host, 'weather')
    expect(room.writing).toEqual({ topic: 'weather', busy: true, error: null })
    expect(roomReducer(room, hello).writing).toEqual(room.writing)
  })

  it('starts out as a failed request when the host cannot generate sentences at all', () => {
    expect(createRoom(host, 'weather', false).writing).toEqual({ topic: 'weather', busy: false, error: 'unavailable' })
  })

  it('lets the real state replace it, and clears it like any other', () => {
    const joinedRoom = roomReducer(createRoom(host, 'weather'), hello)
    expect(roomReducer(joinedRoom, { type: 'WRITING_CLOSED' }).writing).toBeNull()
  })
})

describe('GUEST_HELLO', () => {
  it('gives the guest the languages they saved when they match the host in either way', () => {
    expect(joined.guest).toEqual(guest)
    const same = roomReducer(createRoom(host), { type: 'GUEST_HELLO', languages: host })
    expect(same.guest).toEqual(host)
  })

  it('has the guest speak what the host learns when they saved nothing', () => {
    expect(roomReducer(createRoom(host), { type: 'GUEST_HELLO', languages: null }).guest).toEqual(guest)
  })

  it("uses the host's languages for a guest whose own match neither way", () => {
    const odd = { knows: 'en', learns: 'en' } as const
    expect(roomReducer(createRoom(host), { type: 'GUEST_HELLO', languages: odd }).guest).toEqual(guest)
  })

  it('ignores a second hello once the game has been decided, even with different languages', () => {
    expect(roomReducer(joined, { type: 'GUEST_HELLO', languages: host })).toBe(joined)
    expect(roomReducer(joined, { type: 'GUEST_HELLO', languages: null })).toBe(joined)
  })
})

describe('START_ROUND', () => {
  it('starts a round on the first turn', () => {
    expect(playing.round).toEqual({
      topic: 'modal-verbs',
      game: { turns, index: 0, status: 'playing', revealed: false },
    })
  })

  it('needs a guest first', () => {
    const room = createRoom(host)
    expect(roomReducer(room, { type: 'START_ROUND', topic: 't', turns })).toBe(room)
  })

  it('ignores a round with no turns', () => {
    expect(roomReducer(joined, { type: 'START_ROUND', topic: 't', turns: [] })).toBe(joined)
  })
})

describe('NEXT_TURN', () => {
  it('lets the player whose turn it is move on', () => {
    const next = roomReducer(playing, { type: 'NEXT_TURN', from: 1 })
    expect(next.round?.game.index).toBe(1)
  })

  it("ignores a player moving on during the other player's turn", () => {
    expect(roomReducer(playing, { type: 'NEXT_TURN', from: 2 })).toBe(playing)
  })

  it('finishes the round after the last turn', () => {
    let room = roomReducer(playing, { type: 'NEXT_TURN', from: 1 })
    room = roomReducer(room, { type: 'NEXT_TURN', from: 2 })
    expect(room.round?.game.status).toBe('finished')
  })

  it('ignores moves once the round is finished', () => {
    let room = roomReducer(playing, { type: 'NEXT_TURN', from: 1 })
    room = roomReducer(room, { type: 'NEXT_TURN', from: 2 })
    expect(roomReducer(room, { type: 'NEXT_TURN', from: 1 })).toBe(room)
  })

  it('ignores moves when there is no round', () => {
    expect(roomReducer(joined, { type: 'NEXT_TURN', from: 1 })).toBe(joined)
  })
})

describe('PREVIOUS_TURN', () => {
  it("lets the host go back during either player's turn", () => {
    const second = roomReducer(playing, { type: 'NEXT_TURN', from: 1 })
    expect(second.round?.game.turns[1].player).toBe(2)
    expect(roomReducer(second, { type: 'PREVIOUS_TURN' }).round?.game.index).toBe(0)
  })

  it('reopens the last turn after the round has finished', () => {
    let room = roomReducer(playing, { type: 'NEXT_TURN', from: 1 })
    room = roomReducer(room, { type: 'NEXT_TURN', from: 2 })
    expect(roomReducer(room, { type: 'PREVIOUS_TURN' }).round?.game).toMatchObject({ index: 1, status: 'playing' })
  })

  it('ignores going back on the first turn', () => {
    expect(roomReducer(playing, { type: 'PREVIOUS_TURN' })).toBe(playing)
  })

  it('ignores going back when there is no round', () => {
    expect(roomReducer(joined, { type: 'PREVIOUS_TURN' })).toBe(joined)
  })
})

describe('CHANGE_TOPIC', () => {
  it('goes back to topic choice and keeps both languages', () => {
    const room = roomReducer(playing, { type: 'CHANGE_TOPIC' })
    expect(room).toEqual({ host, guest, round: null, writing: null })
  })
})

describe('REVEAL', () => {
  const revealed = (room: typeof joined) => room.round?.game.revealed

  it('shows the translation when the player whose turn it is asks', () => {
    expect(revealed(roomReducer(playing, { type: 'REVEAL', from: 1 }))).toBe(true)
  })

  it("ignores the other player's request", () => {
    expect(roomReducer(playing, { type: 'REVEAL', from: 2 })).toBe(playing)
  })

  it('ignores a request when there is no round', () => {
    expect(roomReducer(joined, { type: 'REVEAL', from: 1 })).toBe(joined)
  })

  it('hides it again when the game moves on', () => {
    const shown = roomReducer(playing, { type: 'REVEAL', from: 1 })
    expect(revealed(roomReducer(shown, { type: 'NEXT_TURN', from: 1 }))).toBe(false)
  })
})

describe('writing the sentences', () => {
  const update = { type: 'WRITING_UPDATED', topic: 'greetings', busy: true, error: null } as const
  const writing = roomReducer(joined, update)

  describe('WRITING_UPDATED', () => {
    it('shows what is happening to the sentences', () => {
      expect(writing.writing).toEqual({ topic: 'greetings', busy: true, error: null })
    })

    it('says what went wrong when writing failed', () => {
      const failed = roomReducer(writing, { ...update, busy: false, error: 'limit-reached' })
      expect(failed.writing).toEqual({ topic: 'greetings', busy: false, error: 'limit-reached' })
    })

    it('follows a new topic', () => {
      expect(roomReducer(writing, { ...update, topic: 'weather' }).writing?.topic).toBe('weather')
    })

    it('needs a guest first, and does nothing once a round is running', () => {
      const alone = createRoom(host)
      expect(roomReducer(alone, update)).toBe(alone)
      expect(roomReducer(playing, update)).toBe(playing)
    })

    it('keeps the state as it is when nothing changed', () => {
      expect(roomReducer(writing, update)).toBe(writing)
    })
  })

  describe('WRITING_CLOSED and CHANGE_TOPIC', () => {
    it('both leave the writing screen for everyone', () => {
      expect(roomReducer(writing, { type: 'WRITING_CLOSED' }).writing).toBeNull()
      expect(roomReducer(writing, { type: 'CHANGE_TOPIC' }).writing).toBeNull()
    })

    it('closing when nothing is being written changes nothing', () => {
      expect(roomReducer(joined, { type: 'WRITING_CLOSED' })).toBe(joined)
    })
  })

  describe('START_ROUND', () => {
    it('ends the writing screen as the round starts', () => {
      const started = roomReducer(writing, { type: 'START_ROUND', topic: 'greetings', turns })
      expect(started.writing).toBeNull()
      expect(started.round?.topic).toBe('greetings')
    })

    it('does not start the round for a room with no guest or no turns, and keeps the writing state', () => {
      expect(roomReducer(writing, { type: 'START_ROUND', topic: 'greetings', turns: [] })).toBe(writing)
      const alone = createRoom(host, 'weather')
      expect(roomReducer(alone, { type: 'START_ROUND', topic: 'weather', turns })).toBe(alone)
    })
  })
})
