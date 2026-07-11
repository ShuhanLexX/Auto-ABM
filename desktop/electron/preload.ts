import { contextBridge, ipcRenderer } from 'electron'
import { createElectronHost } from '../src/lib/desktopHost/electronHost'
import type { DesktopHostUnlisten } from '../src/lib/desktopHost/types'
import type { ElectronEventChannel, ElectronIpcChannel } from './ipc/channels'

const electronHost = createElectronHost({
  invoke<T>(channel: ElectronIpcChannel, payload?: unknown): Promise<T> {
    return ipcRenderer.invoke(channel, payload) as Promise<T>
  },
  subscribe<T>(
    channel: ElectronEventChannel,
    handler: (payload: T) => void,
  ): Promise<DesktopHostUnlisten> {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => handler(payload)
    ipcRenderer.on(channel, listener)
    return Promise.resolve(() => {
      ipcRenderer.removeListener(channel, listener)
    })
  },
})

contextBridge.exposeInMainWorld('desktopHost', electronHost)
