// Plate math for the in-workout calculator: given a target total and a bar, what goes on
// each side. Pure so the sheet stays a thin view over it.
//
// The inventory is the standard calibrated set for each unit, unlimited pairs of each — a
// home-gym profile could narrow this later. Loading biggest-first is how the answer is
// *shown*; it is not how it can be *computed*: the kg set is not greedy-safe (1.5 per side
// is three 0.5s, but greedy grabs the 1.25 and strands the rest), so the pick below is a
// tiny exact coin-change over quarter-unit steps instead.
export const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [55, 45, 35, 25, 10, 5, 2.5]
}
export const DEFAULT_BAR = { kg: 20, lb: 45 }

// Quarter units keep every plate in both inventories an exact integer.
const U = 4

/**
 * `{ belowBar, plates, achieved, leftover }` — `plates` as `[{ w, n }]` per side (largest
 * first, fewest plates), `achieved` the closest loadable total at or below the target,
 * `leftover` what could not be covered (0 on an exact load). A target under the bar returns
 * `belowBar` instead of a negative plate count.
 */
export function platesFor(target, bar, unit = 'kg') {
  const sizes = PLATES[unit] || PLATES.kg
  const b = bar > 0 ? bar : 0
  const perSide = ((target || 0) - b) / 2
  if (perSide < -1e-9) return { belowBar: true, plates: [], achieved: b, leftover: 0 }

  const cap = Math.floor(perSide * U + 1e-6)
  const coins = sizes.map(p => Math.round(p * U))
  // dp[v] = fewest plates summing to exactly v quarter-units; `from[v]` rebuilds the pick.
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
