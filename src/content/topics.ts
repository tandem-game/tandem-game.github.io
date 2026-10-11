import type { Topic } from './types'

/** A preset topic; `hint` tells the AI what to write about, and is never typed by a player. */
export interface PresetTopic extends Topic {
  hint: string
}

/** Everyday spoken language: situations, with the grammar a speaker needs for them. */
export const PRESET_TOPICS: readonly PresetTopic[] = [
  { id: 'greetings', name: 'Greetings and small talk', hint: 'greetings, saying goodbye, asking how someone is, friendly everyday small talk' },
  { id: 'introductions', name: 'Introducing yourself and others', hint: 'saying your name, age, job and where you are from, and introducing a friend' },
  { id: 'weather', name: 'Weather', hint: 'the weather, temperatures, seasons and talking about the weather with someone' },
  { id: 'food-and-drink', name: 'Ordering food and drinks', hint: 'ordering in a café or restaurant, asking for the bill, saying what you like to eat and drink' },
  { id: 'shopping', name: 'Shopping and prices', hint: 'buying things in a shop, asking for prices, sizes and colours, paying' },
  { id: 'directions', name: 'Directions and transport', hint: 'asking the way, giving directions, buses, trains and tickets' },
  { id: 'time-and-dates', name: 'Time, dates and appointments', hint: 'telling the time, days and dates, making and changing appointments' },
  { id: 'daily-routine', name: 'Daily routine', hint: 'a normal day, using separable verbs (like get up, call back) and reflexive verbs (like wash oneself)' },
  { id: 'the-past', name: 'Talking about the past', hint: 'what someone did yesterday or last weekend, using past tenses' },
  { id: 'plans-and-requests', name: 'Plans, wishes and polite requests', hint: 'plans, wishes and polite requests the way people say them in everyday speech, using modal verbs and forms like "would like to" and "could you"' },
]
