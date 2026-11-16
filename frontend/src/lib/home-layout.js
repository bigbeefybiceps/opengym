// Which cards the Home screen shows, and in what order.
//
// The page is a stack of independent cards and people use different ones: someone who never
// weighs in has a body-weight card they scroll past every day, and someone who lives by it
// wants it first. So the stack is the user's to arrange — S.home = { order, hidden }.
//
// The stored layout is read defensively and merged with the list below, so a section added in
// a later version appears (at the end, visible) for a layout saved before it existed, and one
// that is removed simply drops out of everyone's order.
export const HOME_SECTIONS = [
  { id: 'week', title: 'This week', desc: 'The week strip, today’s session and cardio' },
  { id: 'bw', title: 'Body weight', desc: 'Latest weigh-in, goal and trend' },
  { id: 'streak', title: 'Streak', desc: 'Week streak, and the calendar behind it' },
]

/** The sections in the user's order, each with whether it is hidden. Never mutates S. */
export function homeLayout(S) {
  const h = (S && S.home) || {}
  const known = HOME_SECTIONS.map(s => s.id)
  const order = (Array.isArray(h.order) ? h.order : []).filter((id, i, a) => known.includes(id) && a.indexOf(id) === i)
  known.forEach(id => { if (!order.includes(id)) order.push(id) })
  const hidden = new Set(Array.isArray(h.hidden) ? h.hidden : [])
  return order.map(id => ({ ...HOME_SECTIONS.find(s => s.id === id), hidden: hidden.has(id) }))
}

const write = (s, layout) => {
  s.home = { order: layout.map(x => x.id), hidden: layout.filter(x => x.hidden).map(x => x.id) }
}

/** Move a section one place up (-1) or down (+1) — call inside store.update. */
export function moveHomeSection(s, id, dir) {
  const layout = homeLayout(s)
  const i = layout.findIndex(x => x.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= layout.length) return
  ;[layout[i], layout[j]] = [layout[j], layout[i]]
  write(s, layout)
}

/** Show or hide a section — call inside store.update. */
export function setHomeSectionHidden(s, id, hidden) {
  const layout = homeLayout(s)
  const hit = layout.find(x => x.id === id)
  if (!hit) return
  hit.hidden = !!hidden
  write(s, layout)
}

/** Back to the built-in arrangement. */
export function resetHomeLayout(s) { delete s.home }
