import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog } from 'electron'
import { join, resolve } from 'path'
import { autoUpdater } from 'electron-updater'
import { InputMonitor } from './inputMonitor'
import { StatsManager } from './statsManager'
import { ICON_BASE64 } from './iconData'

// 自动更新逻辑
function setupAutoUpdater(): void {
  // 设置自动下载为 true，这样发现更新会自动下载
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    // console.log('Checking for update...')
  })

  autoUpdater.on('update-available', (info) => {
    // 可以在这里通知渲染进程有更新可用
    // dialog.showMessageBox({
    //   type: 'info',
    //   title: '发现新版本',
    //   message: `发现新版本 v${info.version}，正在后台下载...`
    // })
  })

  autoUpdater.on('update-not-available', (info) => {
    // console.log('Update not available.')
  })

  autoUpdater.on('error', (err) => {
    // dialog.showErrorBox('更新错误', err.message)
  })

  autoUpdater.on('update-downloaded', (info) => {
    // 下载完成后，询问用户是否重启更新
    dialog.showMessageBox({
      type: 'info',
      title: '更新准备就绪',
      message: `新版本 v${info.version} 已下载完成，将在退出应用后自动安装。`,
      buttons: ['立即重启更新', '稍后'],
      defaultId: 0
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })
}


// 防止应用多开
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// ============================================
// 开机自启管理 (兼容 Windows 10/11)
// ============================================
const AUTO_LAUNCH_NAME = 'KeyStats'

/**
 * 获取应用可执行文件路径
 * 处理便携版和安装版的不同情况
 */
function getAppExePath(): string {
  // 便携版: PORTABLE_EXECUTABLE_FILE 环境变量指向实际的 exe
  // 安装版: 直接使用 process.execPath
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
}

/**
 * 获取开机自启状态
 */
function getAutoLaunchEnabled(): boolean {
  try {
    const exePath = getAppExePath()
    
    if (!app.isPackaged) {
      // 开发模式
      const settings = app.getLoginItemSettings({
        path: process.execPath,
        args: [app.getAppPath()]
      })
      console.log('[AutoLaunch] Dev mode, status:', settings.openAtLogin)
      return settings.openAtLogin
    }
    
    // 生产模式 - 需要使用相同的 name 参数才能正确读取状态
    const options: Record<string, unknown> = {
      path: exePath,
      name: AUTO_LAUNCH_NAME
    }
    const settings = app.getLoginItemSettings(options as Electron.LoginItemSettingsOptions)
    
    console.log('[AutoLaunch] Get status:', {
      openAtLogin: settings.openAtLogin,
      path: exePath,
      name: AUTO_LAUNCH_NAME,
      executableWillLaunchAtLogin: settings.executableWillLaunchAtLogin
    })
    
    return settings.openAtLogin
  } catch (error) {
    console.error('[AutoLaunch] Failed to get status:', error)
    return false
  }
}

/**
 * 设置开机自启
 */
function setAutoLaunchEnabled(enabled: boolean): boolean {
  try {
    const exePath = getAppExePath()
    
    if (!app.isPackaged) {
      // 开发模式
      app.setLoginItemSettings({
        openAtLogin: enabled,
        path: process.execPath,
        args: [app.getAppPath()]
      })
      console.log('[AutoLaunch] Dev mode, set to:', enabled)
      return enabled
    }
    
    // 生产模式 - 完整配置确保 Win10/11 兼容
    // 使用类型断言绕过 TypeScript 限制，因为 Electron 运行时支持 name 参数
    const settings: Record<string, unknown> = {
      openAtLogin: enabled,
      // name 参数对 Windows 注册表项名称很重要，确保 Win10 兼容
      name: AUTO_LAUNCH_NAME,
      // path 必须是完整路径
      path: exePath
    }
    
    app.setLoginItemSettings(settings as Electron.Settings)
    
    console.log('[AutoLaunch] Set to:', {
      enabled,
      path: exePath,
      name: AUTO_LAUNCH_NAME
    })
    
    // 验证设置是否成功
    const verify = getAutoLaunchEnabled()
    if (verify !== enabled) {
      console.warn('[AutoLaunch] Verification failed! Expected:', enabled, 'Got:', verify)
    }
    
    return enabled
  } catch (error) {
    console.error('[AutoLaunch] Failed to set:', error)
    return false
  }
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
      label: '开机启动',
      type: 'checkbox',
      checked: getAutoLaunchEnabled(),
      click: (item) => {
        setAutoLaunchEnabled(item.checked)
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

  ipcMain.handle('quit-app', () => {
    console.log('[Main] quit-app received, stopping monitor and quitting...')
    // 先停止输入监听器，否则 uiohook 会阻止进程退出
    if (inputMonitor) {
      inputMonitor.stop()
    }
    // 销毁托盘
    if (tray) {
      tray.destroy()
    }
    // 退出应用
    app.quit()
  })

  ipcMain.handle('get-autostart', () => {
    return getAutoLaunchEnabled()
  })

  ipcMain.handle('set-autostart', (_, enabled: boolean) => {
    return setAutoLaunchEnabled(enabled)
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
  setupAutoUpdater()

  // 生产环境下检查更新
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify()

    // 每 4 小时检查一次更新
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify()
    }, 4 * 60 * 60 * 1000)
  }

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
