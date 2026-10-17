import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerLanguages } from '../content/types'
import { createMemoryNetwork } from '../test/memoryNetwork'
import type { Connection } from './network'
import { PING_INTERVAL_MS, SILENCE_LIMIT_MS } from './heartbeat'
import type { RoomState } from './protocol'
import { useGuestSession } from './useGuestSession'

const saved: PlayerLanguages = { knows: 'en', learns: 'de' }

const lobby = (topic: string): RoomState => ({
  host: { knows: 'de', learns: 'en' },
  guest: { knows: 'en', learns: 'de' },
  writing: { topic, busy: true, error: null },
  round: null,
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

/**
 * A room whose host sends its current state to every guest that joins, and answers pings unless told not to.
 * `connections` counts the guests' joins; `messages` is what the host received on any of them.
 */
async function hostedRoom({ answersPings = true } = {}) {
  const network = createMemoryNetwork()
  const room = await network.createRoom()
  const connections: Connection[] = []
  const messages: { type: string }[] = []
  const behaviour = { answersPings, state: lobby('first') }
  room.onConnection((connection) => {
    connections.push(connection)
    connection.onMessage((raw) => {
      const message = raw as { type: string }
      messages.push(message)
      if (message.type === 'ping' && behaviour.answersPings) connection.send({ type: 'pong' })
      if (message.type === 'hello') connection.send({ type: 'state', state: behaviour.state })
    })
  })
  return { network, code: room.code, connections, messages, behaviour }
}

async function joined(options?: Parameters<typeof hostedRoom>[0]) {
  const hosted = await hostedRoom(options)
  const statuses: string[] = []
  const hook = renderHook(() => {
    const session = useGuestSession(hosted.network, hosted.code, saved)
    statuses.push(session.status)
    return session
  })
  await advance(0)
  return { ...hosted, hook, statuses }
}

const pings = (messages: { type: string }[]) => messages.filter((message) => message.type === 'ping').length

describe('useGuestSession heartbeat', () => {
  it('pings the host as soon as it is connected, so a host that dies in the first seconds is noticed too', async () => {
    const { messages } = await joined()

    expect(pings(messages)).toBe(1)
  })

  it('keeps pinging the host regularly', async () => {
    const { messages } = await joined()

    await advance(PING_INTERVAL_MS * 3)

    expect(pings(messages)).toBe(1 + 3)
  })

  it('stays on its connection while the host keeps answering', async () => {
    const { hook, connections } = await joined()

    await advance(SILENCE_LIMIT_MS * 10)

    expect(connections).toHaveLength(1)
    expect(hook.result.current.status).toBe('connected')
  })

  it('joins again by itself when a host that answered goes silent, and shows what the host says now', async () => {
    const { hook, network, code, connections, behaviour, statuses } = await joined()
    expect(hook.result.current.room?.writing?.topic).toBe('first')

    network.stall(code) // the host's device fell asleep: no message arrives, nothing closes
    behaviour.state = lobby('second') // what it says by the time the guest is back
    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2)

    expect(connections).toHaveLength(2)
    expect(hook.result.current.status).toBe('connected')
    expect(hook.result.current.room?.writing?.topic).toBe('second')
    expect(statuses).not.toContain('lost') // the guest never saw an error screen
  })

  it('sends the guest\'s moves on the new connection after joining again', async () => {
    const { hook, network, code, connections, messages } = await joined()
    network.stall(code)
    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2)
    expect(connections).toHaveLength(2)
    messages.length = 0

    act(() => hook.result.current.nextTurn())
    await advance(0)

    expect(messages).toContainEqual({ type: 'next-turn' })
  })

  it('does not join again when the host never answered a ping, like a host on an older version of the game', async () => {
    const { hook, connections } = await joined({ answersPings: false })

    await advance(SILENCE_LIMIT_MS * 10)

    expect(connections).toHaveLength(1)
    expect(hook.result.current.status).toBe('connected')
  })

  it('still reports a lost connection when the host closes it, and does not join again', async () => {
    const { hook, connections } = await joined()

    act(() => connections[0].close())
    await advance(0)
    expect(hook.result.current.status).toBe('lost')

    await advance(SILENCE_LIMIT_MS * 10)
    expect(connections).toHaveLength(1)
  })

  it('reports the problem when it cannot join again', async () => {
    const { hook, network, code } = await joined()
    network.stall(code)
    network.unavailable = true

    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2)

    expect(hook.result.current.status).toBe('unavailable')
  })

  it('checks at once when the tab comes back to the front, instead of waiting for the next tick', async () => {
    const { hook, network, code, connections } = await joined()
    network.stall(code)

    // The tab was frozen: time passed but no timer ran.
    vi.setSystemTime(Date.now() + SILENCE_LIMIT_MS * 4)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await advance(0)

    expect(connections).toHaveLength(2)
    expect(hook.result.current.status).toBe('connected')
  })

  it('stops pinging and joining when the guest leaves', async () => {
    const { hook, network, code, connections, messages } = await joined()
    hook.unmount()
    await advance(0)
    const before = pings(messages)
    network.stall(code)

    await advance(SILENCE_LIMIT_MS * 10)

    expect(pings(messages)).toBe(before)
    expect(connections).toHaveLength(1)
  })

  it('closes a join that was still on its way when the guest left, without saying hello on it', async () => {
    const { hook, network, code, messages } = await joined()
    const realJoin = network.join.bind(network)
    let finishJoin = () => {}
    network.join = (joinCode) =>
      new Promise((resolve, reject) => {
        finishJoin = () => realJoin(joinCode).then(resolve, reject)
      })
    network.stall(code)
    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2) // the guest is joining again, and that has not finished

    hook.unmount()
    const before = messages.length
    finishJoin()
    await advance(SILENCE_LIMIT_MS * 10)

    expect(messages).toHaveLength(before)
  })
})
