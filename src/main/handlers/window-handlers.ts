import { IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

// グローバルなタスク履歴ウィンドウの参照
let taskHistoryWindow: BrowserWindow | null = null

/**
 * タスク履歴ウィンドウを強制終了する
 * アプリケーション終了時に呼び出される
 */
export const forceCloseTaskHistoryWindow = (): void => {
  if (taskHistoryWindow && !taskHistoryWindow.isDestroyed()) {
    try {
      taskHistoryWindow.destroy()
      console.log('Task history window destroyed')
    } catch (error) {
      console.error('Failed to destroy task history window:', error)
    }

    taskHistoryWindow = null
  }
}

export const windowHandlers = {
  'window:isFocused': async (event: IpcMainInvokeEvent) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window?.isFocused() ?? false
  },

  /**
   * タスク履歴ウィンドウを開く。
   * ウィンドウは要求されたときにだけ作られ、閉じられたら破棄される。
   * （常駐させると使わないユーザーでもレンダラープロセスが1つ増え、
   * ノートPCのバッテリーを消費し続けるため）
   */
  'window:openTaskHistory': async (_event: IpcMainInvokeEvent, taskId: string) => {
    console.log('Opening task history window for taskId:', taskId)

    // Build URL for the task history page
    const taskHistoryUrl =
      is.dev && process.env['ELECTRON_RENDERER_URL']
        ? `${process.env['ELECTRON_RENDERER_URL']}#/background-agent/task-history/${taskId}`
        : `file://${join(__dirname, '../renderer/index.html')}#/background-agent/task-history/${taskId}`

    // 開いているウィンドウがあれば、そこに別のタスクを読み込んで使い回す
    if (taskHistoryWindow && !taskHistoryWindow.isDestroyed()) {
      try {
        await taskHistoryWindow.loadURL(taskHistoryUrl)
        taskHistoryWindow.show()
        taskHistoryWindow.focus()

        return { success: true, windowId: taskHistoryWindow.id, reused: true }
      } catch (error) {
        console.error('Failed to reuse task history window:', error)
        taskHistoryWindow.destroy()
        taskHistoryWindow = null
      }
    }

    taskHistoryWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 600,
      parent: undefined,
      modal: false,
      show: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      autoHideMenuBar: true,
      title: 'Task Execution History',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        devTools: true
      }
    })

    try {
      await taskHistoryWindow.loadURL(taskHistoryUrl)
    } catch (error) {
      console.error('Failed to load task history URL:', error)
      taskHistoryWindow.destroy()
      taskHistoryWindow = null
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }

    // Open DevTools in development mode for debugging
    if (is.dev) {
      taskHistoryWindow.webContents.openDevTools({ mode: 'right' })
    }

    taskHistoryWindow.show()

    // 閉じられたウィンドウは破棄する（隠して常駐させない）
    taskHistoryWindow.on('closed', () => {
      taskHistoryWindow = null
    })

    return { success: true, windowId: taskHistoryWindow.id, reused: false }
  }
} as const
