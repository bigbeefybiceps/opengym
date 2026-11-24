import { describe, expect, test } from 'vitest'
import { applyToAllBlocks, differsFromFirst, ownList, exOf } from './block-plan.js'

// A routine as a plan import leaves it: no `mode`, keys in the file's order, both blocks on
// the base list. Then the exercise is saved in Block 1 with "Apply to all blocks" on — the
// sheet rebuilds the config in its own key order and adds `mode` and an effort target.
const state = () => ({
  plan: { blocks: [{ id: 'b1', weeks: 6 }, { id: 'b2', weeks: 6 }] },
  routines: [{ id: 'r', ex: [{ id: '0592', sets: 2, reps: 8, weight: 60, repsMin: 6 }] }],
})
const saveWithAll = (s, cfg) => {
  const r = s.routines[0]
  const list = ownList(s, r, 'b1')
  const before = list[0]
  const after = { id: before.id, ...cfg }
  list[0] = after
  applyToAllBlocks(s, r, 'b1', before, after)
}

describe('"Apply to all blocks" leaves the blocks equal', () => {
  test('Block 2 does not read as different after an all-blocks save in Block 1', () => {
    const s = state()
    ownList(s, s.routines[0], 'b2')            // Block 2 has its own copy, as after any edit there
    saveWithAll(s, { sets: 2, mode: 'reps', reps: 8, weight: 62.5, rir: [1, 0], repsMin: 6 })
    const r = s.routines[0]
    expect(exOf(r, 'b2')[0]).toEqual(exOf(r, 'b1')[0])
    expect(differsFromFirst(s, r, 'b2', exOf(r, 'b2')[0])).toBe(false)
  })

  test('a real difference is still reported', () => {
    const s = state()
    const r = s.routines[0]
    ownList(s, r, 'b2')[0].tech = 'Myo-reps'
    expect(differsFromFirst(s, r, 'b2', exOf(r, 'b2')[0])).toBe(true)
  })
})
