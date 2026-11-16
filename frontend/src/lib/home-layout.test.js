import { describe, it, expect } from 'vitest'
import { HOME_SECTIONS, homeLayout, moveHomeSection, setHomeSectionHidden, resetHomeLayout } from './home-layout.js'

const ids = S => homeLayout(S).map(x => x.id)
const shown = S => homeLayout(S).filter(x => !x.hidden).map(x => x.id)

describe('the Home screen layout', () => {
  it('starts as the built-in order with everything showing', () => {
    expect(ids({})).toEqual(['week', 'bw', 'streak'])
    expect(shown(null)).toEqual(['week', 'bw', 'streak'])
  })
  it('moves a section up and down', () => {
    const S = {}
    moveHomeSection(S, 'bw', -1)
    expect(ids(S)).toEqual(['bw', 'week', 'streak'])
    moveHomeSection(S, 'bw', 1); moveHomeSection(S, 'bw', 1)
    expect(ids(S)).toEqual(['week', 'streak', 'bw'])
  })
  it('does nothing at either end', () => {
    const S = {}
    moveHomeSection(S, 'week', -1)
    moveHomeSection(S, 'streak', 1)
    expect(ids(S)).toEqual(['week', 'bw', 'streak'])
    expect(S.home).toBeUndefined()
  })
  it('hides a section without losing its place, and shows it again', () => {
    const S = {}
    setHomeSectionHidden(S, 'bw', true)
    expect(ids(S)).toEqual(['week', 'bw', 'streak'])
    expect(shown(S)).toEqual(['week', 'streak'])
    setHomeSectionHidden(S, 'bw', false)
    expect(shown(S)).toEqual(['week', 'bw', 'streak'])
  })
  it('keeps a hidden section hidden while it is moved', () => {
    const S = {}
    setHomeSectionHidden(S, 'bw', true)
    moveHomeSection(S, 'bw', 1)
    expect(ids(S)).toEqual(['week', 'streak', 'bw'])
    expect(shown(S)).toEqual(['week', 'streak'])
  })
  it('survives a layout saved by another version', () => {
    // an id this version does not know, a duplicate, and one known section missing
    const S = { home: { order: ['streak', 'gone', 'streak', 'week'], hidden: ['gone', 'week'] } }
    expect(ids(S)).toEqual(['streak', 'week', 'bw'])       // unknown dropped, missing appended
    expect(shown(S)).toEqual(['streak', 'bw'])
    expect(ids({ home: { order: 'nonsense', hidden: 7 } })).toEqual(['week', 'bw', 'streak'])
  })
  it('resets to the built-in arrangement', () => {
    const S = {}
    setHomeSectionHidden(S, 'streak', true); moveHomeSection(S, 'bw', -1)
    resetHomeLayout(S)
    expect(shown(S)).toEqual(HOME_SECTIONS.map(s => s.id))
  })
})
