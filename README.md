# Tandem Game

A language-learning game for one or two people, built with React, TypeScript and Vite. In the two-player game each player is a native speaker of the language the other is learning. You take turns: the game shows a sentence in your own language, you translate it aloud into the language you are learning, and your partner judges it. The app itself does no scoring or judging.

Live site: https://tandem-game.github.io/

## How to play

Choose **1 player** or **2 players**. The first time you open the site you are asked to save your settings:

- the language you speak (your sentences are written in it) and the language you are learning (English and German),
- the number of sentences per round (1 to 5),
- the difficulty, as a CEFR level from A1 to C2 (default B1).

They are stored in this browser's `localStorage`, and the menu at the top right ("Settings") opens them again. Clearing site data resets them. The menu also has "Home", "How to play" and "Favourites".

**On your own.** Pick a topic (one of ten everyday ones, or type your own). An AI writes the sentences in your language, with their translations, and the round starts as soon as they are ready. Say each sentence aloud in the language you are learning, tap "Show translation" to check yourself, then "Next turn". Nothing is sent to another device.

**With a partner.** Be on a call or in the same room: translations are spoken, not typed.

1. One player chooses "Create a game", checks the summary of their saved settings and picks a topic.
2. They send their partner the invite link (or the 6-digit code). The partner joins with their own saved settings. If both speak and learn the same two languages, both read the same language and translate into the other; otherwise each learns what the other speaks.
3. The AI writes the sentences and the round starts on both screens. If the AI fails, the host can try again or choose another topic.
4. Take turns translating aloud while your partner judges. The speaker taps "Show translation" when done, or "Next turn" to skip it.

**Favourites.** The heart (♡) on a sentence keeps it with its translation in this browser: up to 200, each sentence once. "Favourites" in the menu lists them (searchable, ten to a page) and lets you remove them. "Practise" starts a 1-player round from the favourites that match your languages, without using the AI. They are not synced between devices: "Export favourites" downloads a `tandem-favourites.json` file, and "Import favourites" on another device merges it in, skipping duplicates and anything invalid.

## Run it locally

Requires Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev      # dev server with hot reload (http://localhost:5173/)
npm run build    # type-check and bundle into dist/
npm run preview  # serve the production build locally
npm run lint
npm test         # unit tests (Vitest)
npm run e2e      # end-to-end tests (Playwright) against the live site, or E2E_URL if set
```

The app cannot write sentences without the Cloudflare Worker (see below). To try a round locally, start a local Worker and point the page at it:

```sh
cd worker && npx wrangler@4.86.0 dev --config wrangler.toml --port 8787
VITE_GENERATE_URL=http://localhost:8787 npm run dev       # in another terminal
```

Details and a login note are in [docs/ai-sentences.md](docs/ai-sentences.md#try-it-locally).

### Configuration

| Variable | Used by | Purpose |
| --- | --- | --- |
| `VITE_GENERATE_URL` | the build | Address of the Worker. Public, not a secret (an Actions variable in CI). Without it a round cannot start. |
| `E2E_URL` | `npm run e2e` | Site the end-to-end tests play on (default: the live site). |
| `VITE_LIVE_WORKER_URL` | opt-in live tests | A running Worker for `src/generation/live.test.ts` and the level calibration. Never set in CI. |

## How it is put together

- `src/components/`: the screens (start, settings, host and guest rooms, the game, favourites, tutorial).
- `src/content/`: the topics and the `ContentSource` interface screens use to get sentences.
- `src/game/`: pure game rules (building a round, advancing turns) and the host's round setup.
- `src/online/`: keeps the two devices in sync. The host's device holds the real state and sends a full copy to the guest after every change; the guest only sends requests. Everything received is validated in `protocol.ts`. Devices talk over [PeerJS](https://peerjs.com/) (WebRTC), behind a `Network` interface that tests replace with an in-memory fake (`src/test/`).
- `src/generation/` and `worker/`: AI sentence generation. The host's browser calls a Cloudflare Worker, which asks Workers AI to write the sentences and validates the answer.
- `src/favourites/`: saving, validating, merging and practising favourites (no React).
- `e2e/`: Playwright tests that play real games with two browsers.

Pushing to `main` runs lint, unit tests and the build, redeploys the Worker if it is affected, runs the e2e tests against the built site, and only then publishes to GitHub Pages. A daily run of the e2e tests catches a broken Worker or a used-up AI allowance.

## Limits and privacy

- **Peer-to-peer.** A free public PeerJS service introduces the two devices, so a game cannot start while it is down, and some strict networks block direct connections. Only one guest can join a game.
- **Connection loss.** If the host closes the tab the game ends. A guest who drops can rejoin with the same code while the host is still there. Both devices ping each other every 5 seconds; if the host goes quiet for 15 seconds (a sleeping phone or laptop does not close the link), the guest joins again by itself and picks up the current sentence, and the host shows the partner as disconnected until they are back.
- **AI quality.** Sentences come from a small model on Cloudflare's free plan, so they can be odd, and the daily allowance can run out. There is no review step before play; the Worker validates length, language and markup.
- **What is stored or sent.** Settings and favourites stay in your browser. A topic you type is sent to Cloudflare to generate sentences; nothing else about you is. In a two-player game only the two languages go to your partner's device.
- **Analytics.** Visits to the published site are counted with [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) (`src/analytics.ts`): page views, countries, referrers and devices, without cookies or personal data. Nothing is sent from local runs or tests.

## More

- [AI sentences and the Cloudflare Worker](docs/ai-sentences.md): design, prompts, safeguards, running locally, checking the levels.
- [Deployment and end-to-end tests](docs/deployment.md): GitHub Pages, deploying the Worker (by hand or from CI), the pre-deploy and daily e2e runs.
