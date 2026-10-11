import { useId, useState } from 'react'
import type { Language, LanguageCode } from '../content/types'
import type { HostDefaults, SettingKey, SettingsDraft } from '../game/hostPreferences'
import { DEFAULT_ROUND_OPTIONS, type RoundOptions } from '../generation/types'
import { RoundOptionsFields } from './RoundOptionsFields'
import { flagMessage, type Flag, type Flags } from './settingFlags'

interface SettingsFormProps {
  languages: Language[]
  /** What is saved now; shown as the starting values. A language can still be unset. */
  defaults: SettingsDraft | null
  /** Settings with no usable saved value: highlighted until the player sets them. */
  missing?: readonly SettingKey[]
  /** Settings added since the player last saved: highlighted until the player has looked at them. */
  fresh?: readonly SettingKey[]
  onSave: (defaults: HostDefaults) => void
  /** Leave without saving; missing when there is nothing to go back to. */
  onBack?: () => void
}

/** Where the host sets their languages and round options once, so each new game starts from them. */
export function SettingsForm({ languages, defaults, missing = [], fresh = [], onSave, onBack }: SettingsFormProps) {
  const [knows, setKnows] = useState<LanguageCode | ''>(defaults?.knows ?? '')
  const [learns, setLearns] = useState<LanguageCode | ''>(defaults?.learns ?? '')
  const [options, setOptions] = useState(defaults?.options ?? DEFAULT_ROUND_OPTIONS)
  // Settings the player has changed since the page opened no longer need pointing out.
  const [touched, setTouched] = useState<ReadonlySet<SettingKey>>(new Set())
  const id = useId()
  const describedBy = (key: 'knows' | 'learns', flag?: Flag) => (flag ? `${id}-${key} ${id}-${key}-flag` : `${id}-${key}`)
  const nameOf = (code: LanguageCode) => languages.find((language) => language.code === code)?.name ?? code

  const touch = (...keys: SettingKey[]) => setTouched((previous) => new Set([...previous, ...keys]))

  // An empty language is always pointed out: it is what keeps the settings from being saved.
  const flagOf = (key: SettingKey, value?: string): Flag | undefined => {
    if (value === '') return 'missing'
    if (touched.has(key)) return undefined
    return missing.includes(key) ? 'missing' : fresh.includes(key) ? 'new' : undefined
  }
  const knowsFlag = flagOf('knows', knows)
  const learnsFlag = flagOf('learns', learns)
  const optionFlags: Flags = { count: flagOf('count'), difficulty: flagOf('difficulty') }
  const unset = [knows === '' && 'the language you speak', learns === '' && "the language you're learning"].filter(Boolean)
  const flagged = knowsFlag || learnsFlag || Object.values(optionFlags).some(Boolean)

  function changeOptions(next: RoundOptions) {
    touch(...(['count', 'difficulty'] as const).filter((key) => next[key] !== options[key]))
    setOptions(next)
  }

  function chooseKnows(code: LanguageCode | '') {
    touch('knows')
    setKnows(code)
    // The two languages must differ, so a clash clears the other choice.
    if (code === learns) setLearns('')
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (knows !== '' && learns !== '') onSave({ knows, learns, options })
  }

  return (
    <section className="card">
      <h2>Settings</h2>
      <p>Set these once. Every game you create starts from them, and you can change them here whenever you like.</p>
      {flagged && (
        <p className="notice">Some settings need your attention before you play. Check the highlighted ones, then save.</p>
      )}
      <form onSubmit={handleSubmit}>
        <div className="field" data-flag={knowsFlag}>
          <label>
            I speak
            <select
              aria-describedby={describedBy('knows', knowsFlag)}
              aria-invalid={knowsFlag === 'missing' || undefined}
              value={knows}
              onChange={(e) => chooseKnows(e.target.value as LanguageCode | '')}
            >
              <option value="">Choose a language</option>
              {languages.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </label>
          <small id={`${id}-knows`} className="help">
            The language your sentences are written in.
          </small>
          {knowsFlag && <FlagText id={`${id}-knows-flag`} setting="knows" flag={knowsFlag} />}
        </div>
        <div className="field" data-flag={learnsFlag}>
          <label>
            I'm learning
            <select
              aria-describedby={describedBy('learns', learnsFlag)}
              aria-invalid={learnsFlag === 'missing' || undefined}
              value={learns}
              onChange={(e) => {
                touch('learns')
                setLearns(e.target.value as LanguageCode | '')
              }}
            >
              <option value="">Choose a language</option>
              {languages
                .filter((language) => language.code !== knows)
                .map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
            </select>
          </label>
          <small id={`${id}-learns`} className="help">
            The language you say each sentence in. If your partner saved the same two languages as you, you both read
            the first and say the second. Otherwise you learn the language your partner speaks.
          </small>
          {learnsFlag && <FlagText id={`${id}-learns-flag`} setting="learns" flag={learnsFlag} />}
        </div>
        {knows !== '' && learns !== '' && (
          <p className="settings-example" role="status">
            You will read sentences in {nameOf(knows)} and say them aloud in {nameOf(learns)}.
          </p>
        )}
        <RoundOptionsFields options={options} onChange={changeOptions} withHelp flags={optionFlags} />
        <button
          type="submit"
          className="primary"
          disabled={knows === '' || learns === ''}
          aria-describedby={unset.length > 0 ? `${id}-unset` : undefined}
        >
          Save settings
        </button>
        {unset.length > 0 && (
          <p id={`${id}-unset`} className="help">
            To save, choose {unset.join(' and ')}.
          </p>
        )}
      </form>
      {onBack && (
        <button type="button" className="secondary" onClick={onBack}>
          Back
        </button>
      )}
    </section>
  )
}

function FlagText({ id, setting, flag }: { id: string; setting: SettingKey; flag: Flag }) {
  return (
    <small id={id} className="flag">
      {flagMessage(setting, flag)}
    </small>
  )
}
