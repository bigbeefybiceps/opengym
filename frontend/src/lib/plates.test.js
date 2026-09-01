import { describe, expect, it } from 'vitest'
import { platesFor, barsOf, platesOf, PLATES, DEFAULT_BAR, DEFAULT_BARS } from './plates.js'
import { fmtNum, fmtPlate } from './format.js'

const sides = r => r.plates.map(p => `${p.n}x${p.w}`).join(' ')

describe('plate calculator', () => {
  it('loads a classic total with the fewest plates, biggest first', () => {
    const r = platesFor(100, 20, 'kg')
    expect(sides(r)).toBe('1x25 1x15')
    expect(r.achieved).toBe(100)
    expect(r.leftover).toBe(0)
  })

  it('is not fooled by the non-greedy kg inventory', () => {
    // 23 on a 20 bar → 1.5 per side: three 0.5s, not a stranded 1.25 + 0.25 leftover
    const r = platesFor(23, 20, 'kg')
    expect(sides(r)).toBe('3x0.5')
    expect(r.leftover).toBe(0)
  })

  it('handles an empty bar and a target equal to the bar', () => {
    expect(platesFor(20, 20, 'kg').plates).toEqual([])
    expect(platesFor(20, 20, 'kg').achieved).toBe(20)
  })

  it('flags a target below the bar instead of inventing negative plates', () => {
    const r = platesFor(15, 20, 'kg')
    expect(r.belowBar).toBe(true)
    expect(r.achieved).toBe(20)
  })

  it('reports what the smallest plates cannot cover', () => {
    // 60.6 kg on a 20 bar → 20.3/side; 20.25 loads (1.25 + 0.5s), the last 0.05 cannot
    const r = platesFor(60.6, 20, 'kg')
    expect(r.achieved).toBe(60.5)
    expect(r.leftover).toBeCloseTo(0.1)
  })

  it('is exact for every multiple of the smallest pair', () => {
    for (let t = 20; t <= 200; t += 1) {
      const r = platesFor(t, 20, 'kg')
      expect(r.leftover, `target ${t}`).toBe(0)
      expect(r.achieved, `target ${t}`).toBe(t)
    }
  })

  it('loads the full target with no bar at all', () => {
    const r = platesFor(50, 0, 'kg')
    expect(sides(r)).toBe('1x25')       // 25 per side, nothing under it
    expect(r.achieved).toBe(50)
    expect(r.leftover).toBe(0)
    expect(platesFor(15, 0, 'kg').belowBar).toBe(false)
  })

  it('works in pounds with the lb inventory and bar', () => {
    const r = platesFor(135, DEFAULT_BAR.lb, 'lb')
    expect(sides(r)).toBe('1x45')
    expect(r.achieved).toBe(135)
    expect(PLATES.lb[0]).toBe(55)
  })
})

describe('the profile\'s bar list', () => {
  it('falls back to the unit defaults when unset or empty', () => {
    expect(barsOf({ unit: 'kg' })).toEqual(DEFAULT_BARS.kg)
    expect(barsOf({ unit: 'lb' })).toEqual(DEFAULT_BARS.lb)
    expect(barsOf({ unit: 'kg', bars: [] })).toEqual(DEFAULT_BARS.kg)
    expect(barsOf(null)).toEqual(DEFAULT_BARS.kg)
  })

  it('uses the profile\'s own bars once it has any', () => {
    const mine = [{ id: 'b1', name: 'Deadlift bar', w: 25 }]
    expect(barsOf({ unit: 'kg', bars: mine })).toEqual(mine)
  })

  it('keeps a 0 kg bar but drops malformed entries', () => {
    const bars = [{ id: 'a', name: 'Pin', w: 0 }, { id: 'b', name: 'Broken', w: -5 }, null]
    expect(barsOf({ unit: 'kg', bars })).toEqual([{ id: 'a', name: 'Pin', w: 0 }])
  })
})

describe("the profile's plate rack", () => {
  it('falls back to the unit set, and sorts its own biggest first', () => {
    expect(platesOf({ unit: 'kg' })).toEqual(PLATES.kg)
    expect(platesOf({ unit: 'lb' })).toEqual(PLATES.lb)
    expect(platesOf({ unit: 'kg', plates: [] })).toEqual(PLATES.kg)
    expect(platesOf({ unit: 'kg', plates: [5, 20, 1.25] })).toEqual([20, 5, 1.25])
  })

  it('drops sizes that are not a real plate', () => {
    expect(platesOf({ unit: 'kg', plates: [20, 0, -5] })).toEqual([20])
  })

  it('only loads plates the rack actually has', () => {
    // 20s and 5s only: 60 on a 20 bar is 20/side, and 62.5 cannot be made at all
    const rack = [20, 5]
    expect(platesFor(60, 20, 'kg', rack).plates).toEqual([{ w: 20, n: 1 }])
    const odd = platesFor(62.5, 20, 'kg', rack)
    expect(odd.achieved).toBe(60)
    expect(odd.leftover).toBeCloseTo(2.5)
  })

  it('handles micro plates finer than the old quarter-unit grid', () => {
    const r = platesFor(20.2, 20, 'kg', [0.1])
    expect(r.plates).toEqual([{ w: 0.1, n: 1 }])
    expect(r.leftover).toBe(0)
  })

  it('never spends a zero-weight coin', () => {
    const r = platesFor(60, 20, 'kg', [0])
    expect(r.plates).toEqual([])
    expect(r.achieved).toBe(20)
    expect(r.leftover).toBeCloseTo(40)
  })
})

describe('plate labels', () => {
  it('keeps the second decimal a plate actually has', () => {
    expect(fmtPlate(1.25)).toBe('1.25')
    expect(fmtPlate(2.5)).toBe('2.5')
    expect(fmtPlate(20)).toBe('20')
    expect(fmtNum(1.25)).toBe('1.3')      // why fmtPlate exists
  })
})
