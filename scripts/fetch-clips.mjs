#!/usr/bin/env node
// Download free (Mixkit Free License: no signup, no attribution, no watermark) stock video clips
// into the dev inbox so they can be imported with `__devImport('file.mp4')`.
// Usage: node scripts/fetch-clips.mjs <keyword> [count=3] [resolution=1080|720|360]
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [keyword = 'nature', countArg = '3', res = '1080'] = process.argv.slice(2)
const count = Math.max(1, Number(countArg) || 3)
const dir = resolve(process.env.FREECUT_DEV_INBOX ?? 'dev-inbox')
mkdirSync(dir, { recursive: true })

const slug = encodeURIComponent(keyword.trim().toLowerCase().replace(/\s+/g, '-'))
const urls = [
  `https://mixkit.co/free-stock-video/discover/${slug}/`,
  `https://mixkit.co/free-stock-video/${slug}/`,
]
let html = ''
for (const u of urls) {
  const r = await fetch(u)
  if (r.ok) {
    html = await r.text()
    if (/assets\.mixkit\.co\/videos\/\d+/.test(html)) break
  }
}
const ids = [...new Set([...html.matchAll(/assets\.mixkit\.co\/videos\/(\d+)\/\d+-\d+\.mp4/g)].map((m) => m[1]))]
if (ids.length === 0) {
  console.error(`No clips found for "${keyword}"`)
  process.exit(1)
}
for (const id of ids.slice(0, count)) {
  const name = `mixkit-${id}-${res}.mp4`
  const file = join(dir, name)
  if (existsSync(file)) { console.log('skip', name); continue }
  const r = await fetch(`https://assets.mixkit.co/videos/${id}/${id}-${res}.mp4`)
  if (!r.ok) { console.error('fail', name, r.status); continue }
  writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  console.log('saved', file)
}
