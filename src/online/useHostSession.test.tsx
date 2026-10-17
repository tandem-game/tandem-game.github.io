import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerLanguages } from '../content/types'
import { createMemoryNetwork } from '../test/memoryNetwork'
import { PING_INTERVAL_MS, SILENCE_LIMIT_MS } from './heartbeat'
import { useHostSession } from './useHostSession'

const hostLanguages: PlayerLanguages = { knows: 'de', learns: 'en' }

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

/** A room with a guest who has joined and said hello, seen from the guest's side. */
async function joined() {
  const network = createMemoryNetwork()
  const hook = renderHook(() => useHostSession(network, hostLanguages))
  await advance(0)
  const code = hook.result.current.code
  if (code === null) throw new Error('the room did not open')
  const guest = await network.join(code)
  const received: unknown[] = []
  guest.onMessage((message) => received.push(message))
  guest.send({ type: 'hello', languages: null })
  await advance(0)
  return { network, code, hook, guest, received }
}

describe('useHostSession heartbeat', () => {
  it('answers a ping with a pong', async () => {
    const { guest, received } = await joined()

    guest.send({ type: 'ping' })
    await advance(0)

    expect(received).toContainEqual({ type: 'pong' })
  })

  it('shows a guest who pinged before and then went silent as gone', async () => {
    const { hook, code, network, guest } = await joined()
    guest.send({ type: 'ping' })
    await advance(0)
    expect(hook.result.current.partnerConnected).toBe(true)

    network.stall(code)
    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2)

    expect(hook.result.current.partnerConnected).toBe(false)
  })

  it('keeps a guest who keeps pinging', async () => {
    const { hook, guest } = await joined()

    for (let elapsed = 0; elapsed < SILENCE_LIMIT_MS * 4; elapsed += PING_INTERVAL_MS) {
      guest.send({ type: 'ping' })
      await advance(PING_INTERVAL_MS)
    }

    expect(hook.result.current.partnerConnected).toBe(true)
  })

  it('keeps a guest who never pings, like one on an older version of the game', async () => {
    const { hook } = await joined()

    await advance(SILENCE_LIMIT_MS * 10)

    expect(hook.result.current.partnerConnected).toBe(true)
  })

  it('does not close the link of a silent guest, which could only tell them to give up', async () => {
    const { code, network, guest } = await joined()
    let closed = false
    guest.onClose(() => {
      closed = true
    })
    guest.send({ type: 'ping' })
    await advance(0)

    network.stall(code)
    await advance(SILENCE_LIMIT_MS * 3)
    network.stall(code, false)
    await advance(0)

    expect(closed).toBe(false)
  })

  it('takes a silent guest back on the same link, and sends them the game as it is now', async () => {
    const { hook, code, network, guest, received } = await joined()
    guest.send({ type: 'ping' })
    await advance(0)
    network.stall(code)
    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2)
    expect(hook.result.current.partnerConnected).toBe(false)
    received.length = 0

    network.stall(code, false) // the guest's device woke up
    guest.send({ type: 'ping' })
    await advance(0)

    expect(hook.result.current.partnerConnected).toBe(true)
    expect(received).toContainEqual(expect.objectContaining({ type: 'state' }))
  })

  it('takes the guest back on a new connection after they were silent', async () => {
    const { hook, code, network, guest } = await joined()
    guest.send({ type: 'ping' })
    await advance(0)
    network.stall(code)
    await advance(SILENCE_LIMIT_MS + PING_INTERVAL_MS * 2)
    expect(hook.result.current.partnerConnected).toBe(false)

    const returning = await network.join(code)
    const received: unknown[] = []
    returning.onMessage((message) => received.push(message))
    returning.send({ type: 'hello', languages: null })
    await advance(0)

    expect(hook.result.current.partnerConnected).toBe(true)
    expect(received).toContainEqual(expect.objectContaining({ type: 'state' }))
  })
})
