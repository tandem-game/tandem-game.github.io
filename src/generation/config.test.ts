import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatorFromUrl, parseGeneratorUrl } from './config'

afterEach(() => vi.unstubAllGlobals())

describe('parseGeneratorUrl', () => {
  it('accepts an https address', () => {
    expect(parseGeneratorUrl('https://tandem-generate.malu-t90.workers.dev')).toBe('https://tandem-generate.malu-t90.workers.dev/')
  })

  it('trims spaces around the value', () => {
    expect(parseGeneratorUrl('  https://example.workers.dev/  ')).toBe('https://example.workers.dev/')
  })

  it('accepts plain http only for a Worker running on this computer', () => {
    expect(parseGeneratorUrl('http://localhost:8787')).toBe('http://localhost:8787/')
    expect(parseGeneratorUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787/')
    expect(parseGeneratorUrl('http://example.workers.dev')).toBeNull()
    expect(parseGeneratorUrl('http://localhost.evil.example')).toBeNull()
  })

  it('treats a missing or blank setting as "no AI"', () => {
    for (const value of [undefined, null, '', '   ']) expect(parseGeneratorUrl(value)).toBeNull()
  })

  it('rejects anything that is not a plain web address', () => {
    for (const value of [
      'not a url',
      'javascript:alert(1)',
      'data:text/html,hi',
      'ftp://example.com',
      'https://user:secret@example.workers.dev',
      '//example.workers.dev',
      42,
      {},
    ]) {
      expect(parseGeneratorUrl(value)).toBeNull()
    }
  })
})

describe('generatorFromUrl', () => {
  it('gives no generator without a usable address', () => {
    expect(generatorFromUrl(undefined)).toBeUndefined()
    expect(generatorFromUrl('http://example.com')).toBeUndefined()
  })

  it('gives a generator that calls that address', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ sentences: ['Ich kann gut schwimmen.', 'Er muss lernen.'], translations: ['I can swim well.', 'He has to learn.'] })))
    vi.stubGlobal('fetch', fetchFn)
    const generator = generatorFromUrl('https://example.workers.dev')
    const sentences = await generator?.generate({ language: 'de', topic: { kind: 'preset', id: 'weather' }, fresh: false, count: 2, difficulty: 'B1' })
    expect(sentences?.sentences).toHaveLength(2)
    expect(fetchFn.mock.calls[0]).toEqual(['https://example.workers.dev/', expect.anything()])
  })
})
