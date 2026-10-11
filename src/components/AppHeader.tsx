interface AppHeaderProps {
  /** Shows the menu; leave out while a game runs or on the first visit, which leads on to the settings. */
  menu?: {
    /** Each one is left out where the player already is: its link then stays, marked as the current page. */
    onHome?: () => void
    onHowToPlay?: () => void
    onSettings?: () => void
  }
}

/** The title and tagline, with "Home", "How to play" and "Settings" at the top right outside a game. */
export function AppHeader({ menu }: AppHeaderProps) {
  const link = (label: string, onClick?: () => void) => (
    <button type="button" className="link" onClick={onClick} aria-current={onClick ? undefined : 'page'} disabled={!onClick}>
      {label}
    </button>
  )
  return (
    <header className="app-header">
      {menu && (
        <nav className="header-links" aria-label="Help and settings">
          {link('Home', menu.onHome)}
          {link('How to play', menu.onHowToPlay)}
          {link('Settings', menu.onSettings)}
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
