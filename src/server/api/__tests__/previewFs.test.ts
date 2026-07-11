import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { contentTypeForPath, handlePreviewFs, parseRange } from '../previewFs'

describe('contentTypeForPath', () => {
  it('maps common web asset extensions', () => {
    expect(contentTypeForPath('/x/index.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeForPath('/x/app.css')).toBe('text/css; charset=utf-8')
    expect(contentTypeForPath('/x/app.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeForPath('/x/data.json')).toBe('application/json; charset=utf-8')
    expect(contentTypeForPath('/x/logo.svg')).toBe('image/svg+xml')
    expect(contentTypeForPath('/x/p.png')).toBe('image/png')
  })
  it('maps video and audio extensions', () => {
    expect(contentTypeForPath('/x/clip.mp4')).toBe('video/mp4')
    expect(contentTypeForPath('/x/clip.webm')).toBe('video/webm')
    expect(contentTypeForPath('/x/clip.mov')).toBe('video/quicktime')
    expect(contentTypeForPath('/x/clip.m4v')).toBe('video/x-m4v')
    expect(contentTypeForPath('/x/song.mp3')).toBe('audio/mpeg')
    expect(contentTypeForPath('/x/song.wav')).toBe('audio/wav')
    expect(contentTypeForPath('/x/song.ogg')).toBe('audio/ogg')
  })
  it('falls back to octet-stream for unknown', () => {
    expect(contentTypeForPath('/x/file.bin')).toBe('application/octet-stream')
  })
})

// Deterministic 256-byte payload (bytes 0..255) so range slices are checkable.
const VIDEO_BYTES = Uint8Array.from({ length: 256 }, (_, i) => i)

function setupWorkspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'pfs-'))
  writeFileSync(path.join(root, 'index.html'), '<h1>ok</h1>')
  mkdirSync(path.join(root, 'assets'))
  writeFileSync(path.join(root, 'assets', 'a.css'), 'body{}')
  mkdirSync(path.join(root, 'dist', 'assets'), { recursive: true })
  writeFileSync(
    path.join(root, 'dist', 'index.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"></head><body><script type="module" src="/assets/app.js"></script></body></html>',
  )
  writeFileSync(path.join(root, 'dist', 'assets', 'app.css'), 'body{color:red}')
  writeFileSync(path.join(root, 'dist', 'assets', 'app.js'), 'console.log("ok")')
  writeFileSync(path.join(root, 'clip.mp4'), VIDEO_BYTES)
  return root
}

describe('parseRange', () => {
  it('returns null when no header', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange(undefined, 100)).toBeNull()
  })
  it('parses explicit closed range', () => {
    expect(parseRange('bytes=0-99', 256)).toEqual({ start: 0, end: 99 })
  })
  it('parses open-ended range to EOF', () => {
    expect(parseRange('bytes=100-', 256)).toEqual({ start: 100, end: 255 })
  })
  it('parses suffix range (last N bytes)', () => {
    expect(parseRange('bytes=-10', 256)).toEqual({ start: 246, end: 255 })
  })
  it('clamps end past EOF', () => {
    expect(parseRange('bytes=0-9999', 256)).toEqual({ start: 0, end: 255 })
  })
  it('reports unsatisfiable when start >= size', () => {
    expect(parseRange('bytes=999999-', 256)).toBe('unsatisfiable')
  })
  it('reports unsatisfiable when start > end', () => {
    expect(parseRange('bytes=50-10', 256)).toBe('unsatisfiable')
  })
  it('ignores malformed headers (falls back to full response)', () => {
    expect(parseRange('bytes=abc', 256)).toBeNull()
    expect(parseRange('items=0-9', 256)).toBeNull()
    expect(parseRange('bytes=-', 256)).toBeNull()
  })
})

describe('handlePreviewFs', () => {
  it('serves an in-workspace file with content-type', async () => {
    const root = setupWorkspace()
    const resolve = async (id: string) => (id === 's1' ? root : null)
    const res = await handlePreviewFs(new URL('http://127.0.0.1/preview-fs/s1/index.html'), resolve)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toBe('<h1>ok</h1>')
  })

  it('serves nested assets', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(new URL('http://127.0.0.1/preview-fs/s1/assets/a.css'), resolve)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  it('rewrites root-relative HTML assets to stay under the preview-fs file directory', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(new URL('http://127.0.0.1/preview-fs/s1/dist/index.html'), resolve)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<base href="/preview-fs/s1/dist/">')
    expect(body).toContain('href="/preview-fs/s1/dist/assets/app.css"')
    expect(body).toContain('src="/preview-fs/s1/dist/assets/app.js"')
  })

  it('blocks path traversal with 403', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(new URL('http://127.0.0.1/preview-fs/s1/../../etc/passwd'), resolve)
    expect(res.status).toBe(403)
  })

  it('404 when session has no workdir', async () => {
    const resolve = async () => null
    const res = await handlePreviewFs(new URL('http://127.0.0.1/preview-fs/sX/index.html'), resolve)
    expect(res.status).toBe(404)
  })

  it('serves .mp4 with video content-type and Accept-Ranges on a 200', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(new URL('http://127.0.0.1/preview-fs/s1/clip.mp4'), resolve)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe('256')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(VIDEO_BYTES)
  })

  it('serves a closed byte-range as 206 with the requested bytes', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(
      new URL('http://127.0.0.1/preview-fs/s1/clip.mp4'),
      resolve,
      new Headers({ Range: 'bytes=0-99' }),
    )
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 0-99/256')
    expect(res.headers.get('content-length')).toBe('100')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    const body = new Uint8Array(await res.arrayBuffer())
    expect(body.length).toBe(100)
    expect(body).toEqual(VIDEO_BYTES.slice(0, 100))
  })

  it('serves an open-ended byte-range to EOF as 206', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(
      new URL('http://127.0.0.1/preview-fs/s1/clip.mp4'),
      resolve,
      new Headers({ Range: 'bytes=100-' }),
    )
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 100-255/256')
    expect(res.headers.get('content-length')).toBe('156')
    const body = new Uint8Array(await res.arrayBuffer())
    expect(body.length).toBe(156)
    expect(body).toEqual(VIDEO_BYTES.slice(100))
  })

  it('returns 416 for an unsatisfiable range (start >= size)', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(
      new URL('http://127.0.0.1/preview-fs/s1/clip.mp4'),
      resolve,
      new Headers({ Range: 'bytes=999999-' }),
    )
    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe('bytes */256')
  })

  it('returns the whole file (200) when no Range header is sent', async () => {
    const root = setupWorkspace()
    const resolve = async () => root
    const res = await handlePreviewFs(
      new URL('http://127.0.0.1/preview-fs/s1/clip.mp4'),
      resolve,
      new Headers(),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-length')).toBe('256')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(VIDEO_BYTES)
  })
})
