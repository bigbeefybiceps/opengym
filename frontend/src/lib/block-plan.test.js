import { describe, it, expect } from 'vitest'
import { blockPlanStatus, programStartOf } from './block-plan.js'

const st = (over = {}) => ({ programStart: '2026-08-10', workouts: [], ...over })

describe('programStartOf', () => {
  it('prefers the explicit anchor', () => {
    expect(programStartOf(st({ workouts: [{ d: '2026-01-01' }] }))).toBe('2026-08-10')
  })
  it('falls back to the earliest logged workout', () => {
    expect(programStartOf({ workouts: [{ d: '2026-08-13' }, { d: '2026-08-10' }] })).toBe('2026-08-10')
  })
  it('is null with nothing to anchor on', () => {
    expect(programStartOf({ workouts: [] })).toBe(null)
    expect(blockPlanStatus({ workouts: [] }, '2026-08-26')).toBe(null)
  })
})

describe('blockPlanStatus', () => {
  it('counts the start date as week 1, Block 1', () => {
    const s = blockPlanStatus(st(), '2026-08-10')
    expect(s).toMatchObject({ week: 1, cycleWeek: 1, suggested: 1, deload: false })
  })
  it('stays week 1 through the first Sunday and rolls on the next Monday', () => {
    expect(blockPlanStatus(st(), '2026-08-16').week).toBe(1)
    expect(blockPlanStatus(st(), '2026-08-17').week).toBe(2)
  })
  it('is week 3, Block 1 mid-cycle', () => {
    expect(blockPlanStatus(st(), '2026-08-26')).toMatchObject({ week: 3, suggested: 1 })
  })
  it('week 6 is still Block 1; week 7 flips to Block 2 as a deload', () => {
    expect(blockPlanStatus(st(), '2026-09-20')).toMatchObject({ week: 6, suggested: 1 })
    expect(blockPlanStatus(st(), '2026-09-21')).toMatchObject({ week: 7, suggested: 2, deload: true })
  })
  it('week 8 is Block 2 but no longer a deload', () => {
    expect(blockPlanStatus(st(), '2026-09-28')).toMatchObject({ week: 8, suggested: 2, deload: false })
  })
  it('week 13 wraps to a new cycle back on Block 1, with a new phaseKey', () => {
    const w12 = blockPlanStatus(st(), '2026-11-01')
    const w13 = blockPlanStatus(st(), '2026-11-02')
    expect(w12).toMatchObject({ week: 12, cycleWeek: 12, suggested: 2 })
    expect(w13).toMatchObject({ week: 13, cycleWeek: 1, suggested: 1 })
    expect(w13.phaseKey).not.toBe(w12.phaseKey)
    expect(w13.phaseKey).not.toBe(blockPlanStatus(st(), '2026-08-10').phaseKey)
  })
  it('a start in the future reports nothing', () => {
    expect(blockPlanStatus(st(), '2026-08-01')).toBe(null)
  })
})
