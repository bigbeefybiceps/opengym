// Plate math for the in-workout calculator: given a target total and a bar, what goes on
// each side. Pure so the sheet stays a thin view over it.
//
// The inventory is the standard calibrated set for each unit, unlimited pairs of each; the
// profile can replace it with the plates you actually own (Settings -> Plates, see platesOf).
// Loading biggest-first is how the answer is
// *shown*; it is not how it can be *computed*: the kg set is not greedy-safe (1.5 per side
// is three 0.5s, but greedy grabs the 1.25 and strands the rest), so the pick below is a
// tiny exact coin-change over fixed sub-unit steps instead.
export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [55, 45, 35, 25, 10, 5, 2.5]
}
export const DEFAULT_BAR = { kg: 20, lb: 45 }

// Twentieths: fine enough that a 0.1 kg micro plate is still an exact integer, coarse enough
// that the table below stays small. Anything finer than 0.05 is not a plate you can buy, and
// a size that rounds to nothing has to be dropped — a zero coin never terminates.
const U = 20

/**
 * `{ belowBar, plates, achieved, leftover }` — `plates` as `[{ w, n }]` per side (largest
 * first, fewest plates), `achieved` the closest loadable total at or below the target,
 * `leftover` what could not be covered (0 on an exact load). A target under the bar returns
 * `belowBar` instead of a negative plate count. `sizes` overrides the unit's inventory —
 * pass the profile's own plates (platesOf) so the answer only uses what is on the rack.
 */
export function platesFor(target, bar, unit = 'kg', sizes) {
  const inv = (Array.isArray(sizes) && sizes.length ? sizes : PLATES[unit] || PLATES.kg)
  const b = bar > 0 ? bar : 0
  const perSide = ((target || 0) - b) / 2
  if (perSide < -1e-9) return { belowBar: true, plates: [], achieved: b, leftover: 0 }

  const cap = Math.floor(perSide * U + 1e-6)
  const coins = [...new Set(inv.map(p => Math.round(p * U)).filter(c => c > 0))]
  if (!coins.length) return { belowBar: false, plates: [], achieved: b, leftover: Math.round((target - b) * 1000) / 1000 }
  // dp[v] = fewest plates summing to exactly v sub-units; `from[v]` rebuilds the pick.
  const dp = new Array(cap + 1).fill(Infinity)
  const from = new Array(cap + 1).fill(-1)
  dp[0] = 0
  for (let v = 1; v <= cap; v++) {
    for (const c of coins) {
      if (c <= v && dp[v - c] + 1 < dp[v]) { dp[v] = dp[v - c] + 1; from[v] = c }
    }
  }
  let best = cap
  while (best > 0 && !isFinite(dp[best])) best--
  const count = new Map()
  for (let v = best; v > 0; v -= from[v]) count.set(from[v], (count.get(from[v]) || 0) + 1)
  const plates = [...count.entries()].map(([c, n]) => ({ w: c / U, n })).sort((a, z) => z.w - a.w)
  const achieved = Math.round((b + (best / U) * 2) * 1000) / 1000
  return { belowBar: false, plates, achieved, leftover: Math.round((target - achieved) * 1000) / 1000 }
}

/* ---------------------------------------------------------------------------
   The bars you actually own. Editable in Settings → Bars; until someone edits
   the list, these stand in so the calculator works out of the box. "No bar" is
   not one of them: 0 is offered by the picker itself and can never be deleted,
   because a machine or a loading pin always needs it. */
export const DEFAULT_BARS = {
  kg: [
    { id: 'bar-olympic', name: 'Olympic bar', w: 20 },
    { id: 'bar-womens', name: "Women's bar", w: 15 },
    { id: 'bar-short', name: 'Short / EZ bar', w: 10 }
  ],
  lb: [
    { id: 'bar-olympic', name: 'Olympic bar', w: 45 },
    { id: 'bar-womens', name: "Women's bar", w: 35 },
    { id: 'bar-short', name: 'Short / EZ bar', w: 15 }
  ]
}

/** The profile's bars, falling back to the defaults for its unit. Never empty. */
export function barsOf(S) {
  const unit = S && S.unit === 'lb' ? 'lb' : 'kg'
  const list = S && Array.isArray(S.bars) ? S.bars.filter(b => b && b.w >= 0) : null
  return list && list.length ? list : DEFAULT_BARS[unit]
}

/** The profile's plate sizes, falling back to the unit's standard set. Never empty. */
export function platesOf(S) {
  const unit = S && S.unit === 'lb' ? 'lb' : 'kg'
  const list = S && Array.isArray(S.plates) ? S.plates.filter(p => p > 0) : null
  return list && list.length ? [...list].sort((a, b) => b - a) : PLATES[unit]
}
