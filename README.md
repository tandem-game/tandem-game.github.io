# Tandem Game

A language-learning game for one or two people built with React, TypeScript and Vite. In the two-player game each player is a native speaker of the language the other is learning. You take turns: the game shows a sentence in your own language, you translate it aloud into the language you are learning, and your partner judges it. The app itself does no scoring or judging.

Live site: https://tandem-game.github.io/

## How to play

Start by choosing **1 player** or **2 players**.

### On your own (1 player)

Your saved settings (language you speak, language you are learning, number of sentences from 1 to 5, difficulty as a CEFR level from A1 to C2) are shown first; pick a topic (one of ten everyday ones, or your own). An AI writes the sentences in your language, with their translations, and the round starts as soon as they are ready. For each sentence, say it aloud in the language you are learning, tap "Show translation" to check yourself, then "Next turn". Nothing is sent to another device, and there is no scoring.

### Saved settings

The first time you open the site, you are asked to save your settings: the language you speak (your sentences are written in it), the language you are learning, the number of sentences and the difficulty. Each setting is explained on that page. They live in this browser's `localStorage`; clearing site data resets them. In a two-player game only the two languages are sent, to your partner's device. "Settings" on the first screen opens them again. "1 player" and "Create a game" show them as a summary with your last topic, so you only choose a topic; "Edit settings" opens the settings page and returns to the summary after saving. Someone who opens an invite link without saved settings is asked for them before joining. If saved settings are incomplete, or a setting was added since you last saved, the settings page opens straight away with your other values kept: an unset setting is marked in red with a message saying what to do, a new one carries a "New" note, and you cannot start or join a game until you have saved.

### With a partner (2 players)

1. One player chooses "Create a game", checks the summary of their saved settings (editing them if needed) and picks a topic (one of ten everyday ones, or their own).
2. They send their partner the invite link (or the 6-digit code). The partner joins with their own saved settings, and the game picks the mode from both players' languages: if they speak and learn the same two languages (say, both speak German and learn English), both read German sentences and translate them into English; otherwise each learns what the other speaks, using the host's languages.
3. An AI writes the sentences, and the round starts for both players as soon as they are written. Both screens show "Getting your sentences ready" meanwhile; if the AI fails, the host can try again or choose another topic.
4. Take turns translating aloud; your partner judges. The speaker taps "Show translation" when done, or "Next turn" to skip it.

Be on a call or in the same room: translations are spoken, not typed.

## Development

```sh
npm install
npm run dev      # dev server with hot reload (http://localhost:5173/)
npm run build    # type-check and bundle into dist/
npm run preview  # serve the production build locally
npm run lint
npm test         # unit tests (Vitest)
npm run e2e      # end-to-end tests (Playwright); against the live site unless E2E_URL is set
```

Requires Node 22 (see `.nvmrc`). Pushing to `main` runs lint, unit tests and the build, redeploys the Worker if it is affected, runs the e2e tests against the built site, and only then publishes to GitHub Pages. To generate sentences locally you also need the Worker running, see [docs/ai-sentences.md](docs/ai-sentences.md#try-it-locally).

## How it is put together

- `src/content/`: topics and the `ContentSource` interface screens use to get sentences.
- `src/game/`: pure game rules (building a round, advancing turns) and the host's round setup.
- `src/online/`: keeps the two devices in sync. The host's device holds the real state and sends a full copy to the guest after every change; the guest only sends requests. Everything received is validated in `protocol.ts`. Devices talk over [PeerJS](https://peerjs.com/) (WebRTC), behind a `Network` interface that tests replace with an in-memory fake.
- `src/generation/` and `worker/`: AI sentence generation. The host's browser calls a Cloudflare Worker, which asks Workers AI to write the sentences and validates the answer. See [docs/ai-sentences.md](docs/ai-sentences.md).

### Limits

- It is peer-to-peer. A free public PeerJS service introduces the two devices, so a game cannot start while it is down, and some strict networks block direct connections.
- If the host closes the tab the game ends. A guest who drops can rejoin with the same code while the host is still there.
- Only one guest can join a game.
- Sentences come from a small model on Cloudflare's free plan, so they can be odd and the daily allowance can run out.

## More

- [AI sentences and the Cloudflare Worker](docs/ai-sentences.md): design, prompts, safeguards, running locally.
- [Deployment and end-to-end tests](docs/deployment.md): GitHub Pages, deploying the Worker (by hand or from CI), the pre-deploy and daily e2e runs.
