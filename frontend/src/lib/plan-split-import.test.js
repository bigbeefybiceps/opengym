import { describe, expect, test } from 'vitest'
import { parsePlan, mergePlan, buildPlanBundle } from './plan-share.js'
import { migrateSplits, splitById, routinesIn } from './splits.js'
import { planStatus, exOf } from './block-plan.js'

const mine = () => migrateSplits({
  routines: [{ id: 'u1', name: 'Upper 1', ex: [{ id: '0047', sets: 2, reps: 8 }] }],
  week: { 1: 'u1' }, dayPlan: {}, workouts: [], customEx: [{ id: 'cx-dragon-flag', n: 'Dragon Flag', bp: 'waist' }],
  plan: { name: 'Min-Max', start: '2026-09-07', blocks: [{ id: 'b1', weeks: 6 }, { id: 'b2', weeks: 6 }] },
})
const file = {
  opengym_plan: 1, name: 'UL Split', week: { 1: 'r1', 4: 'r2' },
  blocks: [{ id: 'b1', weeks: 6 }, { id: 'b2', weeks: 6 }],
  routines: [
    { id: 'r1', name: 'Upper 1', prog: 'double-nd', ex: [{ id: '0592', sets: 2, reps: 8, repsMin: 6 }, { id: 'cx-df', sets: 2, reps: 8, bodyweight: true }] },
    { id: 'r2', name: 'Upper 2', ex: [{ id: '0576', sets: 3, reps: 10 }], alt: { b2: [{ id: '0576', sets: 3, reps: 10, tech: 'Drop set' }], nope: [{ id: '0001' }] } },
  ],
  customEx: [{ id: 'cx-df', n: 'Dragon Flag', bp: 'waist' }],
}

describe('importing a plan file as a split', () => {
  test('reads the blocks and keeps per-block lists only for blocks the file has', () => {
    const b = parsePlan(JSON.stringify(file))
    expect(b.blocks.map(x => [x.id, x.weeks])).toEqual([['b1', 6], ['b2', 6]])
    expect(Object.keys(b.routines[1].alt)).toEqual(['b2'])
  })

  test('arrives as a paused split with its own blocks and week; the current split is untouched', () => {
    const S = mine()
    const before = JSON.stringify({ plan: S.plan, week: S.week })
    mergePlan(S, parsePlan(file), { asSplit: true })
    expect(JSON.stringify({ plan: S.plan, week: S.week })).toBe(before)
    const sp = S.splits.find(x => x.id !== S.split)
    expect(sp.plan.name).toBe('UL Split')
    expect(sp.plan.blocks.map(x => x.id)).toEqual(['b1', 'b2'])
    const rs = routinesIn(S, sp.id)
    expect(rs.map(r => r.name)).toEqual(['Upper 1', 'Upper 2'])
    expect(sp.week).toEqual({ 1: rs[0].id, 4: rs[1].id })
    expect(rs[0].ex[1].id).toBe('cx-dragon-flag')        // matched to the custom you already have
    expect(exOf(rs[1], 'b2')[0].tech).toBe('Drop set')
  })

  test('can switch to it straight away, starting at week 1', () => {
    const S = mine()
    mergePlan(S, parsePlan(file), { asSplit: true, activate: true })
    expect(S.plan.name).toBe('UL Split')
    expect(planStatus(S).week).toBe(1)
    expect(Object.keys(S.week)).toEqual(['1', '4'])
  })

  test('an export carries the blocks, so it imports back as the same split', () => {
    const S = mine()
    mergePlan(S, parsePlan(file), { asSplit: true, activate: true })
    const again = parsePlan(JSON.parse(JSON.stringify(buildPlanBundle(S, ''))))
    expect(again.name).toBe('UL Split')
    expect(again.blocks.map(x => x.id)).toEqual(['b1', 'b2'])
    expect(again.routines.find(r => r.name === 'Upper 2').alt.b2[0].tech).toBe('Drop set')
  })
})
