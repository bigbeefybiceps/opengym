// The persisted boundary for a finished session. Keep this pure so compatibility tests can
// exercise the exact shape the UI writes without mounting React or mutating store state.
export function buildCompletedWorkout(active, { end = Date.now(), prs = [], snapshotFor } = {}) {
  const live = active?.entries || []
  const logged = entry => (entry.sets || []).some(set => set.done)
  const entries = live.filter(logged).map(entry => {
    const completed = {
      id: entry.id,
      sets: entry.sets,
      topW: entry.topW || null,
      target: entry.target || null,
    }
    const snapshot = typeof snapshotFor === 'function' ? snapshotFor(entry) : null
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && Object.keys(snapshot).length) {
      completed.muscleSnapshot = { ...snapshot }
    }
    // What you typed about this exercise today, and whether you asked to see it again next
    // time. Written only when there is something to keep, so an untouched entry is byte-for-byte
    // the shape it always was.
    const note = (entry.note || '').trim()
    if (note) {
      completed.note = note
      if (entry.notePin) completed.notePin = true
    }
    return completed
  })

  const sessionNote = (active?.note || '').trim()

  // History is what you did: an exercise with nothing ticked is not in it, and neither are
  // the session's working parts — which exercises were paired, why each weight was chosen,
  // where you had got to. Reopening the day's session (resumeWorkout) needs all of that back,
  // exactly as it was, so it rides along here in one field every reader of history ignores.
  // Written only when it holds something, so an ordinary fully-logged session keeps the
  // shape it always had.
  const unlogged = []
  live.forEach((entry, i) => { if (!logged(entry)) unlogged.push({ i, entry }) })
  const meta = live.filter(logged)
    .map(e => ({ id: e.id, ...(e.sg ? { sg: e.sg } : {}), ...(e.plan ? { plan: e.plan } : {}), ...(e.asked ? { asked: true } : {}) }))
    .filter(m => m.sg || m.plan || m.asked)
  const cur = active?.cur > 0 ? active.cur : 0
  const resume = (unlogged.length || meta.length || cur)
    ? { cur, ...(unlogged.length ? { unlogged } : {}), ...(meta.length ? { meta } : {}) }
    : null

  return {
    id: active.id,
    d: active.d,
    start: active.start,
    end,
    routineId: active.routineId,
    name: active.name,
    bw: active.bw,
    entries,
    prs,
    ...(sessionNote ? { note: sessionNote } : {}),
    ...(resume ? { resume } : {}),
  }
}

/* ============================ picking a session back up ============================
   Finishing is not meant to be the end of the day's options. You save the session, then
   realise the last set went unticked, or you go back for the exercise you skipped. Tapping
   Start again on a day you already trained reopens that session instead of beginning a
   second one against the same plan.

   The session comes back out of history entirely while it is open, rather than being edited
   in place: a workout that is in progress is not history yet, and leaving it there would
   have the card quote today's own sets back as "last time", the progression rule read the
   session as its own predecessor, and every set in it block its own PR. `prev` is the copy
   that goes back if the reopen is discarded. */
export function resumeWorkout(w, now = Date.now()) {
  // Start from what history holds — it may have been corrected since (Edit sets) and that
  // correction wins — then put back what the save set aside: pairings and prescriptions
  // onto the exercises they belong to, and the untouched exercises into the slots they
  // came from. Ascending by original position, each insert lands where it used to be.
  const entries = (w.entries || []).map(e => ({ ...e }))
  const stash = w.resume || {}
  const pool = (stash.meta || []).slice()
  entries.forEach(e => {
    const k = pool.findIndex(m => m.id === e.id)
    if (k < 0) return
    const [m] = pool.splice(k, 1)
    if (m.sg) e.sg = m.sg
    if (m.plan) e.plan = m.plan
    if (m.asked) e.asked = true
  })
  ;[...(stash.unlogged || [])].sort((a, b) => a.i - b.i)
    .forEach(u => entries.splice(Math.min(Math.max(0, u.i), entries.length), 0, { ...u.entry }))
  return {
    id: w.id,
    d: w.d,
    start: w.start,
    routineId: w.routineId,
    name: w.name,
    bw: w.bw ?? null,
    cur: Math.min(Math.max(0, stash.cur || 0), Math.max(0, entries.length - 1)),
    entries,
    ...(w.note ? { note: w.note } : {}),
    // ms: what the session had already accounted for. A reopen hours later must not bill the
    // gap as training time — that lands in the month's minutes and in the activity heatmap.
    resumed: { ms: Math.max(0, (w.end || w.start) - w.start), at: now, prev: w },
  }
}

/** How long this session has actually been open, across a reopen. */
export function activeMs(active, now = Date.now()) {
  if (!active) return 0
  return active.resumed
    ? active.resumed.ms + Math.max(0, now - active.resumed.at)
    : Math.max(0, now - active.start)
}

/**
 * The `start` a plain now-minus-start clock needs in order to show activeMs.
 *
 * Constant for the life of the session — both halves of it are fixed once — so the header's
 * ticking clock reads from it without drifting.
 */
export const elapsedStart = active => (active?.resumed
  ? active.resumed.at - active.resumed.ms
  : active?.start)
