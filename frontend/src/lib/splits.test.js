import { describe, expect, test } from 'vitest'
import { migrateSplits, addSplit, activateSplit, moveRoutine, removeSplit, routineStatus, splitName, routinesIn, loose, pickable, renameSplit, forgetRoutine } from './splits.js'
import { planStatus, exNow, ownList, addBlock, removeBlock } from './block-plan.js'
import { buildPlanBundle } from './plan-share.js'

const state = () => ({
  routines: [
    { id: 'u1', name: 'Upper 1', ex: [{ id: 'a' }], alt: { b2: [{ id: 'a', tech: 'drop' }] } },
    { id: 'l1', name: 'Lower 1', ex: [{ id: 'b' }] },
    { id: 'old', name: 'Old PPL push', ex: [{ id: 'c' }] },
  ],
  week: { 1: 'u1', 2: 'l1' },
  dayPlan: {},
  workouts: [],
  plan: { name: 'Min-Max', start: '2026-09-07', after: 'repeat', blocks: [{ id: 'b1', weeks: 6 }, { id: 'b2', weeks: 6 }] },
})

describe('migrateSplits', () => {
  test('wraps the current plan in one active split holding the scheduled routines', () => {
    const S = migrateSplits(state())
    expect(S.splits).toHaveLength(1)
    expect(S.split).toBe(S.splits[0].id)
    expect(routinesIn(S, S.split).map(r => r.id)).toEqual(['u1', 'l1'])
    expect(loose(S).map(r => r.id)).toEqual(['old'])
    expect(splitName(S, S.splits[0])).toBe('Min-Max')
    expect(S.plan.blocks).toHaveLength(2)        // the plan stays where it was
  })
  test('is idempotent and repairs dangling ids', () => {
    const S = migrateSplits(state())
    const again = migrateSplits(JSON.parse(JSON.stringify(S)))
    expect(again.splits).toEqual(S.splits)
    again.routines[2].split = 'gone'
    again.split = 'gone'
    migrateSplits(again)
    expect(again.split).toBe(S.split)
    expect(again.routines[2].split).toBeUndefined()
  })
})

describe('switching splits', () => {
  test('pauses the current split and resumes it at the week it was left', () => {
    const S = migrateSplits(state())
    const a = S.split
    expect(planStatus(S, '2026-10-12').week).toBe(6)
    const b = addSplit(S, { name: 'PPL' })
    moveRoutine(S, 'old', b)
    activateSplit(S, b, '2026-10-12')
    expect(S.split).toBe(b)
    expect(S.plan.name).toBe('PPL')
    expect(S.plan.start).toBe('2026-10-12')       // a split that never ran starts today
    expect(S.week).toEqual({})
    expect(planStatus(S, '2026-10-12').week).toBe(1)
    // Four weeks on PPL, then back: Min-Max is still on week 6, not week 10.
    activateSplit(S, a, '2026-11-09')
    expect(S.week).toEqual({ 1: 'u1', 2: 'l1' })
    expect(planStatus(S, '2026-11-09').week).toBe(6)
    expect(planStatus(S, '2026-11-16').week).toBe(7)
    // …and PPL kept its own place too.
    activateSplit(S, b, '2026-11-16')
    expect(planStatus(S, '2026-11-16').week).toBe(5)
  })

  test('a paused split\'s routine trains on that split\'s block', () => {
    const S = migrateSplits(state())
    const a = S.split
    const b = addSplit(S, { name: 'PPL' })
    activateSplit(S, b, '2026-10-26')            // Min-Max paused in week 8: Block 2
    const u1 = S.routines.find(r => r.id === 'u1')
    expect(u1.split).toBe(a)
    expect(routineStatus(S, u1, '2026-11-16').block.id).toBe('b2')
    expect(exNow(S, u1, '2026-11-16')).toEqual([{ id: 'a', tech: 'drop' }])
    // A loose routine follows the active split.
    expect(routineStatus(S, S.routines.find(r => r.id === 'old'), '2026-11-16').plan.name).toBe('PPL')
  })

  test('editing a paused split\'s routine uses its own blocks; block edits on the active plan leave it alone', () => {
    const S = migrateSplits(state())
    const b = addSplit(S, { name: 'PPL' })
    activateSplit(S, b, '2026-10-26')
    const u1 = S.routines.find(r => r.id === 'u1')
    ownList(S, u1, 'b2').push({ id: 'z' })
    expect(u1.alt.b2.map(e => e.id)).toEqual(['a', 'z'])
    const nb = addBlock(S)
    expect(u1.alt[nb]).toBeUndefined()
    expect(S.routines.find(r => r.id === 'old').alt[nb]).toBeDefined()  // loose follows active
    removeBlock(S, nb)
    expect(u1.alt.b2).toBeDefined()
  })

  test('copying blocks keeps the ids, so a moved routine keeps its per-block lists', () => {
    const S = migrateSplits(state())
    const b = addSplit(S, { name: 'Min-Max v2', blocksFrom: S.split })
    moveRoutine(S, 'u1', b)
    activateSplit(S, b, '2026-10-26')
    expect(S.plan.blocks.map(x => x.id)).toEqual(['b1', 'b2'])
    expect(planStatus(S, '2026-10-26').week).toBe(1)
  })
})

describe('organising routines', () => {
  test('moving a routine to another split takes it off the old week; into no split it stays', () => {
    const S = migrateSplits(state())
    const b = addSplit(S, { name: 'PPL' })
    expect(moveRoutine(S, 'u1', null)).toBe(0)
    expect(S.week[1]).toBe('u1')
    expect(moveRoutine(S, 'u1', S.split)).toBe(0)
    expect(moveRoutine(S, 'u1', b)).toBe(1)
    expect(S.week[1]).toBeUndefined()
    expect(pickable(S).map(r => r.id)).toEqual(['l1', 'old'])
  })

  test('deleting a paused split keeps its routines loose; the active one cannot be deleted', () => {
    const S = migrateSplits(state())
    const b = addSplit(S, { name: 'PPL' })
    moveRoutine(S, 'old', b)
    expect(removeSplit(S, S.split)).toBe(false)
    expect(removeSplit(S, b)).toBe(true)
    expect(S.splits).toHaveLength(1)
    expect(S.routines.find(r => r.id === 'old').split).toBeUndefined()
  })

  test('renaming a paused split writes its stored plan; deleting a routine clears paused weeks', () => {
    const S = migrateSplits(state())
    const a = S.split
    const b = addSplit(S, { name: 'PPL' })
    activateSplit(S, b, '2026-10-26')
    renameSplit(S, a, 'Min-Max 5x')
    expect(S.splits.find(x => x.id === a).plan.name).toBe('Min-Max 5x')
    forgetRoutine(S, 'u1')
    expect(S.splits.find(x => x.id === a).week).toEqual({ 2: 'l1' })
  })

  test('sharing exports the active split, not every routine', () => {
    const S = migrateSplits(state())
    expect(buildPlanBundle(S, '').routines.map(r => r.id)).toEqual(['u1', 'l1'])
  })
})
