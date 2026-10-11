import { useEffect, useState } from 'react'
import { OnlineGame } from './components/OnlineGame'
import { staticSource } from './content/staticSource'
import { generatorFromUrl } from './generation/config'
import type { SentenceGenerator } from './generation/generator'
import { readJoinCode } from './online/inviteLink'
import type { Network } from './online/network'
import { peerNetwork } from './online/peerNetwork'

const languages = staticSource.getLanguages()

// Set when building (VITE_GENERATE_URL); without it the AI features stay hidden.
const configuredGenerator = generatorFromUrl(import.meta.env.VITE_GENERATE_URL)

interface AppProps {
  /** How devices connect; tests pass a fake. */
  network?: Network
  /** Where AI sentences come from; tests pass a fake. */
  generator?: SentenceGenerator
}

function App({ network = peerNetwork, generator = configuredGenerator }: AppProps) {
  // Read once on load: opening an invite link joins that game.
  const [inviteCode] = useState(() => readJoinCode(window.location.search))

  // Take the code out of the address bar so a refresh or a copied address does
  // not silently try to rejoin an old game.
  useEffect(() => {
    if (inviteCode) window.history.replaceState(null, '', window.location.pathname)
  }, [inviteCode])

  return (
    <main>
      <OnlineGame
        network={network}
        languages={languages}
        initialCode={inviteCode ?? undefined}
        generator={generator}
      />
    </main>
  )
}

export default App
