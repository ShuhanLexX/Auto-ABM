import { api } from './client'

type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
  relativePath?: string
}

type BrowseResult = {
  currentPath: string
  parentPath: string
  entries: DirEntry[]
  query?: string
  error?: string
}

export const filesystemApi = {
  browse(path?: string, options?: { includeFiles?: boolean; directoryPicker?: boolean }) {
    const q = new URLSearchParams()
    if (path) q.set('path', path)
    if (options?.includeFiles) q.set('includeFiles', 'true')
    if (options?.directoryPicker) q.set('directoryPicker', 'true')
    const qs = q.toString()
    return api.get<BrowseResult>(`/api/filesystem/browse${qs ? `?${qs}` : ''}`)
  },

  search(query: string, cwd?: string) {
    const q = new URLSearchParams({ search: query, maxResults: '200', includeFiles: 'true' })
    if (cwd) q.set('path', cwd)
    return api.get<BrowseResult>(`/api/filesystem/browse?${q}`)
  },

  openDirectoryDialog(initialPath?: string, options?: { timeoutMs?: number }) {
    const q = new URLSearchParams()
    if (initialPath) q.set('initialPath', initialPath)
    if (options?.timeoutMs) q.set('timeoutMs', String(options.timeoutMs))
    const qs = q.toString()
    return api.post<{ path: string | null }>(
      `/api/filesystem/open-directory-dialog${qs ? `?${qs}` : ''}`,
      {},
      { timeout: options?.timeoutMs ? options.timeoutMs + 1000 : 10 * 60 * 1000 },
    )
  },
}
