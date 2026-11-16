#!/usr/bin/env node
// Copies the exercise stills and animations next to a built app, as exercise-media/still and /clip:
//
//   node scripts/catalogue/stage-media.mjs frontend/dist
//
// The media are licensed from Gym visual for openGym and its non-commercial forks only
// (catalogue/media/NOTICE.md): unmodified, 180 px, and served from the app's own site rather
// than hotlinked. So they travel with the build, and the notice travels with them.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const out = path.resolve(process.argv[2] || 'frontend/dist')
const media = path.join(ROOT, 'catalogue/media')

const copyDir = (from, to, ext) => {
  fs.mkdirSync(to, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(from)) {
    if (!f.endsWith(ext)) continue
    fs.copyFileSync(path.join(from, f), path.join(to, f))
    n++
  }
  return n
}
const dest = path.join(out, 'exercise-media')
const stills = copyDir(path.join(media, 'still'), path.join(dest, 'still'), '.webp')
const clips = copyDir(path.join(media, 'clip'), path.join(dest, 'clip'), '.mp4')
// An app without a single picture would pass every later check: fail here instead.
if (!stills || !clips) { console.error(`no media to stage in ${media}`); process.exit(1) }
fs.copyFileSync(path.join(media, 'NOTICE.md'), path.join(dest, 'NOTICE.md'))
console.log(`media: ${stills} stills, ${clips} animations -> ${path.relative(ROOT, out) || out}`)
