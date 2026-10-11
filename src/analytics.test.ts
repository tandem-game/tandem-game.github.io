import { afterEach, describe, expect, it } from 'vitest'
import { startAnalytics } from './analytics'

afterEach(() => document.head.querySelectorAll('script').forEach((script) => script.remove()))

describe('analytics', () => {
  it('adds the Cloudflare beacon on the published site', () => {
    startAnalytics('tandem-game.github.io')
    const script = document.head.querySelector('script')
    expect(script?.src).toBe('https://static.cloudflareinsights.com/beacon.min.js')
    expect(script?.defer).toBe(true)
    expect(JSON.parse(script?.dataset.cfBeacon ?? '{}')).toEqual({ token: expect.stringMatching(/^[0-9a-f]{32}$/) })
  })

  it.each(['localhost', '127.0.0.1', 'example.com', 'tandem-game.github.io.evil.example'])('sends nothing from %s', (hostname) => {
    startAnalytics(hostname)
    expect(document.head.querySelector('script')).toBeNull()
  })
})
