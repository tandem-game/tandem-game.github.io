import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerLanguages } from '../content/types'
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

    network.join(code).then(
      (connection) => {
        if (cancelled) {
          connection.close()
          return
        }
        host.current = connection
        connection.send({ type: 'hello', languages: saved.current } satisfies GuestMessage)
        connection.onMessage((raw) => {
          const message = parseHostMessage(raw)
          if (message) setRoom(message.state)
        })
        connection.onClose(() => {
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

    return () => {
      cancelled = true
      host.current?.close()
      host.current = null
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
