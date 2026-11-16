import { describe, it, expect } from 'vitest'
import {
  planOf, planStatus, programStartOf, weekStamp, isEasySession, shiftWeeks, jumpToBlock,
  exOf, ownList, hasOwnList, addBlock, removeBlock, copyBlockList, applyToAllBlocks,
  differsFromFirst, effortScale, weekCfg, migratePlan, startDeload, cancelDeload, skipEasyWeek,
} from './block-plan.js'

// Two six-week blocks, the first week of each a lighter one — the plan this was built for.
const twoBlocks = () => ({
  name: 'Min-Max', start: '2026-08-10', after: 'repeat',
  blocks: [
    { id: 'b1', name: '', weeks: 6, easy: { at: 'first', name: 'Intro', pct: 100 } },
    { id: 'b2', name: '', weeks: 6, easy: { at: 'first', name: 'Deload', pct: 90 } },
  ],
})
const st = (over = {}) => ({ plan: twoBlocks(), workouts: [], routines: [], ...over })
const at = (iso, s = st()) => planStatus(s, iso)

describe('planOf', () => {
  it('always has a block to stand on', () => {
    expect(planOf({}).blocks).toHaveLength(1)
    expect(planOf(null).blocks[0]).toMatchObject({ weeks: 6, easy: null })
  })
  it('clamps what a hand-edited file could break', () => {
    const p = planOf({ plan: { blocks: [{ id: 'x', weeks: 0, easy: { at: 'middle' } }, { id: 'y', weeks: 999, easy: { at: 'last', pct: 3 } }] } })
    expect(p.blocks[0]).toMatchObject({ weeks: 1, easy: null })
    expect(p.blocks[1]).toMatchObject({ weeks: 26, easy: { at: 'last', pct: 10 } })
  })
})

describe('programStartOf', () => {
  it('prefers the explicit start', () => {
    expect(programStartOf(st({ workouts: [{ d: '2026-01-01' }] }))).toBe('2026-08-10')
  })
  it('falls back to the first logged workout, then to nothing', () => {
    expect(programStartOf({ workouts: [{ d: '2026-08-13' }, { d: '2026-08-10' }] })).toBe('2026-08-10')
    expect(programStartOf({ workouts: [] })).toBe(null)
  })
})

describe('where a date sits in the plan', () => {
  it('starts at week 1 of the first block, and rolls over every seven days', () => {
    expect(at('2026-08-10')).toMatchObject({ week: 1, weekInBlock: 1, blockIndex: 0, total: 12 })
    expect(at('2026-08-16').week).toBe(1)
    expect(at('2026-08-17').week).toBe(2)
  })
  it('moves into the second block when the first runs out', () => {
    expect(at('2026-09-20')).toMatchObject({ week: 6, blockIndex: 0, weekInBlock: 6 })
    expect(at('2026-09-21')).toMatchObject({ week: 7, blockIndex: 1, weekInBlock: 1 })
  })
  it('starts over after the last block', () => {
    expect(at('2026-11-01')).toMatchObject({ week: 12, blockIndex: 1, cycle: 0 })
    expect(at('2026-11-02')).toMatchObject({ week: 1, blockIndex: 0, cycle: 1 })
    expect(at('2026-11-16')).toMatchObject({ week: 3, blockIndex: 0, weekInBlock: 3 })
  })
  it('stays on the last block instead, when the plan says so', () => {
    const s = st(); s.plan.after = 'stay'
    expect(at('2026-11-02', s)).toMatchObject({ week: 13, blockIndex: 1, over: true, easy: false })
  })
  it('treats a date before the start, or a plan with no start, as week 1', () => {
    expect(at('2026-08-01').week).toBe(1)
    expect(at('2026-08-26', { workouts: [], routines: [] }).week).toBe(1)
  })
  it('handles blocks of different lengths', () => {
    const s = st(); s.plan.blocks = [{ id: 'a', weeks: 3 }, { id: 'b', weeks: 1 }, { id: 'c', weeks: 4 }]
    expect(at('2026-08-24', s)).toMatchObject({ week: 3, blockIndex: 0 })
    expect(at('2026-08-31', s)).toMatchObject({ week: 4, blockIndex: 1, weekInBlock: 1 })
    expect(at('2026-09-07', s)).toMatchObject({ week: 5, blockIndex: 2, weekInBlock: 1, total: 8 })
  })
})

describe('lighter weeks', () => {
  it('marks the first week of a block that has one, with its name and weight', () => {
    expect(at('2026-08-10')).toMatchObject({ easy: true, easyName: 'Intro', pct: 100 })
    expect(at('2026-09-21')).toMatchObject({ easy: true, easyName: 'Deload', pct: 90 })
  })
  it('leaves every other week alone', () => {
    for (const iso of ['2026-08-17', '2026-09-14', '2026-09-28', '2026-10-26']) {
      expect(at(iso), iso).toMatchObject({ easy: false, easyName: null, pct: 100 })
    }
  })
  it('can sit at the end of a block instead', () => {
    const s = st(); s.plan.blocks[0].easy = { at: 'last', name: 'Deload', pct: 80 }
    expect(at('2026-08-10', s).easy).toBe(false)
    expect(at('2026-09-14', s)).toMatchObject({ easy: true, easyName: 'Deload', pct: 80 })
  })
  it('is recorded on the session, so it can be told apart later', () => {
    expect(isEasySession({ wk: weekStamp(at('2026-09-21')) })).toBe(true)
    expect(isEasySession({ wk: weekStamp(at('2026-09-28')) })).toBe(false)
    expect(weekStamp(at('2026-09-28'))).toMatchObject({ w: 8, of: 12, b: 'b2', bn: 'Block 2', wb: 2 })
    expect(isEasySession({})).toBe(false)
  })
})

describe('moving the position', () => {
  it('steps back a week by starting the plan a week later', () => {
    const s = st()
    shiftWeeks(s, -1, '2026-11-16')
    expect(s.plan.start).toBe('2026-08-17')
    expect(at('2026-11-16', s)).toMatchObject({ week: 2, blockIndex: 0 })
  })
  it('steps forward a week', () => {
    const s = st()
    shiftWeeks(s, 1, '2026-11-16')
    expect(at('2026-11-16', s).week).toBe(4)
  })
  it('never goes before week 1', () => {
    const s = st()
    shiftWeeks(s, -50, '2026-08-24')
    expect(at('2026-08-24', s)).toMatchObject({ week: 1, elapsed: 0 })
  })
  it('anchors a plan that had no start before moving it', () => {
    const s = { workouts: [], routines: [] }
    shiftWeeks(s, 2, '2026-11-16')
    expect(at('2026-11-16', s).week).toBe(3)
  })
  it('jumps to the first week of a block, forwards or back', () => {
    const s = st()
    jumpToBlock(s, 'b2', '2026-11-16')
    expect(at('2026-11-16', s)).toMatchObject({ week: 7, blockIndex: 1, weekInBlock: 1, easy: true })
    jumpToBlock(s, 'b1', '2026-11-16')
    expect(at('2026-11-16', s)).toMatchObject({ week: 1, blockIndex: 0, weekInBlock: 1 })
  })
})

describe('per-block exercise lists', () => {
  const routine = () => ({ id: 'r', ex: [{ id: 'A', sets: 2 }, { id: 'B', sets: 2 }] })

  it('reads the base list until a block has one of its own', () => {
    const r = routine()
    expect(exOf(r, 'b1')).toBe(r.ex)
    expect(exOf(r, 'b2')).toBe(r.ex)
    r.alt = { b2: [{ id: 'A', sets: 3 }] }
    expect(exOf(r, 'b2')).toEqual([{ id: 'A', sets: 3 }])
    expect(exOf(r, 'b1')).toBe(r.ex)
  })
  it('gives a later block its own copy the moment it is edited', () => {
    const s = st(); const r = routine(); s.routines = [r]
    const list = ownList(s, r, 'b2')
    list[0].sets = 9
    expect(r.ex[0].sets).toBe(2)               // Block 1 untouched
    expect(exOf(r, 'b2')[0].sets).toBe(9)
    expect(hasOwnList(s, r, 'b2')).toBe(true)
  })
  it('lets the earliest block on the base list edit the base itself', () => {
    const s = st(); const r = routine()
    expect(ownList(s, r, 'b1')).toBe(r.ex)
    expect(r.alt).toBeUndefined()
  })
  it('has nothing to fork in a one-block plan', () => {
    const s = { plan: { blocks: [{ id: 'only', weeks: 6 }] } }; const r = routine()
    expect(ownList(s, r, 'only')).toBe(r.ex)
  })
  it('adds a block as a copy of the last one, for every routine', () => {
    const s = st(); const r = routine(); r.alt = { b2: [{ id: 'A', sets: 2, tech: 'Myo-reps' }] }; s.routines = [r]
    const id = addBlock(s)
    expect(s.plan.blocks).toHaveLength(3)
    expect(r.alt[id]).toEqual([{ id: 'A', sets: 2, tech: 'Myo-reps' }])
    expect(r.alt[id]).not.toBe(r.alt.b2)
    expect(s.plan.blocks[2].easy).toEqual({ at: 'first', name: 'Deload', pct: 90 })
  })
  it('removes a block with its lists, and never the last one', () => {
    const s = st(); const r = routine(); r.alt = { b2: [{ id: 'Z' }] }; s.routines = [r]
    expect(removeBlock(s, 'b2')).toBe(true)
    expect(s.plan.blocks.map(b => b.id)).toEqual(['b1'])
    expect(r.alt).toBeUndefined()
    expect(removeBlock(s, 'b1')).toBe(false)
  })
  it('hands the base list on when the block that owned it is removed', () => {
    const s = st(); const r = routine(); r.alt = { b2: [{ id: 'Z' }] }; s.routines = [r]
    removeBlock(s, 'b1')
    expect(r.ex).toEqual([{ id: 'Z' }])
    expect(exOf(r, 'b2')).toEqual([{ id: 'Z' }])
  })
  it('copies one block over another', () => {
    const s = st(); const r = routine(); r.alt = { b2: [{ id: 'Z' }] }; s.routines = [r]
    copyBlockList(s, r, 'b1', 'b2')
    expect(r.alt.b2).toEqual(r.ex)
    expect(r.alt.b2).not.toBe(r.ex)
  })
})

describe('applying a change to all blocks', () => {
  it('carries only what changed, and leaves each block its own differences', () => {
    const s = st()
    const r = { id: 'r', ex: [{ id: 'A', sets: 2, reps: 8, inc: 2.5 }], alt: { b2: [{ id: 'A', sets: 2, reps: 8, inc: 2.5, tech: 'Myo-reps' }] } }
    const before = r.ex[0]
    const after = { ...before, inc: 1.25 }
    r.ex[0] = after
    expect(applyToAllBlocks(s, r, 'b1', before, after)).toBe(1)
    expect(r.alt.b2[0]).toEqual({ id: 'A', sets: 2, reps: 8, inc: 1.25, tech: 'Myo-reps' })
  })
  it('removes a field that was cleared, and skips blocks without the exercise', () => {
    const s = st()
    const r = { id: 'r', ex: [{ id: 'A', note: 'x' }, { id: 'B' }], alt: { b2: [{ id: 'A', note: 'x' }] } }
    applyToAllBlocks(s, r, 'b1', { id: 'A', note: 'x' }, { id: 'A' })
    expect(r.alt.b2[0]).toEqual({ id: 'A' })
    expect(applyToAllBlocks(s, r, 'b1', { id: 'B' }, { id: 'B', sets: 3 })).toBe(0)
  })
  it('says which exercises read differently from the first block', () => {
    const s = st()
    const r = { id: 'r', ex: [{ id: 'A', sets: 2 }, { id: 'B', sets: 2 }], alt: { b2: [{ id: 'A', sets: 2, tech: 'Myo-reps' }, { id: 'B', sets: 2, sg: 'g' }, { id: 'C' }] } }
    expect(differsFromFirst(s, r, 'b2', r.alt.b2[0])).toBe(true)
    expect(differsFromFirst(s, r, 'b2', r.alt.b2[1])).toBe(false)    // a pairing is layout, not prescription
    expect(differsFromFirst(s, r, 'b2', r.alt.b2[2])).toBe(true)     // not in Block 1 at all
    expect(differsFromFirst(s, r, 'b1', r.ex[0])).toBe(false)
  })
})

describe('what a week prescribes', () => {
  const cfg = { id: 'A', sets: 2, reps: 8, repsMin: 6, rir: [1, 0], rirEasy: [2, 1], tech: 'Myo-reps' }

  it('a normal week gets the normal targets, and the lighter ones are left out', () => {
    expect(weekCfg(cfg, { easy: false })).toEqual({ id: 'A', sets: 2, reps: 8, repsMin: 6, rir: [1, 0], tech: 'Myo-reps' })
    expect(weekCfg(cfg, null).rir).toEqual([1, 0])
  })
  it('a lighter week gets its own effort targets and keeps the block’s reps', () => {
    expect(weekCfg(cfg, { easy: true })).toMatchObject({ sets: 2, reps: 8, repsMin: 6, rir: [2, 1] })
  })
  it('a lighter week can change sets and reps too, when the exercise says so', () => {
    const out = weekCfg({ ...cfg, lw: { sets: 1, reps: 12, repsMin: 10 } }, { easy: true })
    expect(out).toMatchObject({ sets: 1, reps: 12, repsMin: 10 })
    expect(out.lw).toBeUndefined()
  })
  it('works the same in RPE', () => {
    const rpe = { id: 'A', sets: 2, reps: 8, rpe: [9, 10], rpeEasy: [8, 9] }
    expect(effortScale(rpe)).toBe('rpe')
    expect(weekCfg(rpe, { easy: true }).rpe).toEqual([8, 9])
    expect(weekCfg(rpe, { easy: false }).rpe).toEqual([9, 10])
  })
  it('an exercise with no lighter target keeps its usual one', () => {
    expect(weekCfg({ id: 'A', rir: [0] }, { easy: true }).rir).toEqual([0])
    expect(effortScale({ id: 'A', sec: 30 })).toBe(null)
  })
})

describe('migrating a state from before plans', () => {
  const old = () => ({
    block: 2, blockNudge: '0:2', programStart: '2026-08-10',
    routines: [{ id: 'r', name: 'Upper', ex: [
      { id: 'A', sets: 2, reps: 8, rir: [0, 0], rirEasy: [1, 0], b2: 'Myo-reps' },
      { id: 'B', sets: 2, reps: 8, rir: [1, 0] },
    ] }],
    workouts: [{ id: 'w1', d: '2026-08-10', entries: [] }, { id: 'w2', d: '2026-09-28', entries: [] }],
  })

  it('writes the same programme out as two blocks', () => {
    const s = migratePlan(old())
    expect(s.plan.start).toBe('2026-08-10')
    expect(s.plan.blocks.map(b => [b.id, b.weeks, b.easy.name])).toEqual([['b1', 6, 'Intro'], ['b2', 6, 'Deload']])
  })
  it('moves each technique onto the exercise in Block 2, and out of Block 1', () => {
    const r = migratePlan(old()).routines[0]
    expect(r.ex[0].b2).toBeUndefined()
    expect(r.ex[0].tech).toBeUndefined()
    expect(r.alt.b2[0]).toMatchObject({ id: 'A', tech: 'Myo-reps', rir: [0, 0], rirEasy: [1, 0] })
    expect(r.alt.b2[0].b2).toBeUndefined()
    expect(r.alt.b2[1]).toEqual({ id: 'B', sets: 2, reps: 8, rir: [1, 0] })
  })
  it('stamps past sessions with the week they fell in', () => {
    const s = migratePlan(old())
    expect(s.workouts[0].wk).toMatchObject({ w: 1, b: 'b1', easy: 'Intro' })
    expect(s.workouts[1].wk).toMatchObject({ w: 8, b: 'b2' })
    expect(s.workouts[1].wk.easy).toBeUndefined()
  })
  it('retires the old switch', () => {
    const s = migratePlan(old())
    expect('block' in s || 'blockNudge' in s || 'programStart' in s).toBe(false)
  })
  it('is safe to run twice', () => {
    const once = migratePlan(old())
    const snapshot = JSON.stringify(once)
    expect(JSON.stringify(migratePlan(once))).toBe(snapshot)
  })
  it('gives a state that never used blocks a single block and changes nothing else', () => {
    const s = migratePlan({ routines: [{ id: 'r', ex: [{ id: 'A', sets: 3, reps: 5 }] }], workouts: [] })
    expect(s.plan.blocks).toHaveLength(1)
    expect(s.plan.blocks[0].easy).toBe(null)
    expect(s.routines[0]).toEqual({ id: 'r', ex: [{ id: 'A', sets: 3, reps: 5 }] })
  })
  it('keeps a session in progress showing what it was showing', () => {
    const s = old()
    s.active = { d: '2026-09-28', entries: [{ id: 'A', target: { id: 'A', b2: 'Myo-reps' } }] }
    migratePlan(s)
    expect(s.active.entries[0].target).toEqual({ id: 'A', tech: 'Myo-reps' })
    expect(s.active.wk.b).toBe('b2')
  })
})

describe('a deload taken on demand', () => {
  // 2026-08-24 is the third week: Block 1, week 3 of 6, a normal week.
  it('makes this week a lighter one without spending a week of the block', () => {
    const s = st()
    expect(startDeload(s, { name: 'Deload', pct: 85 }, '2026-08-26')).toBe(true)
    expect(s.plan.deloads).toEqual([{ d: '2026-08-24', name: 'Deload', pct: 85 }])
    expect(at('2026-08-24', s)).toMatchObject({ week: 3, weekInBlock: 3, easy: true, extra: true, easyName: 'Deload', pct: 85 })
    expect(at('2026-08-30', s)).toMatchObject({ easy: true, extra: true })
    // the week after is week 3 again, trained normally
    expect(at('2026-08-31', s)).toMatchObject({ week: 3, weekInBlock: 3, easy: false, extra: false })
    // and the earlier weeks are where they always were
    expect(at('2026-08-17', s)).toMatchObject({ week: 2, easy: false })
  })
  it('pushes the next block, and its scheduled lighter week, a week later', () => {
    const s = st(); startDeload(s, { pct: 90 }, '2026-08-24')
    expect(at('2026-09-21', s)).toMatchObject({ blockIndex: 0, weekInBlock: 6, easy: false })
    expect(at('2026-09-28', s)).toMatchObject({ blockIndex: 1, weekInBlock: 1, easy: true, extra: false, easyName: 'Deload' })
  })
  it('is stamped on the session like any lighter week', () => {
    const s = st(); startDeload(s, { name: '', pct: 90 }, '2026-08-24')
    expect(isEasySession({ wk: weekStamp(at('2026-08-25', s)) })).toBe(true)
  })
  it('cannot be stacked on the same week, and can be called off', () => {
    const s = st(); startDeload(s, { pct: 90 }, '2026-08-24')
    expect(startDeload(s, { pct: 80 }, '2026-08-27')).toBe(false)
    expect(cancelDeload(s, '2026-08-28')).toBe(true)
    expect(s.plan.deloads).toBeUndefined()
    expect(at('2026-08-24', s)).toMatchObject({ week: 3, easy: false, extra: false })
    expect(at('2026-08-31', s)).toMatchObject({ week: 4 })
    expect(cancelDeload(s, '2026-08-28')).toBe(false)
  })
  it('survives planOf, and garbage does not', () => {
    const s = st(); s.plan.deloads = [{ d: '2026-08-24', pct: 500 }, { d: 'soon' }, null]
    expect(planOf(s).deloads).toEqual([{ d: '2026-08-24', name: '', pct: 100 }])
    expect(planOf(st()).deloads).toBeUndefined()
  })
  it('still counts right after the week buttons moved the plan', () => {
    const s = st(); startDeload(s, { pct: 90 }, '2026-08-24')
    shiftWeeks(s, 1, '2026-08-31')            // forward a week: week 3 -> 4
    expect(at('2026-08-31', s)).toMatchObject({ week: 4, extra: false })
    expect(at('2026-08-24', s)).toMatchObject({ extra: true })
  })
})

describe('skipping a scheduled lighter week', () => {
  it('moves on to the week after it', () => {
    const s = st()
    expect(at('2026-09-21', s)).toMatchObject({ blockIndex: 1, weekInBlock: 1, easy: true })
    expect(skipEasyWeek(s, '2026-09-21')).toBe(true)
    expect(at('2026-09-21', s)).toMatchObject({ blockIndex: 1, weekInBlock: 2, easy: false })
  })
  it('does nothing in a normal week or in a deload you called yourself', () => {
    const s = st()
    expect(skipEasyWeek(s, '2026-08-24')).toBe(false)
    startDeload(s, { pct: 90 }, '2026-08-24')
    expect(skipEasyWeek(s, '2026-08-24')).toBe(false)
    expect(s.plan.start).toBe('2026-08-10')
  })
})
