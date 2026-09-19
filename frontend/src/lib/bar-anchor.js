// Keeps the fixed bottom bars nailed to the bottom of the screen across a suspend.
//
// Unlocking the phone straight back into an installed (Add to Home Screen) app is the case
// that breaks: iOS hands the page back before the viewport it hands back is final, and the
// tab bar — position:fixed, bottom:0 — stays painted against the viewport it was suspended
// with. It ends up floating above the bottom edge. Nothing in the document changed while
// the screen was off, so nothing marks those boxes dirty, and they sit wrong until some
// unrelated reflow happens to fix them.
//
// The fix is to make that reflow happen on purpose. Setting display to none and straight
// back inside one task never reaches the screen — the browser gets no paint opportunity in
// between, so there is no flash — but it does invalidate the box, and the bar then resolves
// `bottom` against the viewport it is actually in now.
//
// Deliberately not a React effect: this is about the paint the browser is doing, not about
// anything the app's state knows, and the bars outlive every individual view.

const SEL = '#tabbar,#timer'

function reflowBars() {
  document.querySelectorAll(SEL).forEach(el => {
    const prev = el.style.display
    el.style.display = 'none'
    void el.offsetHeight        // the read is what flushes the invalidation
    el.style.display = prev
  })
}

// Safari settles the restored viewport over the frames right after it gives control back, so
// a single pass can land against the stale one and re-anchor to the wrong place. Run once
// now and again two frames later, by which point the real viewport is in place. `pending`
// keeps a burst of events (visibilitychange and a resize usually arrive together) to one pair.
let pending = false
function reanchor() {
  reflowBars()
  if (pending) return
  pending = true
  requestAnimationFrame(() => requestAnimationFrame(() => { pending = false; reflowBars() }))
}

export function installBarAnchor() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reanchor()
  })
  // Restored from the back/forward cache — same stale-viewport problem, different door.
  window.addEventListener('pageshow', e => { if (e.persisted) reanchor() })
  // The viewport actually changing is the most direct signal there is. This also fires for
  // the on-screen keyboard, which is harmless: a reflow of two elements costs nothing and
  // never paints an intermediate state.
  window.visualViewport?.addEventListener('resize', reanchor)
}
