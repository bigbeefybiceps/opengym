import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseHTML } from 'linkedom'

// The reflow is invisible by construction — display goes off and back inside one task, with
// no paint in between — so what a test can hold onto is that it happened at all, in order,
// and that it left the bar exactly as it found it.
//
// The bars are stand-ins rather than real elements: linkedom's `style` is a Proxy that
// quietly swallows a defineProperty spy, and this module's whole job is the sequence of
// writes. Handing it fakes through querySelectorAll keeps the assertion on the sequence.
let dom, bars, frames

const fakeBar = (display = '') => {
  const writes = []
  return { writes, offsetHeight: 0, style: { get display() { return display }, set display(x) { display = x; writes.push(x) } } }
}

// A fresh copy of the module per test: its "one deferred pass in flight" flag is module
// state, and a test that deliberately leaves a frame un-run would otherwise arrive in the
// next test still armed.
async function installDom(visibility = 'visible') {
  vi.resetModules()
  const parsed = parseHTML('<!doctype html><html><body></body></html>')
  dom = parsed.window
  globalThis.window = dom
  globalThis.document = dom.document
  for (const key of ['HTMLElement', 'Node', 'Element', 'Event']) globalThis[key] = dom[key]
  Object.defineProperty(dom.document, 'visibilityState', { configurable: true, get: () => visibility })
  bars = [fakeBar(), fakeBar()]
  dom.document.querySelectorAll = sel => (sel === '#tabbar,#timer' ? bars : [])
  // Drive rAF by hand so "two frames later" is something a test can step through.
  frames = []
  globalThis.requestAnimationFrame = cb => frames.push(cb)
  dom.requestAnimationFrame = globalThis.requestAnimationFrame
  const { installBarAnchor } = await import('./bar-anchor.js')
  installBarAnchor()
}

const runFrames = n => { for (let i = 0; i < n; i++) { const q = frames; frames = []; q.forEach(cb => cb()) } }
const wake = () => dom.document.dispatchEvent(new dom.Event('visibilitychange'))

describe('fixed bar re-anchoring', () => {
  beforeEach(async () => { await installDom() })

  it('reflows every bar when the app comes back to the foreground', () => {
    wake()
    for (const bar of bars) {
      expect(bar.writes).toEqual(['none', ''])
      expect(bar.style.display).toBe('')
    }
  })

  it('puts back an inline display the app had set itself', () => {
    bars = [fakeBar('flex')]
    wake()
    expect(bars[0].writes).toEqual(['none', 'flex'])
    expect(bars[0].style.display).toBe('flex')
  })

  it('runs again two frames later, once the restored viewport has settled', () => {
    wake()
    expect(bars[0].writes).toEqual(['none', ''])          // the immediate pass
    runFrames(2)
    expect(bars[0].writes).toEqual(['none', '', 'none', ''])
  })

  it('collapses a burst of events into a single deferred pass', () => {
    wake(); wake(); wake()
    expect(bars[0].writes).toHaveLength(6)                // one immediate pass each
    runFrames(2)
    expect(bars[0].writes).toHaveLength(8)                // but only one deferred pass
  })

  it('re-arms itself, so the next wake is handled too', () => {
    wake()
    runFrames(2)
    bars[0].writes.length = 0
    wake()
    runFrames(2)
    expect(bars[0].writes).toEqual(['none', '', 'none', ''])
  })
})

describe('when the app is not coming back to the foreground', () => {
  beforeEach(async () => { await installDom('hidden') })

  it('leaves the bars alone', () => {
    wake()
    runFrames(2)
    expect(bars[0].writes).toEqual([])
  })
})
