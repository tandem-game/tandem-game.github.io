import { expect, type Browser, type Page } from '@playwright/test'
import { SITE_URL } from '../playwright.config'

/** The preset topic the host picks unless a test says otherwise. */
export const TOPIC = 'Greetings and small talk'

/** What a device shows once the guest has joined: the sentences being written, or the round already started. */
const writingOrPlaying = (page: Page) => page.getByRole('heading', { name: 'Getting your sentences ready' }).or(page.getByText(/^Turn 1 of /))

export interface Turn {
  player: 1 | 2
  text: string
}

export interface Game {
  host: Page
  guest: Page
}

/** What the host sets before the invite link exists. */
export interface Settings {
  /** What the player speaks and learns; German and English unless said otherwise. */
  knows?: 'de' | 'en'
  learns?: 'de' | 'en'
  /** Typed instead of picking the preset `TOPIC`. */
  customTopic?: string
  count?: number
  difficulty?: 'easy' | 'medium' | 'hard'
}

/**
 * The settings every first visit begins with, after the tutorial is skipped: German spoken, English learned (unless `settings` says otherwise), and the round options in `settings`.
 * Saving them leads to the start screen.
 */
export async function saveSettings(page: Page, settings: Settings = {}) {
  await page.getByRole('button', { name: 'Skip tutorial' }).click()
  await page.getByLabel('I speak').selectOption(settings.knows ?? 'de')
  await page.getByLabel("I'm learning").selectOption(settings.learns ?? 'en')
  if (settings.count !== undefined) await page.getByLabel(/^Sentences/).selectOption(String(settings.count))
  if (settings.difficulty !== undefined) await page.getByLabel('Difficulty').selectOption(settings.difficulty)
  await page.getByRole('button', { name: 'Save settings' }).click()
}

/**
 * Two separate browsers' worth of state: a host speaking German (learning English) and a guest speaking English (learning German), connected.
 * The host sets the topic and options first; once the guest has joined, the sentences are asked for at once,
 * so `ready` runs on the host's page before the guest joins, for anything that must be in place by then.
 */
export async function startGame(browser: Browser, settings: Settings = {}, ready?: (host: Page) => Promise<void> | void): Promise<Game> {
  const host = await (await browser.newContext()).newPage()
  await host.goto(SITE_URL)
  await saveSettings(host, settings)
  await host.getByRole('button', { name: '2 players' }).click()
  await host.getByRole('button', { name: 'Create a game' }).click()
  if (settings.customTopic !== undefined) {
    await host.getByLabel('Or enter your own topic').fill(settings.customTopic)
  } else {
    await host.getByRole('button', { name: TOPIC }).click()
  }
  await host.getByRole('button', { name: 'Create game' }).click()
  const code = (await host.getByText(/^[0-9]{6}$/).textContent()) ?? ''
  await ready?.(host)

  // The guest saves their own settings first (a first visit is asked for them), so each learns what the other speaks.
  const guest = await (await browser.newContext()).newPage()
  await guest.goto(SITE_URL)
  await saveSettings(guest, { knows: 'en', learns: 'de' })
  await guest.goto(`${SITE_URL}?join=${code}`)
  // Connecting goes through the public PeerJS broker, so allow it some time; on failure, show what the guest saw.
  // Once connected, the guest's languages go to the host and the sentences are written.
  await expect(
    writingOrPlaying(guest),
    `the guest's screen: ${await guest.locator('main').innerText()}`,
  ).toBeVisible({ timeout: 30_000 })
  await expect(writingOrPlaying(host)).toBeVisible({ timeout: 30_000 })
  return { host, guest }
}

/**
 * Plays a round to its end, from the moment the AI's sentences arrive, checking that both devices show the same
 * sentence on every turn. Returns the sentences in the order they were played.
 * With `translated`, each speaker shows the translation first, which is returned per player,
 * except on the turns (by index) listed in `skip`, where they go on without showing it.
 */
export async function playRound({ host, guest }: Game, { perPlayer = 2, translated = false, skip = [] as number[] } = {}) {
  const turns: Turn[] = []
  const translations: Turn[] = []
  const total = perPlayer * 2
  for (let index = 0; index < total; index++) {
    // The players take turns, starting with the host. The first sentence waits for the AI.
    const player = index % 2 === 0 ? 1 : 2
    await expect(host.getByText(`Turn ${index + 1} of ${total}`)).toBeVisible({ timeout: 30_000 })
    const text = (await host.locator('.sentence').textContent()) ?? ''
    await expect(guest.locator('.sentence')).toHaveText(text, { timeout: 30_000 })
    const turn: Turn = { player, text }
    turns.push(turn)
    const mover = turn.player === 1 ? host : guest
    if (translated && skip.includes(index)) {
      await expect(host.locator('.translation')).toHaveCount(0)
      await expect(guest.locator('.translation')).toHaveCount(0)
      // Without showing the translation, the speaker goes straight on.
      await mover.getByRole('button', { name: index === total - 1 ? 'Finish round' : 'Next turn' }).click()
      continue
    }
    if (translated) {
      // Hidden from both until the speaker shows it.
      await expect(host.locator('.translation')).toHaveCount(0)
      await expect(guest.locator('.translation')).toHaveCount(0)
      await mover.getByRole('button', { name: 'Show translation' }).click()
      await expect(host.locator('.translation')).toBeVisible()
      await expect(guest.locator('.translation')).toBeVisible()
      const shown = (await host.locator('.translation').innerText()).replace(/^Translation\s*/, '')
      await expect(guest.locator('.translation')).toContainText(shown)
      translations.push({ player: turn.player, text: shown })
    }
    await mover.getByRole('button', { name: index === total - 1 ? 'Finish round' : 'Next turn' }).click()
  }
  await expect(host.getByRole('heading', { name: 'Round complete' })).toBeVisible()
  await expect(guest.getByRole('heading', { name: 'Round complete' })).toBeVisible()
  return { turns, translations }
}
