export const PING_INTERVAL_MS = 5_000
/** A phone that is locked or a laptop that sleeps stops answering without closing the link, so only silence tells. */
export const SILENCE_LIMIT_MS = 15_000

export interface Heartbeat {
  /** Call for every message from the other side; `pulse` is true for its ping or pong. */
  heard(pulse: boolean): void
  /** Look now instead of at the next tick, e.g. when a tab comes back to the front. */
  check(): void
  stop(): void
}

/**
 * Notices a link that died without closing. Silence only counts once the other side has sent a pulse, because an
 * older version of the game sends none and would otherwise be taken for dead. `onSilent` is called once per silent
 * stretch, and `onAlive` when the other side is heard again after it. The heartbeat keeps going until stopped.
 */
export function startHeartbeat({
  ping,
  onSilent,
  onAlive,
}: {
  ping?: () => void
  onSilent: () => void
  onAlive?: () => void
}): Heartbeat {
  let lastHeard = Date.now()
  let seenPulse = false
  let silent = false
  let stopped = false

  function check() {
    if (stopped || silent) return
    if (seenPulse && Date.now() - lastHeard > SILENCE_LIMIT_MS) {
      silent = true
      onSilent()
    }
  }

  const timer = setInterval(() => {
    check()
    if (!stopped) ping?.()
  }, PING_INTERVAL_MS)

  function stop() {
    stopped = true
    clearInterval(timer)
  }

  return {
    heard(pulse) {
      if (stopped) return
      lastHeard = Date.now()
      if (pulse) seenPulse = true
      if (silent) {
        silent = false
        onAlive?.()
      }
    },
    check,
    stop,
  }
}
