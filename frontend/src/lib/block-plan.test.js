import { describe, it, expect } from 'vitest'
import { blockPlanStatus, programStartOf, rirFor } from './block-plan.js'

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

/* The program eases off exactly twice in twelve weeks, and says so in its own numbers. */
describe('the easy weeks', () => {
  const at = iso => blockPlanStatus(st(), iso)

  it('marks the intro week that opens a cycle', () => {
    const w = at('2026-08-10')                 // the anchor itself: week 1
    expect(w.cycleWeek).toBe(1)
    expect(w.intro).toBe(true)
    expect(w.deload).toBe(false)
    expect(w.easy).toBe(true)
  })

  it('marks the deload week that opens Block 2', () => {
    const w = at('2026-09-21')                 // six weeks on: week 7
    expect(w.cycleWeek).toBe(7)
    expect(w.deload).toBe(true)
    expect(w.intro).toBe(false)
    expect(w.easy).toBe(true)
  })

  it('leaves every other week alone', () => {
    for (const iso of ['2026-08-17', '2026-08-31', '2026-09-14', '2026-09-28', '2026-10-26']) {
      expect(at(iso).easy, iso).toBe(false)
    }
  })

  it('comes round again on the next cycle', () => {
    const w = at('2026-11-02')                 // twelve weeks on: week 13, cycle week 1
    expect(w.week).toBe(13)
    expect(w.cycleWeek).toBe(1)
    expect(w.easy).toBe(true)
  })
})

describe('rirFor', () => {
  const cfg = { rir: [1, 0], rirEasy: [2, 1] }

  it('gives the easy week its own targets', () => {
    expect(rirFor(cfg, { easy: true })).toEqual([2, 1])
  })

  it('gives every other week the usual ones', () => {
    expect(rirFor(cfg, { easy: false })).toEqual([1, 0])
    expect(rirFor(cfg, null)).toEqual([1, 0])
  })

  it('keeps the usual targets for an exercise the plan never eases off on', () => {
    expect(rirFor({ rir: [0] }, { easy: true })).toEqual([0])
  })

  it('is undefined where the plan prescribes no RIR at all — a timed hold', () => {
    expect(rirFor({ sec: 30 }, { easy: true })).toBeUndefined()
    expect(rirFor(null, { easy: true })).toBeUndefined()
  })
})
