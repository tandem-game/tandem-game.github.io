const SITE_HOSTNAME = 'tandem-game.github.io'
const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js'
// Public: it is in the page source of every visitor. It only ties the counts to this site.
const SITE_TOKEN = 'fc18b272321a42d3bee544e03415bb28'

/**
 * Adds Cloudflare Web Analytics (cookieless: page views, countries, referrers, devices), on the published site only,
 * so local runs, tests and the e2e run against the built site send nothing.
 */
export function startAnalytics(hostname = window.location.hostname, doc: Document = document) {
  if (hostname !== SITE_HOSTNAME) return
  const script = doc.createElement('script')
  script.defer = true
  script.src = BEACON_URL
  script.dataset.cfBeacon = JSON.stringify({ token: SITE_TOKEN })
  doc.head.append(script)
}
