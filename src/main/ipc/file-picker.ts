import { ipcMain, dialog } from 'electron'
import { basename } from 'path'

export function registerFilePickerIPC(): void {
  ipcMain.handle('file-picker:selectFile', async (_event, options: { filters?: { name: string; extensions: string[] }[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: null }
    }

    return {
      canceled: false,
      filePath: result.filePaths[0],
      fileName: basename(result.filePaths[0])
    }
  })

  ipcMain.handle('file-picker:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, dirPath: null }
    }

    return {
      canceled: false,
      dirPath: result.filePaths[0],
      dirName: basename(result.filePaths[0])
    }
  })
}