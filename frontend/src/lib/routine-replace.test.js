import { describe, expect, test } from 'vitest'
import { carryConfig, replaceAt, replaceIn } from './routine-replace.js'

describe('replacing an exercise in a routine', () => {
  const old = { id: '0047', sg: 'sg1', sets: 2, reps: 8, repsMin: 6, weight: 75, warmupSets: 2, rir: [1, 0], rirEasy: [3, 2], tech: 'Myo-reps', restSec: 150, prog: 'double-nd', note: 'olympic bar', inc: 2.5 }

  test('carries the prescription, not the old movement\'s load or cues', () => {
    const c = carryConfig(old, '0596')
    expect(c).toMatchObject({ sets: 2, reps: 8, repsMin: 6, warmupSets: 2, rir: [1, 0], rirEasy: [3, 2], tech: 'Myo-reps', restSec: 150, prog: 'double-nd', weight: 0 })
    expect(c.note).toBeUndefined()
    expect(c.inc).toBeUndefined()
    expect(c.id).toBeUndefined()
    expect(c.sg).toBeUndefined()
  })

  test('keeps the position and the superset seat', () => {
    const list = [{ id: 'a' }, { ...old }, { id: 'c' }]
    replaceAt(list, 1, '0596', { sets: 3, reps: 10 })
    expect(list.map(e => e.id)).toEqual(['a', '0596', 'c'])
    expect(list[1]).toEqual({ id: '0596', sg: 'sg1', sets: 3, reps: 10 })
  })

  test('in another block, swaps wherever the old one sits and keeps that block\'s numbers', () => {
    const list = [{ id: 'x' }, { id: '0047', sets: 3, reps: 12, weight: 70, tech: 'Drop set' }]
    expect(replaceIn(list, '0047', '0596')).toBe(true)
    expect(list[1]).toMatchObject({ id: '0596', sets: 3, reps: 12, tech: 'Drop set', weight: 0 })
    expect(replaceIn(list, 'nope', '0596')).toBe(false)
  })
})
