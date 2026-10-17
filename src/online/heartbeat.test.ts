import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PING_INTERVAL_MS, SILENCE_LIMIT_MS, startHeartbeat } from './heartbeat'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startHeartbeat', () => {
  it('pings every interval until stopped', () => {
    const ping = vi.fn()
    const heartbeat = startHeartbeat({ ping, onSilent: vi.fn() })

    vi.advanceTimersByTime(PING_INTERVAL_MS * 3)
    expect(ping).toHaveBeenCalledTimes(3)

    heartbeat.stop()
    vi.advanceTimersByTime(PING_INTERVAL_MS * 3)
    expect(ping).toHaveBeenCalledTimes(3)
  })

  it('reports silence once the other side answered before but has been quiet for too long', () => {
    const onSilent = vi.fn()
    const heartbeat = startHeartbeat({ onSilent })
    heartbeat.heard(true)

    vi.advanceTimersByTime(SILENCE_LIMIT_MS)
    expect(onSilent).not.toHaveBeenCalled() // exactly at the limit is still fine

    vi.advanceTimersByTime(PING_INTERVAL_MS)
    expect(onSilent).toHaveBeenCalledTimes(1)
  })

  it('reports a silent stretch once, however long it lasts', () => {
    const onSilent = vi.fn()
    const heartbeat = startHeartbeat({ onSilent })
    heartbeat.heard(true)

    vi.advanceTimersByTime(SILENCE_LIMIT_MS * 10)

    expect(onSilent).toHaveBeenCalledTimes(1)
  })

  it('says when the other side is back, and reports the next silent stretch again', () => {
    const onSilent = vi.fn()
    const onAlive = vi.fn()
    const heartbeat = startHeartbeat({ onSilent, onAlive })
    heartbeat.heard(true)
    vi.advanceTimersByTime(SILENCE_LIMIT_MS + PING_INTERVAL_MS)
    expect(onAlive).not.toHaveBeenCalled()

    heartbeat.heard(false)
    expect(onAlive).toHaveBeenCalledTimes(1)
    heartbeat.heard(false)
    expect(onAlive).toHaveBeenCalledTimes(1) // only the change is reported

    vi.advanceTimersByTime(SILENCE_LIMIT_MS + PING_INTERVAL_MS)
    expect(onSilent).toHaveBeenCalledTimes(2)
  })

  it('keeps pinging through silence, so a link that comes back is noticed', () => {
    const ping = vi.fn()
    const heartbeat = startHeartbeat({ ping, onSilent: vi.fn() })
    heartbeat.heard(true)

    vi.advanceTimersByTime(PING_INTERVAL_MS * 10)

    expect(ping).toHaveBeenCalledTimes(10)
  })

  it('never reports silence from a side that never pinged or answered, like an older version of the game', () => {
    const onSilent = vi.fn()
    const heartbeat = startHeartbeat({ onSilent })
    heartbeat.heard(false) // it sends game state, but no heartbeat

    vi.advanceTimersByTime(SILENCE_LIMIT_MS * 10)
    expect(onSilent).not.toHaveBeenCalled()
  })

  it('counts any message as a sign of life, not only the ping or the answer', () => {
    const onSilent = vi.fn()
    const heartbeat = startHeartbeat({ onSilent })
    heartbeat.heard(true)

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(SILENCE_LIMIT_MS - PING_INTERVAL_MS)
      heartbeat.heard(false)
    }
    expect(onSilent).not.toHaveBeenCalled()
  })

  it('checks at once on request, for a tab that comes back after its timers were paused', () => {
    const onSilent = vi.fn()
    const heartbeat = startHeartbeat({ onSilent })
    heartbeat.heard(true)

    // The clock moved on while no timer ran (a frozen tab); setSystemTime does not fire any.
    vi.setSystemTime(Date.now() + SILENCE_LIMIT_MS + 1)
    expect(onSilent).not.toHaveBeenCalled()

    heartbeat.check()
    expect(onSilent).toHaveBeenCalledTimes(1)
  })

  it('does nothing after it was stopped', () => {
    const ping = vi.fn()
    const onSilent = vi.fn()
    const heartbeat = startHeartbeat({ ping, onSilent })
    heartbeat.heard(true)
    heartbeat.stop()

    vi.setSystemTime(Date.now() + SILENCE_LIMIT_MS * 2)
    heartbeat.check()
    vi.advanceTimersByTime(SILENCE_LIMIT_MS * 2)

    expect(ping).not.toHaveBeenCalled()
    expect(onSilent).not.toHaveBeenCalled()
  })
})
