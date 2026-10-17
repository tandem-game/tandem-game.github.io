import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerLanguages } from '../content/types'
import { startHeartbeat, type Heartbeat } from './heartbeat'
import { NetworkError, type Connection, type Network } from './network'
import { parseHostMessage, type GuestMessage, type RoomState } from './protocol'

export interface GuestSession {
  status: 'connecting' | 'connected' | 'lost' | 'not-found' | 'unavailable'
  /** The host's latest copy of the game; null until the first one arrives. */
  room: RoomState | null
  nextTurn: () => void
  reveal: () => void
}

/**
 * Joins a room and shows whatever the host says the game looks like.
 * `languages` are the guest's saved settings, which the host uses to decide what each player reads and learns.
 */
export function useGuestSession(network: Network, code: string, languages: PlayerLanguages): GuestSession {
  const [status, setStatus] = useState<GuestSession['status']>('connecting')
  const [room, setRoom] = useState<RoomState | null>(null)
  const host = useRef<Connection | null>(null)
  // Read once, when the connection opens: changing settings mid-game does not change the game.
  const saved = useRef(languages)

  useEffect(() => {
    let cancelled = false
    let connection: Connection | null = null
    let heartbeat: Heartbeat | null = null

    function disconnect() {
      heartbeat?.stop()
      heartbeat = null
      const old = connection
      connection = null // first, so closing it does not count as the host leaving
      host.current = null
      old?.close()
    }

    // A host whose device fell asleep never closes the link; the guest only finds out because the answers stop.
    // The host takes a returning guest back on a new connection and sends the game as it is now.
    function rejoin() {
      disconnect()
      connect()
    }

    function connect() {
      network.join(code).then(
        (joined) => {
          if (cancelled) {
            joined.close()
            return
          }
          const beat = startHeartbeat({ ping: () => joined.send({ type: 'ping' } satisfies GuestMessage), onSilent: rejoin })
          heartbeat = beat
          connection = joined
          host.current = joined
          joined.send({ type: 'hello', languages: saved.current } satisfies GuestMessage)
          joined.send({ type: 'ping' } satisfies GuestMessage) // the first answer is what makes silence count
          joined.onMessage((raw) => {
            const message = parseHostMessage(raw)
            beat.heard(message?.type === 'pong')
            if (message?.type === 'state') setRoom(message.state)
          })
          joined.onClose(() => {
            beat.stop()
            if (connection !== joined) return
            connection = null
            host.current = null
            if (!cancelled) setStatus('lost')
          })
          setStatus('connected')
        },
        (error: unknown) => {
          if (cancelled) return
          setStatus(error instanceof NetworkError && error.reason === 'not-found' ? 'not-found' : 'unavailable')
        },
      )
    }

    // A tab that was in the background may have missed any number of pings, so look as soon as it is back.
    const onVisible = () => {
      if (!document.hidden) heartbeat?.check()
    }
    document.addEventListener('visibilitychange', onVisible)

    connect()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      disconnect()
    }
  }, [network, code])

  const send = useCallback((message: GuestMessage) => host.current?.send(message), [])

  return {
    status,
    room,
    nextTurn: useCallback(() => send({ type: 'next-turn' }), [send]),
    reveal: useCallback(() => send({ type: 'reveal' }), [send]),
  }
}
