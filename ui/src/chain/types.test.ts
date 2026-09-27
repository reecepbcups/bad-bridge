import { describe, expect, it, vi } from 'vitest'
import { stageReporter } from './types'

describe('stageReporter', () => {
  it('passes stages through until done, then goes quiet', () => {
    const onStage = vi.fn()
    const stage = stageReporter<string>(onStage)
    stage.report('a')
    stage.report('b')
    stage.done()
    stage.report('c')
    expect(onStage.mock.calls).toEqual([['a'], ['b']])
  })

  it('swallows a callback that throws', () => {
    const stage = stageReporter<string>(() => {
      throw new Error('bad listener')
    })
    expect(() => stage.report('a')).not.toThrow()
  })

  it('is a no-op without a callback', () => {
    expect(() => stageReporter<string>(undefined).report('a')).not.toThrow()
  })
})
