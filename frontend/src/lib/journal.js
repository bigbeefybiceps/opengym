// The journal (Stats → Journal): every note the app keeps, in one feed.
//
// Notes live where they were written and stay there: a workout's own note on the workout, an
// exercise's note for the day on its entry, the standing note in S.exNotes, a routine's
// instruction on its slot, a cardio session's on its log entry. The journal only reads them back,
// so nothing is stored twice and an edit anywhere shows here at once. The one thing it keeps
// itself:
//
//   S.journalFolders = { '<id>': { name, filter: { kinds, exId, from, to, q } }, … }
//     A folder is a saved filter, not a box: a note is never filed, it turns up in every folder
//     whose filter it matches.
//
// Ported from upstream openGym (lib/journal.js). This build has no set notes, check-ins, day
// notes, recovery sessions or gym pins, so those kinds are not here; cardio notes are this
// build's own.

// In the order the filter offers them. Labels are English source strings.
export const NOTE_KINDS = ['workout', 'exercise', 'standing', 'tip', 'cardio']
export const NOTE_KIND_LABEL = {
  workout: 'Workout notes', exercise: 'Exercise notes', standing: 'Always-on notes',
  tip: 'Routine tips', cardio: 'Cardio notes',
}
export const NOTE_KIND_ICON = {
  workout: 'note', exercise: 'dumbbell', standing: 'info', tip: 'lightbulb', cardio: 'figureRun',
}
export const FOLDERS_MAX = 30

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/
const txt = v => (typeof v === 'string' ? v.trim() : '')
const wkey = w => (w?.id != null ? String(w.id) : `${w?.d}|${w?.start}`)

/**
 * Every note, newest first; notes without a day of their own (always-on, routine tips) after the
 * dated ones. Each is { key, kind, text, d (or null), title?, exId?, wid?, routineId?, cid?,
 * pinned? }. `key` is stable across renders, for React and for opening one.
 */
export function collectNotes(S) {
  const out = []
  for (const w of Array.isArray(S?.workouts) ? S.workouts : []) {
    if (!w || !ISO.test(String(w.d || ''))) continue
    const wid = wkey(w)
    const base = { d: w.d, wid, title: w.name || '' }
    if (txt(w.note)) out.push({ key: 'w:' + wid, kind: 'workout', text: txt(w.note), ...base })
    ;(Array.isArray(w.entries) ? w.entries : []).forEach((en, ei) => {
      if (en && txt(en.note)) out.push({ key: `e:${wid}:${ei}`, kind: 'exercise', text: txt(en.note), exId: en.id, ...(en.notePin ? { pinned: true } : {}), ...base })
    })
  }
  for (const c of Array.isArray(S?.cardioLog) ? S.cardioLog : []) {
    if (c && ISO.test(String(c.d || '')) && txt(c.note)) out.push({ key: 'c:' + (c.id ?? c.d), kind: 'cardio', text: txt(c.note), d: c.d, title: c.mod || '', cid: c.id })
  }
  // Newest day first; within a day the order they were found in (a workout's notes stay together).
  const dated = out.map((n, i) => [n, i]).sort((a, b) => (a[0].d < b[0].d ? 1 : a[0].d > b[0].d ? -1 : a[1] - b[1])).map(([n]) => n)

  const undated = []
  for (const [exId, v] of Object.entries(isMap(S?.exNotes) ? S.exNotes : {})) {
    if (txt(v)) undated.push({ key: 'x:' + exId, kind: 'standing', text: txt(v), d: null, exId })
  }
  for (const r of Array.isArray(S?.routines) ? S.routines : []) {
    // A routine can carry one exercise list per training block (r.alt); the same instruction
    // repeated in each of them is one tip, not one per block.
    const seen = new Set()
    const lists = [r?.ex, ...Object.values(isMap(r?.alt) ? r.alt : {})]
    lists.forEach(list => (Array.isArray(list) ? list : []).forEach(slot => {
      const text = slot && txt(slot.note)
      if (!text || seen.has(slot.id + '|' + text)) return
      seen.add(slot.id + '|' + text)
      undated.push({ key: `t:${r.id}:${slot.id}:${seen.size}`, kind: 'tip', text, d: null, exId: slot.id, routineId: r.id, title: r.name || '' })
    }))
  }
  return [...dated, ...undated]
}

/** A clean filter: every field optional, junk dropped. */
export function normFilter(f) {
  const o = isMap(f) ? f : {}
  const kinds = Array.isArray(o.kinds) ? [...new Set(o.kinds.filter(k => NOTE_KINDS.includes(k)))] : []
  const out = {}
  if (kinds.length && kinds.length < NOTE_KINDS.length) out.kinds = kinds
  if (typeof o.exId === 'string' && o.exId) out.exId = o.exId.slice(0, 80)
  if (ISO.test(String(o.from || ''))) out.from = o.from
  if (ISO.test(String(o.to || ''))) out.to = o.to
  if (out.from && out.to && out.from > out.to) [out.from, out.to] = [out.to, out.from]
  const q = txt(o.q).slice(0, 80)
  if (q) out.q = q
  return out
}

/** Whether the filter narrows anything at all. */
export const filterIsEmpty = f => Object.keys(normFilter(f)).length === 0

// Case and accent blind, so "presion" finds "presión".
const fold = s => String(s || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * The notes `filter` lets through. A date range keeps only dated notes, since an always-on note has
 * no day to fall in. `nameOf(exId)` lets the text search find a note by its exercise's name too.
 */
export function filterNotes(notes, filter, nameOf = null) {
  const f = normFilter(filter)
  const kinds = f.kinds ? new Set(f.kinds) : null
  const q = f.q ? fold(f.q) : ''
  return notes.filter(n => {
    if (kinds && !kinds.has(n.kind)) return false
    if (f.exId && n.exId !== f.exId) return false
    if ((f.from || f.to) && !n.d) return false
    if (f.from && n.d < f.from) return false
    if (f.to && n.d > f.to) return false
    if (q) {
      const hay = fold(n.text) + ' ' + fold(n.title) + (n.exId && nameOf ? ' ' + fold(nameOf(n.exId)) : '')
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** How many notes each kind has, for the filter's chips. */
export function kindCounts(notes) {
  const out = {}
  for (const n of notes) out[n.kind] = (out[n.kind] || 0) + 1
  return out
}

/** The exercises that have a note, most noted first, for the filter's exercise picker. */
export function notedExercises(notes) {
  const n = new Map()
  for (const x of notes) if (x.exId) n.set(x.exId, (n.get(x.exId) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, count }))
}

/* ---------- folders: saved filters ---------- */

/** Every folder, alphabetical, as { id, name, filter }. */
export function foldersOf(S) {
  const map = isMap(S?.journalFolders) ? S.journalFolders : {}
  const out = []
  for (const [id, v] of Object.entries(map)) {
    const name = txt(v?.name).slice(0, 40)
    if (name) out.push({ id, name, filter: normFilter(v.filter) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** S.journalFolders with `id` set to { name, filter }, or removed with null. */
export function withFolder(map, id, folder) {
  const next = { ...(isMap(map) ? map : {}) }
  const name = txt(folder?.name).slice(0, 40)
  if (folder && name) next[id] = { name, filter: normFilter(folder.filter) }
  else delete next[id]
  return next
}
