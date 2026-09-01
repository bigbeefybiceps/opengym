import { describe, expect, it } from 'vitest'
import { platesFor, PLATES, DEFAULT_BAR } from './plates.js'

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
