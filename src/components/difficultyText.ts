import type { Difficulty } from '../generation/types'

/** The CEFR level, with the plain word for it. */
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  A1: 'A1 – Beginner',
  A2: 'A2 – Easy',
  B1: 'B1 – Medium',
  B2: 'B2 – Hard',
  C1: 'C1 – Advanced',
  C2: 'C2 – Proficient',
}

export const DIFFICULTY_HELP: Record<Difficulty, string> = {
  A1: 'very short present-tense sentences with the most common words.',
  A2: 'simple sentences with the past, the near future and basic modals.',
  B1: 'connected sentences with perfect tenses, conditionals and clauses.',
  B2: 'longer sentences with the passive, relative clauses and reported speech.',
  C1: 'complex sentences with the subjunctive, idioms and nuance.',
  C2: 'sophisticated sentences with nested clauses and formal or rare vocabulary.',
}
