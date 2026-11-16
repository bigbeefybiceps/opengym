// "Watch on YouTube" in an exercise's ⋯ menu: a plain search for the exercise's catalogue name
// plus "form" (a custom exercise searches its own name). No API, no key, nothing embedded: the
// address is only built here, and only opened after a tap (in the YouTube app where the phone
// has it). Null when there is no name to search for. Ported from upstream openGym.
export function youtubeSearchUrl(ex) {
  if (!ex || ex.missing) return null
  const name = String(ex?.n || '').replace(/\s+/g, ' ').trim().slice(0, 100)
  if (!name) return null
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' form').replace(/%20/g, '+')
}
