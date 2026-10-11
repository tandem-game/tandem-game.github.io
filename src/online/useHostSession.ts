import { useEffect, useReducer, useRef, useState } from 'react'
import type { PlayerLanguages } from '../content/types'
import type { Connection, Network, Room } from './network'
import { parseGuestMessage, type RoomState } from './protocol'
import { createRoom, roomReducer, type RoomEvent } from './roomReducer'

export interface HostSession {
  status: 'opening' | 'ready' | 'error'
  /** The code the partner types in; null until the room is open. */
  code: string | null
  room: RoomState
  partnerConnected: boolean
  /** For the host's own actions; the guest's messages are handled internally. */
  dispatch: (event: RoomEvent) => void
}

/**
 * Opens a room and keeps it in sync with the guest. The host holds the real
 * game state; the guest sends requests and gets a full copy after every change.
 * Only one guest can be connected at a time; a new connection replaces the old one.
 */
export function useHostSession(
  network: Network,
  host: PlayerLanguages,
  /** The topic whose sentences are written as soon as the guest has joined, if any. */
  firstTopic?: string,
  /** False in a build without AI: the guest is then told the sentences cannot be written. */
  canGenerate = true,
): HostSession {
  const [room, dispatch] = useReducer(roomReducer, undefined, () => createRoom(host, firstTopic, canGenerate))
  const [status, setStatus] = useState<HostSession['status']>('opening')
  const [code, setCode] = useState<string | null>(null)
  // The connection the guest is on, so a guest who rejoins gets a copy of the state on their new one.
  const [guestConnection, setGuestConnection] = useState<Connection | null>(null)
  const guest = useRef<Connection | null>(null)

  useEffect(() => {
    let cancelled = false
    let openRoom: Room | null = null

    function accept(connection: Connection) {
      // There is only one guest, so a new connection is the same guest coming back (say, after a refresh)
      // before the host noticed the old one die.
      const previous = guest.current
      guest.current = connection // first, so the old connection closing does not count as the guest leaving
      previous?.close()
      connection.onMessage((raw) => {
        const message = parseGuestMessage(raw)
        if (message?.type === 'hello') {
          dispatch({ type: 'GUEST_HELLO', languages: message.languages })
        } else if (message?.type === 'next-turn') {
          dispatch({ type: 'NEXT_TURN', from: 2 })
        } else if (message?.type === 'reveal') {
          dispatch({ type: 'REVEAL', from: 2 })
        }
      })
      connection.onClose(() => {
        if (guest.current === connection) {
          guest.current = null
          setGuestConnection(null)
        }
      })
      setGuestConnection(connection)
    }

    network.createRoom().then(
      (opened) => {
        if (cancelled) {
          opened.close()
          return
        }
        openRoom = opened
        opened.onConnection(accept)
        setCode(opened.code)
        setStatus('ready')
      },
      () => {
        if (!cancelled) setStatus('error')
      },
    )

    return () => {
      cancelled = true
      guest.current?.close()
      guest.current = null
      openRoom?.close()
    }
  }, [network])

  // Send the guest a full copy whenever the state changes or the guest (re)connects.
  useEffect(() => {
    guestConnection?.send({ type: 'state', state: room })
  }, [room, guestConnection])

  return { status, code, room, partnerConnected: guestConnection !== null, dispatch }
}
