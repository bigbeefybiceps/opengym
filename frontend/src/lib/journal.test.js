import { describe, it, expect } from 'vitest'
import { collectNotes, filterNotes, normFilter, filterIsEmpty, kindCounts, notedExercises, foldersOf, withFolder } from './journal.js'

const S = {
  workouts: [
    { id: 'w1', d: '2026-10-01', name: 'Upper 1', note: 'Felt strong', entries: [
      { id: '0047', note: 'Left shoulder pinched on set 2', notePin: true, sets: [] },
      { id: '0596', sets: [] },
    ] },
    { id: 'w2', d: '2026-11-03', name: 'Lower 1', entries: [{ id: '0043', note: '  Depth was better  ', sets: [] }] },
    { id: 'w3', d: 'not a day', note: 'ignored', entries: [] },
  ],
  cardioLog: [{ id: 'c1', d: '2026-10-20', mod: 'Bike', min: 30, note: 'Level 8, easy' }, { id: 'c2', d: '2026-10-21', mod: 'Run', min: 20 }],
  exNotes: { '0047': 'Seat height 4', '0596': '   ' },
  routines: [{ id: 'r1', name: 'Upper 1',
    ex: [{ id: '0047', note: 'Bar only, then add a plate a side' }, { id: '0596' }],
    alt: { b2: [{ id: '0047', note: 'Bar only, then add a plate a side' }, { id: '0596', note: 'Pause at the chest' }] } }],
}

describe('collectNotes', () => {
  const notes = collectNotes(S)
  it('reads every kind of note from where it was written', () => {
    expect(notes.map(n => n.kind)).toEqual(['exercise', 'cardio', 'workout', 'exercise', 'standing', 'tip', 'tip'])
  })
  it('puts dated notes newest first and keeps one workout’s notes together', () => {
    expect(notes.filter(n => n.d).map(n => n.d)).toEqual(['2026-11-03', '2026-10-20', '2026-10-01', '2026-10-01'])
    expect(notes[2]).toMatchObject({ kind: 'workout', text: 'Felt strong', title: 'Upper 1', wid: 'w1' })
    expect(notes[3]).toMatchObject({ kind: 'exercise', exId: '0047', pinned: true })
  })
  it('trims text and skips blanks and workouts without a real date', () => {
    expect(notes[0].text).toBe('Depth was better')
    expect(notes.some(n => n.text === 'ignored')).toBe(false)
    expect(notes.filter(n => n.kind === 'standing')).toHaveLength(1)
  })
  it('counts a tip repeated in every block of a routine once', () => {
    const tips = notes.filter(n => n.kind === 'tip')
    expect(tips.map(n => n.text)).toEqual(['Bar only, then add a plate a side', 'Pause at the chest'])
    expect(new Set(notes.map(n => n.key)).size).toBe(notes.length)
  })
  it('survives a state with nothing in it', () => {
    expect(collectNotes({})).toEqual([])
    expect(collectNotes(null)).toEqual([])
  })
})

describe('filterNotes', () => {
  const notes = collectNotes(S)
  const nameOf = id => ({ '0047': 'Barbell Bench Press', '0043': 'Barbell Squat' }[id] || '')
  it('narrows by kind, exercise and words', () => {
    expect(filterNotes(notes, { kinds: ['cardio'] })).toHaveLength(1)
    expect(filterNotes(notes, { exId: '0047' }).map(n => n.kind)).toEqual(['exercise', 'standing', 'tip'])
    expect(filterNotes(notes, { q: 'SHOULDER' })).toHaveLength(1)
  })
  it('finds a note by its exercise’s name and ignores accents', () => {
    expect(filterNotes(notes, { q: 'squat' }, nameOf).map(n => n.exId)).toEqual(['0043'])
    expect(filterNotes([{ kind: 'workout', text: 'presión alta', d: '2026-01-01' }], { q: 'presion' })).toHaveLength(1)
  })
  it('keeps only dated notes inside a date range', () => {
    expect(filterNotes(notes, { from: '2026-10-15' }).map(n => n.d)).toEqual(['2026-11-03', '2026-10-20'])
    expect(filterNotes(notes, { to: '2026-10-01' })).toHaveLength(2)
  })
  it('counts kinds and the most-noted exercises', () => {
    expect(kindCounts(notes)).toEqual({ exercise: 2, cardio: 1, workout: 1, standing: 1, tip: 2 })
    expect(notedExercises(notes)[0]).toEqual({ id: '0047', count: 3 })
  })
})

describe('normFilter', () => {
  it('drops junk, swaps a backwards range, and treats "every kind" as no kind filter', () => {
    expect(normFilter({ kinds: ['nope', 'tip', 'tip'], from: '2026-05-02', to: '2026-01-01', q: '  hi  ', exId: 7 }))
      .toEqual({ kinds: ['tip'], from: '2026-01-01', to: '2026-05-02', q: 'hi' })
    expect(normFilter({ kinds: ['workout', 'exercise', 'standing', 'tip', 'cardio'] })).toEqual({})
    expect(filterIsEmpty({ q: '   ' })).toBe(true)
    expect(filterIsEmpty({ exId: '0047' })).toBe(false)
  })
})

describe('folders', () => {
  it('saves, renames and deletes a folder without touching the others', () => {
    let map = withFolder(undefined, 'a', { name: ' Shoulder ', filter: { q: 'shoulder', junk: 1 } })
    map = withFolder(map, 'b', { name: 'Cardio', filter: { kinds: ['cardio'] } })
    expect(foldersOf({ journalFolders: map })).toEqual([
      { id: 'b', name: 'Cardio', filter: { kinds: ['cardio'] } },
      { id: 'a', name: 'Shoulder', filter: { q: 'shoulder' } },
    ])
    map = withFolder(map, 'a', null)
    expect(Object.keys(map)).toEqual(['b'])
    expect(withFolder(map, 'c', { name: '   ', filter: {} })).toEqual(map)
  })
})
