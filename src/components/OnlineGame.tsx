import { useState } from 'react'
import { staticSource } from '../content/staticSource'
import type { Language } from '../content/types'
import { loadLastTopic, loadSettingsStatus, saveHostDefaults, saveLastTopic, suggestHostDefaults } from '../game/hostPreferences'
import type { SentenceGenerator } from '../generation/generator'
import type { Network } from '../online/network'
import { AppHeader } from './AppHeader'
import { GuestRoom } from './GuestRoom'
import { HostRoom } from './HostRoom'
import { HostSetup, type HostSettings } from './HostSetup'
import { JoinForm } from './JoinForm'
import { SettingsForm } from './SettingsForm'
import { SoloGame } from './SoloGame'
import { Tutorial } from './Tutorial'

type Stage =
  | { kind: 'mode' }
  /** A first visit begins here: what the game is, then the settings. Opened from the header, `returnTo` is where Done goes. */
  | { kind: 'tutorial'; returnTo?: Stage }
  /** Setting the host's defaults; `returnTo` is where saving goes, and back too unless this is the first visit. */
  | { kind: 'settings'; returnTo: Stage }
  | { kind: 'solo-setup' }
  | { kind: 'solo'; settings: HostSettings }
  | { kind: 'menu' }
  | { kind: 'host-setup' }
  | { kind: 'host'; settings: HostSettings }
  | { kind: 'join-setup' }
  | { kind: 'guest'; code: string; attempt: number }

interface OnlineGameProps {
  network: Network
  languages: Language[]
  /** A valid game code from an invite link: join that game straight away. */
  initialCode?: string
  /** Where AI sentences come from; leave out to play only the hand-written topics. */
  generator?: SentenceGenerator
}

/** Walks the players from creating or joining a game, through to playing it. */
export function OnlineGame({ network, languages, initialCode, generator }: OnlineGameProps) {
  const [status, setStatus] = useState(loadSettingsStatus)
  // Games start from complete settings only: while some need the player's attention, there are none.
  const defaults = status.kind === 'complete' ? status.defaults : null
  const [lastTopic, setLastTopic] = useState(loadLastTopic)
  // Someone with an invite link joins at once (asking for their settings first if they need to look at them). Anyone
  // else is first shown the tutorial, then asked to save their settings; a returning player whose saved settings are
  // incomplete or outdated goes straight to them, with what needs their attention highlighted.
  const [stage, setStage] = useState<Stage>(() => {
    if (initialCode) return { kind: 'guest', code: initialCode, attempt: 1 }
    if (status.kind === 'complete') return { kind: 'mode' }
    return status.kind === 'none' ? { kind: 'tutorial' } : { kind: 'settings', returnTo: { kind: 'mode' } }
  })
  // Leaving a two-player game, or backing out of its screens, returns to the create-or-join menu.
  const toMenu = () => setStage({ kind: 'menu' })
  const toMode = () => setStage({ kind: 'mode' })
  const remember = ({ topic }: HostSettings) => {
    saveLastTopic(topic)
    setLastTopic(topic)
  }
  const settingsScreen = (returnTo: Stage, onBack?: () => void) => (
    <SettingsForm
      languages={languages}
      defaults={status.kind === 'incomplete' ? status.draft : (defaults ?? suggestHostDefaults())}
      missing={status.kind === 'incomplete' ? status.missing : undefined}
      fresh={status.kind === 'incomplete' ? status.fresh : undefined}
      onSave={(saved) => {
        saveHostDefaults(saved)
        setStatus({ kind: 'complete', defaults: saved })
        setStage(returnTo)
      }}
      onBack={onBack}
    />
  )
  const editFrom = (returnTo: Stage) => () => setStage({ kind: 'settings', returnTo })

  // The header's links are there outside a running game, and not on the first visit's tutorial, which leads on to the
  // settings anyway. Each one opens from, and returns to, the screen the player is on (or came from).
  const inGame = stage.kind === 'solo' || stage.kind === 'host' || stage.kind === 'guest'
  const firstVisit = stage.kind === 'tutorial' && !stage.returnTo
  const origin = stage.kind === 'tutorial' ? stage.returnTo : stage
  const showLinks = !inGame && !firstVisit && origin !== undefined
  const header = (
    <AppHeader
      menu={
        showLinks && origin
          ? {
              onHome: stage.kind === 'mode' ? undefined : toMode,
              onHowToPlay: stage.kind === 'tutorial' ? undefined : () => setStage({ kind: 'tutorial', returnTo: stage }),
              onSettings: stage.kind === 'settings' ? undefined : editFrom(origin),
            }
          : undefined
      }
    />
  )

  return (
    <>
      {header}
      {screen()}
    </>
  )

  function screen() {
    switch (stage.kind) {
      case 'mode':
        return (
          <section className="card">
            <h2>Start a game</h2>
            <p>Practise on your own, or with a partner who plays on their own device.</p>
            <button type="button" className="primary" onClick={() => setStage({ kind: 'solo-setup' })}>
              1 player
            </button>
            <button type="button" onClick={toMenu}>
              2 players
            </button>
          </section>
        )

      case 'tutorial':
        return <Tutorial replay={stage.returnTo !== undefined} onDone={() => setStage(stage.returnTo ?? { kind: 'settings', returnTo: { kind: 'mode' } })} />

      case 'settings':
        return settingsScreen(stage.returnTo, defaults ? () => setStage(stage.returnTo) : undefined)

      case 'solo-setup':
        if (defaults === null) return settingsScreen(stage, toMode)
        return (
          <HostSetup
            languages={languages}
            topics={staticSource.getTopics()}
            defaults={defaults}
            lastTopic={lastTopic}
            onEdit={editFrom(stage)}
            onCreate={(settings) => {
              remember(settings)
              setStage({ kind: 'solo', settings })
            }}
            onBack={toMode}
            solo
          />
        )

      case 'solo':
        return <SoloGame languages={languages} settings={stage.settings} generator={generator} onLeave={toMode} />

      case 'menu':
        return (
          <section className="card">
            <h2>Play with a partner</h2>
            <p>
              Each of you uses your own device: one of you creates a game and shares its link or code, and the other
              joins with it. You say your translations out loud, so stay on a call or sit together.
            </p>
            <button type="button" className="primary" onClick={() => setStage({ kind: 'host-setup' })}>
              Create a game
            </button>
            <button type="button" onClick={() => setStage({ kind: 'join-setup' })}>
              Join a game
            </button>
            <button type="button" className="secondary" onClick={toMode}>
              Back
            </button>
          </section>
        )

      case 'host-setup':
        if (defaults === null) return settingsScreen(stage, toMenu)
        return (
          <HostSetup
            languages={languages}
            topics={staticSource.getTopics()}
            defaults={defaults}
            lastTopic={lastTopic}
            onEdit={editFrom(stage)}
            onCreate={(settings) => {
              remember(settings)
              setStage({ kind: 'host', settings })
            }}
            onBack={toMenu}
          />
        )

      case 'host':
        return (
          <HostRoom
            network={network}
            languages={languages}
            host={{ knows: stage.settings.knows, learns: stage.settings.learns }}
            firstRound={stage.settings}
            generator={generator}
            onLeave={toMenu}
          />
        )

      case 'join-setup':
        return (
          <section className="card">
            <h2>Join a game</h2>
            <JoinForm onJoin={(code) => setStage({ kind: 'guest', code, attempt: 1 })} />
            <button type="button" className="secondary" onClick={toMenu}>
              Back
            </button>
          </section>
        )

      case 'guest':
        // The settings are what the host uses to decide what each player reads, so a guest without any sets them first.
        if (defaults === null) return settingsScreen(stage, toMenu)
        return (
          <GuestRoom
            // A new key makes React start a fresh connection attempt.
            key={stage.attempt}
            network={network}
            languages={languages}
            saved={{ knows: defaults.knows, learns: defaults.learns }}
            code={stage.code}
            onRetry={() => setStage({ ...stage, attempt: stage.attempt + 1 })}
            onChangeCode={() => setStage({ kind: 'join-setup' })}
            onLeave={toMenu}
          />
        )
    }
  }
}
