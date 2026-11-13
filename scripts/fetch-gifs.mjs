#!/usr/bin/env node
// Download GIFs (memes/reaction clips) from a Giphy search into the dev inbox.
// Usage: node scripts/fetch-gifs.mjs <keyword> [count=5]
// Note: Giphy GIFs are third-party content; check rights before publishing.
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [keyword = 'funny', countArg = '5'] = process.argv.slice(2)
const count = Math.max(1, Number(countArg) || 5)
const dir = resolve(process.env.FREECUT_DEV_INBOX ?? 'dev-inbox')
mkdirSync(dir, { recursive: true })

const slug = encodeURIComponent(keyword.trim().replace(/\s+/g, '-'))
const res = await fetch(`https://giphy.com/search/${slug}`, { headers: { 'user-agent': 'Mozilla/5.0' } })
if (!res.ok) { console.error('search failed', res.status); process.exit(1) }
const html = await res.text()
const ids = [...new Set([...html.matchAll(/media\d*\.giphy\.com\/media\/(?:v1\.[^/"\s]+\/)?([A-Za-z0-9]+)\/(?:giphy|200)(?:_s)?\.(?:gif|webp)/g)].map((m) => m[1]))]
if (ids.length === 0) { console.error(`No GIFs found for "${keyword}"`); process.exit(1) }
for (const id of ids.slice(0, count)) {
  const name = `giphy-${id}.gif`
  const file = join(dir, name)
  if (existsSync(file)) { console.log('skip', name); continue }
  const r = await fetch(`https://i.giphy.com/media/${id}/giphy.gif`)
  if (!r.ok) { console.error('fail', name, r.status); continue }
  writeFileSync(file, Buffer.from(await r.arrayBuffer()))
  console.log('saved', file)
}
