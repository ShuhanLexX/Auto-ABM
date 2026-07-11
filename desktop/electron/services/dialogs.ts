import type { BrowserWindow, OpenDialogOptions, SaveDialogOptions } from 'electron'
import type { DialogOpenOptions, DialogSaveOptions } from '../../src/lib/desktopHost/types'

export function toElectronOpenDialogOptions(options: DialogOpenOptions = {}): OpenDialogOptions {
  return {
    properties: [
      options.directory ? 'openDirectory' : 'openFile',
      options.multiple ? 'multiSelections' : undefined,
    ].filter(Boolean) as OpenDialogOptions['properties'],
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
  }
}

export function toElectronSaveDialogOptions(options: DialogSaveOptions = {}): SaveDialogOptions {
  return {
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
  }
}

export async function openDialog(parentWindow: BrowserWindow | null, options?: DialogOpenOptions): Promise<string | string[] | null> {
  const { dialog } = await import('electron')
  const dialogOptions = toElectronOpenDialogOptions(options)
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled) return null
  return options?.multiple ? result.filePaths : result.filePaths[0] ?? null
}

export async function saveDialog(parentWindow: BrowserWindow | null, options?: DialogSaveOptions): Promise<string | null> {
  const { dialog } = await import('electron')
  const dialogOptions = toElectronSaveDialogOptions(options)
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)
  return result.canceled ? null : result.filePath ?? null
}
