interface AppHeaderProps {
  /** Opens the tutorial; leave out where it is already open or must not be left for. */
  onHowToPlay?: () => void
  /** Opens the settings; leave out where they are already open or while a game runs. */
  onSettings?: () => void
}

/** The title and tagline, with "How to play" and "Settings" at the top left when the player may open them. */
export function AppHeader({ onHowToPlay, onSettings }: AppHeaderProps) {
  return (
    <header className="app-header">
      {(onHowToPlay || onSettings) && (
        <nav className="header-links" aria-label="Help and settings">
          {onHowToPlay && (
            <button type="button" className="link" onClick={onHowToPlay}>
              How to play
            </button>
          )}
          {onSettings && (
            <button type="button" className="link" onClick={onSettings}>
              Settings
            </button>
          )}
        </nav>
      )}
      <h1>
        {/* A plain link to the site's root: following it reloads the page, which also drops an invite code */}
        <a href={import.meta.env.BASE_URL}>
          <span aria-hidden="true">💬</span> Tandem Game
        </a>
      </h1>
      <p>Learn each other's language, one sentence at a time.</p>
    </header>
  )
}
