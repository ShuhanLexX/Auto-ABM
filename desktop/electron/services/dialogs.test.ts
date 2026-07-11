import { describe, expect, it } from 'vitest'
import { toElectronOpenDialogOptions, toElectronSaveDialogOptions } from './dialogs'

describe('Electron dialog service', () => {
  it('maps host open options to Electron file selection options', () => {
    expect(toElectronOpenDialogOptions({
      directory: true,
      multiple: true,
      title: 'Choose folder',
      defaultPath: '/tmp',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })).toEqual({
      properties: ['openDirectory', 'multiSelections'],
      title: 'Choose folder',
      defaultPath: '/tmp',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
  })

  it('defaults open dialogs to single-file selection', () => {
    expect(toElectronOpenDialogOptions()).toEqual({
      properties: ['openFile'],
      title: undefined,
      defaultPath: undefined,
      filters: undefined,
    })
  })

  it('maps host save options to Electron save options', () => {
    expect(toElectronSaveDialogOptions({
      title: 'Save transcript',
      defaultPath: '/tmp/session.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })).toEqual({
      title: 'Save transcript',
      defaultPath: '/tmp/session.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
  })

})
