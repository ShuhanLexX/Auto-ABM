import { describe, expect, it } from 'vitest'
import { classifyPreviewLink } from './previewLinkRouter'

describe('classifyPreviewLink', () => {
  it('classifies loopback urls as browser-localhost', () => {
    expect(classifyPreviewLink('http://localhost:5173/').kind).toBe('browser-localhost')
    expect(classifyPreviewLink('http://127.0.0.1:8080/x').kind).toBe('browser-localhost')
  })
  it('classifies html file paths as browser-file', () => {
    expect(classifyPreviewLink('file:///Users/x/index.html').kind).toBe('browser-file')
    expect(classifyPreviewLink('/Users/x/page.htm').kind).toBe('browser-file')
    expect(classifyPreviewLink('./out/index.html').kind).toBe('browser-file')
  })
  it('classifies relative previewable docs as file-preview', () => {
    expect(classifyPreviewLink('docs/report.md').kind).toBe('file-preview')
    expect(classifyPreviewLink('src/app.ts').kind).toBe('file-preview')
  })
  it('classifies remote http(s) as remote', () => {
    expect(classifyPreviewLink('https://example.com').kind).toBe('remote')
  })
  it('ignores anchors and empty', () => {
    expect(classifyPreviewLink('#section').kind).toBe('ignored')
    expect(classifyPreviewLink('').kind).toBe('ignored')
  })
  it('exposes a normalized path for file kinds', () => {
    expect(classifyPreviewLink('file:///Users/x/index.html').path).toBe('/Users/x/index.html')
    expect(classifyPreviewLink('docs/report.md').path).toBe('docs/report.md')
  })
})
