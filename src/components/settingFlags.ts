import type { SettingKey } from '../game/hostPreferences'

/** How a setting is highlighted: nothing is saved for it yet, or it was added since the player last saved. */
export type Flag = 'missing' | 'new'

export type Flags = Partial<Record<SettingKey, Flag>>

/** What the highlight says, next to the setting. */
export function flagMessage(key: SettingKey, flag: Flag): string {
  if (flag === 'new') return 'New setting. Check it, then save.'
  return key === 'knows' || key === 'learns' ? 'Choose a language to continue.' : 'Not set yet. Check it, then save.'
}
