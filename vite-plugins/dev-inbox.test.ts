import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleDevInboxRequest, type DevInboxRequest } from './dev-inbox'

let root: string
let inbox: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'dev-inbox-'))
  inbox = join(root, 'inbox')
  mkdirSync(inbox)
  mkdirSync(join(inbox, 'nested'))
  writeFileSync(join(inbox, 'music.mp3'), 'abc')
  writeFileSync(join(inbox, 'pic.PNG'), 'abcd')
  writeFileSync(join(root, 'secret.txt'), 'outside')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function request(overrides: Partial<DevInboxRequest> = {}): DevInboxRequest {
  return {
    method: 'GET',
    url: '/',
    remoteAddress: '127.0.0.1',
    secFetchSite: 'same-origin',
    ...overrides,
  }
}

describe('handleDevInboxRequest', () => {
  it('lists only files in the inbox folder', () => {
    const result = handleDevInboxRequest(inbox, request())
    expect(result.kind).toBe('list')
    if (result.kind !== 'list') return
    const { files } = JSON.parse(result.body) as { files: { name: string; size: number }[] }
    expect(files.map((file) => file.name).sort()).toEqual(['music.mp3', 'pic.PNG'])
  })

  it('serves a file with its media type and size', () => {
    const result = handleDevInboxRequest(inbox, request({ url: '/pic.PNG' }))
    expect(result).toMatchObject({ status: 200, kind: 'file', size: 4, contentType: 'image/png' })
  })

  it('decodes percent-encoded names', () => {
    writeFileSync(join(inbox, '한글 파일.mp3'), 'x')
    const result = handleDevInboxRequest(
      inbox,
      request({ url: `/${encodeURIComponent('한글 파일.mp3')}` }),
    )
    expect(result).toMatchObject({ status: 200, kind: 'file', contentType: 'audio/mpeg' })
  })

  it('treats a missing inbox folder as empty', () => {
    const result = handleDevInboxRequest(join(root, 'missing'), request())
    expect(result.kind).toBe('list')
    if (result.kind === 'list') expect(JSON.parse(result.body).files).toEqual([])
  })

  it.each([
    '/../secret.txt',
    '/..%2Fsecret.txt',
    '/nested/x',
    '/%2E%2E',
    '/..\\secret.txt',
    '/nested',
  ])('refuses path escape or non-file target %s', (url) => {
    expect(handleDevInboxRequest(inbox, request({ url })).status).toBe(404)
  })

  it('returns 404 for malformed percent-encoding', () => {
    expect(handleDevInboxRequest(inbox, request({ url: '/%E0%A4%A' })).status).toBe(404)
  })

  it.each(['192.168.0.10', '100.90.163.62', '::ffff:192.168.0.10', undefined])(
    'refuses non-loopback client %s',
    (remoteAddress) => {
      expect(handleDevInboxRequest(inbox, request({ remoteAddress })).status).toBe(403)
    },
  )

  it('refuses cross-site requests even from loopback', () => {
    expect(handleDevInboxRequest(inbox, request({ secFetchSite: 'cross-site' })).status).toBe(403)
  })

  it.each(['::1', '::ffff:127.0.0.1'])('accepts loopback client %s', (remoteAddress) => {
    expect(handleDevInboxRequest(inbox, request({ remoteAddress })).status).toBe(200)
  })

  it.each(['POST', 'PUT', 'DELETE'])('refuses %s', (method) => {
    expect(handleDevInboxRequest(inbox, request({ method, url: '/music.mp3' })).status).toBe(405)
  })
})
