// The persisted boundary for a finished session. Keep this pure so compatibility tests can
// exercise the exact shape the UI writes without mounting React or mutating store state.
export function buildCompletedWorkout(active, { end = Date.now(), prs = [], snapshotFor } = {}) {
  const entries = (active?.entries || []).map(entry => {
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
  }).filter(entry => entry.sets.some(set => set.done))

  const sessionNote = (active?.note || '').trim()

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
  return {
    id: w.id,
    d: w.d,
    start: w.start,
    routineId: w.routineId,
    name: w.name,
    bw: w.bw ?? null,
    cur: 0,
    entries: (w.entries || []).map(e => ({ ...e })),
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
