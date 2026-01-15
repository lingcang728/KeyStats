import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } from 'electron'
import { join, resolve } from 'path'
import { InputMonitor } from './inputMonitor'
import { StatsManager } from './statsManager'
import { ICON_BASE64 } from './iconData'

// 防止应用多开
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let inputMonitor: InputMonitor | null = null
let statsManager: StatsManager | null = null

// Windows 亚克力效果配置
const WINDOW_CONFIG = {
  width: 420,
  height: 800,
  frame: false,
  transparent: true,
  resizable: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  show: false,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow(WINDOW_CONFIG)

  // 设置窗口背景为透明以支持毛玻璃效果
  mainWindow.setBackgroundColor('#00000000')

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 不再自动隐藏，允许用户自由移动窗口

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  // 创建托盘图标 - 使用内嵌的 Base64 图标，确保在任何环境下都能显示
  let icon = nativeImage.createFromDataURL(ICON_BASE64)

  // 调整托盘图标大小为 16x16（Windows 托盘标准尺寸）
  icon = icon.resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray.setToolTip('KeyStats - 键鼠统计')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示面板', click: () => showWindow() },
    { type: 'separator' },
    { label: '重置统计', click: () => resetStats() },
    { type: 'separator' },
    {
      label: '开机启动', type: 'checkbox', checked: (() => {
        if (!app.isPackaged) {
          return app.getLoginItemSettings({
            path: process.execPath,
            args: [`"${app.getAppPath()}"`]
          }).openAtLogin
        }
        return app.getLoginItemSettings().openAtLogin
      })(), click: (item) => {
        if (!app.isPackaged) {
          app.setLoginItemSettings({
            openAtLogin: item.checked,
            path: process.execPath,
            args: [`"${app.getAppPath()}"`]
          })
        } else {
          app.setLoginItemSettings({ openAtLogin: item.checked })
        }
      }
    },
    { type: 'separator' },
    { label: '退出应用', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => showWindow())
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
  }

  if (mainWindow) {
    // 获取托盘图标位置，将窗口显示在托盘附近
    const trayBounds = tray?.getBounds()
    const windowBounds = mainWindow.getBounds()
    const display = screen.getPrimaryDisplay()
    const workArea = display.workArea

    let x: number, y: number

    if (trayBounds) {
      // 计算窗口位置（在托盘图标上方或下方）
      x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2)

      // 如果托盘在底部，窗口显示在上方
      if (trayBounds.y > workArea.height / 2) {
        y = Math.round(trayBounds.y - windowBounds.height - 10)
      } else {
        y = Math.round(trayBounds.y + trayBounds.height + 10)
      }
    } else {
      // 默认显示在右下角
      x = workArea.x + workArea.width - windowBounds.width - 20
      y = workArea.y + workArea.height - windowBounds.height - 60
    }

    // 确保窗口在屏幕范围内
    x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - windowBounds.width))
    y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - windowBounds.height))

    mainWindow.setPosition(x, y)
    mainWindow.show()
    mainWindow.focus()
  }
}

function resetStats(): void {
  if (statsManager) {
    statsManager.resetToday()
    updateTrayIcon()
    sendStatsToRenderer()
  }
}

function updateTrayIcon(): void {
  if (!tray || !statsManager) return

  const stats = statsManager.getTodayStats()

  // 使用原始笑脸图标，不动态更改图标
  // 只更新 tooltip 显示统计信息
  tray.setToolTip(`KeyStats\n键盘: ${stats.keyStrokes.toLocaleString()}\n点击: ${(stats.leftClicks + stats.rightClicks).toLocaleString()}`)
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

function sendStatsToRenderer(): void {
  if (mainWindow && statsManager) {
    const todayStats = statsManager.getTodayStats()
    const historyData = statsManager.getHistoryData(30)
    const keyStats = statsManager.getKeyStats()
    const totalKeyStats = statsManager.getTotalKeyStats()
    mainWindow.webContents.send('stats-update', { todayStats, historyData, keyStats, totalKeyStats })
  }
}

// IPC 通信
function setupIPC(): void {
  ipcMain.handle('get-stats', () => {
    if (!statsManager) return null
    return {
      todayStats: statsManager.getTodayStats(),
      historyData: statsManager.getHistoryData(30),
      keyStats: statsManager.getKeyStats(),
      totalKeyStats: statsManager.getTotalKeyStats()
    }
  })

  ipcMain.handle('reset-stats', () => {
    resetStats()
    return true
  })

  ipcMain.handle('hide-window', () => {
    if (mainWindow) {
      mainWindow.hide()
    }
    return true
  })

  ipcMain.handle('get-autostart', () => {
    if (!app.isPackaged) {
      return app.getLoginItemSettings({
        path: process.execPath,
        args: [`"${app.getAppPath()}"`]
      }).openAtLogin
    }
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('set-autostart', (_, enabled: boolean) => {
    if (!app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: [`"${app.getAppPath()}"`]
      })
    } else {
      app.setLoginItemSettings({ openAtLogin: enabled })
    }
    return enabled
  })
}

// 启动输入监听
function startInputMonitor(): void {
  statsManager = new StatsManager()
  inputMonitor = new InputMonitor()

  inputMonitor.on('keydown', (keycode: number) => {
    statsManager?.recordKeyPress(keycode)
    updateTrayIcon()
    sendStatsToRenderer()
  })

  inputMonitor.on('combo', (comboName: string) => {
    statsManager?.recordKeyPress(comboName)
    updateTrayIcon()
    sendStatsToRenderer()
  })

  inputMonitor.on('mousedown', (button: number) => {
    if (button === 1) {
      statsManager?.recordLeftClick()
    } else if (button === 2) {
      statsManager?.recordRightClick()
    }
    updateTrayIcon()
    sendStatsToRenderer()
  })

  inputMonitor.on('mousemove', (x: number, y: number) => {
    statsManager?.recordMouseMove(x, y)
    // 鼠标移动更新频率降低
  })

  inputMonitor.on('wheel', (delta: number) => {
    statsManager?.recordScroll(delta)
    sendStatsToRenderer()
  })

  inputMonitor.start()

  // 每秒更新一次托盘图标和渲染进程
  setInterval(() => {
    updateTrayIcon()
    sendStatsToRenderer()
  }, 1000)

  // 检查日期变化，自动重置
  setInterval(() => {
    statsManager?.checkDayChange()
  }, 60000)
}

app.whenReady().then(() => {
  setupIPC()
  createWindow()
  createTray()
  startInputMonitor()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Windows 上不退出，保持托盘运行
})

app.on('before-quit', () => {
  if (inputMonitor) {
    inputMonitor.stop()
  }
})
