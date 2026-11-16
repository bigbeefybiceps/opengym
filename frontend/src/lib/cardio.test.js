import { describe, it, expect } from 'vitest'
import { cleanCardio, cardioPlanFor, cardioOn, cardioWeek, cardioDaysPlanned, cardioLine, cardioIcon } from './cardio.js'

describe('planned cardio', () => {
  // 2026-11-16 is a Monday (weekday 1); 2026-11-18 a Wednesday (3).
  const S = { cardio: { 1: { mod: 'Incline walk', min: 20, note: 'easy' }, 3: { mod: 'Bike', min: 30 } }, cardioLog: [] }

  it('belongs to the weekday, with or without a routine that day', () => {
    expect(cardioPlanFor(S, '2026-11-16')).toEqual({ mod: 'Incline walk', min: 20, note: 'easy' })
    expect(cardioPlanFor(S, '2026-11-18')).toEqual({ mod: 'Bike', min: 30 })
    expect(cardioPlanFor(S, '2026-11-17')).toBe(null)
    expect(cardioPlanFor({}, '2026-11-16')).toBe(null)
  })
  it('counts the days it is planned on', () => {
    expect(cardioDaysPlanned(S)).toBe(2)
    expect(cardioDaysPlanned({ cardio: { 1: { mod: '', min: 20 } } })).toBe(0)
  })
  it('reads as one line', () => {
    expect(cardioLine({ mod: 'Incline walk', min: 20, note: 'easy' })).toBe('Incline walk · 20 min · easy')
    expect(cardioLine({ mod: 'Bike', min: 45, dist: 18.5 }, 'km')).toBe('Bike · 45 min · 18.5 km')
    expect(cardioLine(null)).toBe('')
  })
  it('picks an icon that matches', () => {
    expect(cardioIcon('Bike')).toBe('bike')
    expect(cardioIcon('Swim')).toBe('swim')
    expect(cardioIcon('Stair climber')).toBe('figureRun')
  })
})

describe('cleaning what comes in', () => {
  it('needs a modality and some minutes', () => {
    expect(cleanCardio({ mod: 'Bike', min: 0 })).toBe(null)
    expect(cleanCardio({ mod: '  ', min: 20 })).toBe(null)
    expect(cleanCardio(null)).toBe(null)
  })
  it('clamps the numbers and drops what is empty', () => {
    expect(cleanCardio({ mod: 'Bike', min: 9999, dist: -3, note: '' })).toEqual({ mod: 'Bike', min: 600 })
    expect(cleanCardio({ mod: ' Rower ', min: 19.6, dist: 4.256, note: ' steady ' })).toEqual({ mod: 'Rower', min: 20, dist: 4.26, note: 'steady' })
  })
})

describe('the cardio log', () => {
  const S = { cardioLog: [
    { id: 'a', d: '2026-11-15', mod: 'Bike', min: 30 },          // Sunday — the week before
    { id: 'b', d: '2026-11-16', mod: 'Incline walk', min: 20 },  // Monday
    { id: 'c', d: '2026-11-16', mod: 'Rower', min: 10 },
    { id: 'd', d: '2026-11-22', mod: 'Bike', min: 45 },          // Sunday of the same week
    { id: 'e', d: '2026-11-23', mod: 'Bike', min: 45 },          // next Monday
  ] }

  it('lists what was done on a day', () => {
    expect(cardioOn(S, '2026-11-16').map(c => c.id)).toEqual(['b', 'c'])
    expect(cardioOn(S, '2026-11-17')).toEqual([])
    expect(cardioOn({}, '2026-11-16')).toEqual([])
  })
  it('totals a Monday-to-Sunday week, whichever day of it you ask from', () => {
    expect(cardioWeek(S, '2026-11-16')).toEqual({ min: 75, sessions: 3 })
    expect(cardioWeek(S, '2026-11-20')).toEqual({ min: 75, sessions: 3 })
    expect(cardioWeek(S, '2026-11-15')).toEqual({ min: 30, sessions: 1 })
    expect(cardioWeek({}, '2026-11-16')).toEqual({ min: 0, sessions: 0 })
  })
})
