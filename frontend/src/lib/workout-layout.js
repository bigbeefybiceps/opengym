// How the running workout is laid out (the header's ⋯ → Layout). Ported from upstream openGym.
//
//   cards    one exercise (or one superset) on screen, Prev / Next to move — the layout this
//            app always had
//   list     every exercise stacked on one scrolling page, under a pinned header
//   compact  the list without the animations and the tag rows: the numbers and little else
//
// The choice is remembered (S.workoutView), so the next session opens the way the last one was
// left. Upstream's fourth layout, Focus (one set at a time), is not in this build.
export const WORKOUT_VIEWS = ['cards', 'list', 'compact']
export const WORKOUT_VIEW_LABEL = { cards: 'Cards', list: 'List', compact: 'Compact' }
export const WORKOUT_VIEW_ICON = { cards: 'layout', list: 'list', compact: 'compact' }

/** The layout in force: the session's own choice first, then the saved one, then cards. */
export function workoutViewOf(S) {
  const v = S?.active?.workoutView || S?.workoutView
  return WORKOUT_VIEWS.includes(v) ? v : 'cards'
}

/** Pick a layout for the running session and remember it for the next one. Mutates `s`. */
export function setWorkoutView(s, v) {
  if (!WORKOUT_VIEWS.includes(v)) return
  s.workoutView = v
  if (s.active) s.active.workoutView = v
}
