import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultBaseUrl, setAuthToken, setBaseUrl } from './client'
import { desktopUiPreferencesApi, getProfileAvatarUrl } from './desktopUiPreferences'

const preferences = {
  schemaVersion: 2,
  profile: {
    displayName: 'autoabm',
    subtitle: 'github.com/SocialAI-X/Auto-ABM',
    avatarFile: null,
    avatarUpdatedAt: null,
  },
  sidebar: {
    projectOrder: [],
    pinnedProjects: [],
    hiddenProjects: [],
    projectOrganization: 'recentProject',
    projectSortBy: 'updatedAt',
  },
}

describe('desktopUiPreferencesApi', () => {
  afterEach(() => {
    setAuthToken(null)
    setBaseUrl(getDefaultBaseUrl())
    vi.restoreAllMocks()
  })

  it('wraps preference reads and profile updates with the configured API base URL', async () => {
    setBaseUrl('http://127.0.0.1:49237')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ exists: true, preferences }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, preferences }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, preferences }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    await expect(desktopUiPreferencesApi.getPreferences()).resolves.toEqual({ exists: true, preferences })
    await expect(desktopUiPreferencesApi.updateProfilePreferences({
      displayName: 'Local Captain',
      subtitle: 'local.example',
    })).resolves.toEqual({
      ok: true,
      preferences,
    })
    await expect(desktopUiPreferencesApi.deleteProfileAvatar()).resolves.toEqual({ ok: true, preferences })

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:49237/api/desktop-ui/preferences', expect.objectContaining({
      method: 'GET',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:49237/api/desktop-ui/preferences/profile', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ displayName: 'Local Captain', subtitle: 'local.example' }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:49237/api/desktop-ui/preferences/profile/avatar', expect.objectContaining({
      method: 'DELETE',
    }))
  })

  it('uploads profile avatars with the file content type and auth token', async () => {
    setBaseUrl('http://127.0.0.1:49237')
    setAuthToken('h5_avatar_token')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, preferences }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'avatar.png', { type: 'image/png' })
    await expect(desktopUiPreferencesApi.uploadProfileAvatar(file)).resolves.toEqual({ ok: true, preferences })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:49237/api/desktop-ui/preferences/profile/avatar')
    expect(init).toMatchObject({
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        Authorization: 'Bearer h5_avatar_token',
      },
      body: file,
    })
  })

  it('surfaces avatar upload API errors and builds cache-busted avatar URLs', async () => {
    setBaseUrl('http://127.0.0.1:49237')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    }))

    const file = new File(['bad'], 'avatar.bin', { type: '' })
    await expect(desktopUiPreferencesApi.uploadProfileAvatar(file)).rejects.toThrow('Too large')

    const [, init] = fetchMock.mock.calls[0]!
    expect(init).toMatchObject({
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: file,
    })
    expect(getProfileAvatarUrl('2026-05-30T15:37:51.649Z')).toBe(
      'http://127.0.0.1:49237/api/desktop-ui/preferences/profile/avatar?v=2026-05-30T15%3A37%3A51.649Z',
    )
    expect(getProfileAvatarUrl(null)).toBe('http://127.0.0.1:49237/api/desktop-ui/preferences/profile/avatar')
  })
})
