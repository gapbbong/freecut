import { createReadStream, readdirSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite-plus'

const ROUTE = '/__dev-inbox'

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
}

export interface DevInboxRequest {
  method: string | undefined
  url: string | undefined
  remoteAddress: string | undefined
  secFetchSite: string | undefined
}

export type DevInboxResponse =
  | { status: 200; kind: 'list'; body: string }
  | { status: 200; kind: 'file'; path: string; size: number; contentType: string }
  | { status: 403 | 404 | 405; kind: 'error'; message: string }

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Read-only view of a single folder. Serves direct children files only, and only
 * to same-machine, non-cross-site requests, because the dev server is started
 * with `--host` and must not expose the folder to the LAN or to other web pages.
 */
export function handleDevInboxRequest(
  inboxDir: string,
  request: DevInboxRequest,
): DevInboxResponse {
  if (!isLoopback(request.remoteAddress) || request.secFetchSite === 'cross-site') {
    return { status: 403, kind: 'error', message: 'forbidden' }
  }
  if (request.method !== 'GET') {
    return { status: 405, kind: 'error', message: 'method not allowed' }
  }

  const dir = resolve(inboxDir)
  let name: string
  try {
    name = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/').replace(/^\/+/, '')
  } catch {
    return { status: 404, kind: 'error', message: 'not found' }
  }

  if (name === '') {
    let files: { name: string; size: number }[] = []
    try {
      files = readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => ({ name: entry.name, size: statSync(join(dir, entry.name)).size }))
    } catch {
      // A missing inbox folder is an empty inbox.
    }
    return { status: 200, kind: 'list', body: JSON.stringify({ dir, files }) }
  }

  if (name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    return { status: 404, kind: 'error', message: 'not found' }
  }

  const filePath = resolve(dir, name)
  if (!filePath.startsWith(dir + sep)) {
    return { status: 404, kind: 'error', message: 'not found' }
  }

  try {
    const stats = statSync(filePath)
    if (!stats.isFile()) {
      return { status: 404, kind: 'error', message: 'not found' }
    }
    return {
      status: 200,
      kind: 'file',
      path: filePath,
      size: stats.size,
      contentType: MIME_BY_EXTENSION[extname(name).toLowerCase()] ?? 'application/octet-stream',
    }
  } catch {
    return { status: 404, kind: 'error', message: 'not found' }
  }
}

/** Dev-server only: lets a script drop files into one folder and import them via `window.__devImport`. */
export function devInboxPlugin(options: { dir: string }): Plugin {
  return {
    name: 'freecut-dev-inbox',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ROUTE, (req, res) => {
        const result = handleDevInboxRequest(options.dir, {
          method: req.method,
          url: req.url,
          remoteAddress: req.socket.remoteAddress,
          secFetchSite: req.headers['sec-fetch-site'] as string | undefined,
        })

        res.setHeader('Cache-Control', 'no-store')
        if (result.kind === 'error') {
          res.statusCode = result.status
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(result.message)
          return
        }
        if (result.kind === 'list') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(result.body)
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', result.contentType)
        res.setHeader('Content-Length', String(result.size))
        createReadStream(result.path).pipe(res)
      })
    },
  }
}
