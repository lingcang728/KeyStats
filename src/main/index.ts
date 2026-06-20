import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog } from 'electron'
import { join, resolve, dirname } from 'path'
import { existsSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import { InputMonitor } from './inputMonitor'
import { StatsManager } from './statsManager'
import { ICON_BASE64 } from './iconData'

// 自动更新逻辑
function setupAutoUpdater(): void {
  // 设置自动下载为 true，这样发现更新会自动下载
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {})

  autoUpdater.on('update-available', (info) => {
    // 可以在这里通知渲染进程有更新可用
    // dialog.showMessageBox({
    //   type: 'info',
    //   title: '发现新版本',
    //   message: `发现新版本 v${info.version}，正在后台下载...`
    // })
  })

  autoUpdater.on('update-not-available', () => {})

  autoUpdater.on('error', () => {})

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
 * 检测是否从项目开发目录的 release/ 下启动（portable exe）
 * 如果是，返回 electron.exe 路径和项目根目录，用于注册自启动
 * 这样 build 后开机自启即为最新版本，无需重新打包
 */
function getDevProjectPaths(): { electronExe: string; projectRoot: string } | null {
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE
  if (!portableExe) return null

  const projectRoot = dirname(dirname(portableExe))
  const electronExe = join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')

  if (existsSync(electronExe)) {
    return { electronExe, projectRoot }
  }
  return null
}

/**
 * 统一解析当前运行形态对应的自启注册参数（消除 get/set/reconcile 三处重复分支）。
 * - dev：未打包，electron.exe + 项目路径
 * - dev-project：portable exe 位于开发目录 release/ 下，注册 electron.exe + 项目根目录（build 后自启即最新版）
 * - production：正式安装版 / 独立 portable，注册 exe 本体
 */
type LoginItemMode = 'dev' | 'dev-project' | 'production'

function resolveLoginItemConfig(): { mode: LoginItemMode; options: Electron.LoginItemSettingsOptions } {
  if (!app.isPackaged) {
    return {
      mode: 'dev',
      options: {
        name: AUTO_LAUNCH_NAME,
        path: process.execPath,
        args: [app.getAppPath()]
      } as Electron.LoginItemSettingsOptions
    }
  }

  const devPaths = getDevProjectPaths()
  if (devPaths) {
    return {
      mode: 'dev-project',
      options: {
        name: AUTO_LAUNCH_NAME,
        path: devPaths.electronExe,
        args: [devPaths.projectRoot]
      } as Electron.LoginItemSettingsOptions
    }
  }

  return {
    mode: 'production',
    options: {
      name: AUTO_LAUNCH_NAME,
      path: getAppExePath()
    } as Electron.LoginItemSettingsOptions
  }
}

/**
 * 获取开机自启状态
 */
function getAutoLaunchEnabled(): boolean {
  try {
    const { mode, options } = resolveLoginItemConfig()
    const settings = app.getLoginItemSettings(options)
    // ⚠️ Windows + Electron 29 下 settings.openAtLogin 回读恒为 false（不可靠，实测验证）。
    // Windows 上 launchItems 才是权威：按“名为 KeyStats 且已启用”的启动项判断；
    // 仅当拿不到 launchItems（其它平台/版本）时，才回退到 executableWillLaunchAtLogin / openAtLogin。
    const launchItems = settings.launchItems
    const byName = Array.isArray(launchItems)
      ? launchItems.some((it) => it.name === AUTO_LAUNCH_NAME && it.enabled)
      : undefined
    const enabled =
      byName ?? (settings.executableWillLaunchAtLogin === true || settings.openAtLogin)
    console.log('[AutoLaunch] Get status:', {
      mode,
      byName,
      exec: settings.executableWillLaunchAtLogin,
      openAtLogin: settings.openAtLogin,
      enabled,
      path: options.path
    })
    return enabled
  } catch (error) {
    console.error('[AutoLaunch] Failed to get status:', error)
    return false
  }
}

/**
 * 清理旧版/开发模式遗留的默认 Electron 自启动项（electron.app.Electron）
 * 早期未传 name 时，Windows Run 中会留下默认名称，升级后可能与新的 KeyStats 项并存。
 * 该问题只出现在以 electron.exe 启动的形态（dev / dev-project）。
 */
function clearLegacyElectronAutoLaunchEntry(): void {
  try {
    const { mode, options } = resolveLoginItemConfig()
    if (mode === 'production') return

    const legacyArgs = { path: options.path as string, args: options.args as string[] }
    if (!app.getLoginItemSettings(legacyArgs).openAtLogin) return

    app.setLoginItemSettings({ openAtLogin: false, ...legacyArgs })
    console.log('[AutoLaunch] Cleared legacy Electron startup entry:', legacyArgs)
  } catch (error) {
    console.error('[AutoLaunch] Failed to clear legacy Electron startup entry:', error)
  }
}

/**
 * 修复升级后残留的旧版开机自启注册
 *
 * 场景：旧版本 exe 已登记为开机启动，新版本可手动启动，但 getLoginItemSettings({ path: 当前 exe })
 * 读不到旧登记，导致 UI 看起来像“未启用”，且开机仍然启动旧版本。
 */
function reconcileAutoLaunchRegistration(): void {
  try {
    clearLegacyElectronAutoLaunchEntry()

    // 没有开启自启就无需处理（openAtLogin 不可靠，统一走 getAutoLaunchEnabled）
    if (!getAutoLaunchEnabled()) return

    const { options } = resolveLoginItemConfig()
    const items = app.getLoginItemSettings(options).launchItems || []
    const pointsToCurrent = items.some(
      (it) => it.name === AUTO_LAUNCH_NAME && it.enabled && it.path === options.path
    )
    if (pointsToCurrent) return

    console.log('[AutoLaunch] Detected stale startup registration, rewriting to current version...')
    setAutoLaunchEnabled(true)
  } catch (error) {
    console.error('[AutoLaunch] Failed to reconcile startup registration:', error)
  }
}

/**
 * 设置开机自启
 */
function setAutoLaunchEnabled(enabled: boolean): boolean {
  try {
    const { mode, options } = resolveLoginItemConfig()
    clearLegacyElectronAutoLaunchEntry()

    app.setLoginItemSettings({ openAtLogin: enabled, ...options } as Electron.Settings)
    console.log('[AutoLaunch] Set to:', { mode, enabled, path: options.path })

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

  refreshTrayMenu()
  tray.on('click', () => showWindow())
}

/**
 * 每次都用最新的自启状态重建托盘菜单，保证复选框与系统真实状态一致。
 * 与渲染进程开关共享单一数据源 getAutoLaunchEnabled()。
 */
function refreshTrayMenu(): void {
  if (!tray) return

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
        applyAutoLaunch(item.checked)
      }
    },
    { type: 'separator' },
    { label: '退出应用', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)
}

/**
 * 设置开机自启的统一入口：写登录项 → 刷新托盘菜单 → 通知渲染进程。
 * 无论从托盘还是面板触发，两侧 UI 都会同步到真实状态。
 */
function applyAutoLaunch(enabled: boolean): boolean {
  setAutoLaunchEnabled(enabled)
  const actual = getAutoLaunchEnabled()
  refreshTrayMenu()
  notifyAutostartChanged(actual)
  return actual
}

/**
 * 把当前自启状态推送给渲染进程（窗口可见时），用于双向同步与显示窗口时的刷新。
 */
function notifyAutostartChanged(enabled: boolean = getAutoLaunchEnabled()): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('autostart-changed', enabled)
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

    // 窗口长期不重建，显示时主动同步一次自启状态，避免面板开关显示陈旧
    notifyAutostartChanged()
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
  // 窗口隐藏时跳过：避免后台无谓的序列化与 IPC 推送
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return
  if (!statsManager) return

  const todayStats = statsManager.getTodayStats()
  const historyData = statsManager.getHistoryData(30)
  const keyStats = statsManager.getKeyStats()
  const totalKeyStats = statsManager.getTotalKeyStats()
  mainWindow.webContents.send('stats-update', {
    todayStats,
    historyData,
    keyStats,
    totalKeyStats
  })
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
    // 退出前把节流中的统计立即落盘
    statsManager?.flush()
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
    return applyAutoLaunch(enabled)
  })
}

// 启动输入监听
function startInputMonitor(): void {
  statsManager = new StatsManager()
  inputMonitor = new InputMonitor()

  // 事件回调只做计数。UI/托盘刷新统一由下方每秒定时器驱动，
  // 避免每次按键都触发全量序列化 + IPC 推送 + 托盘 tooltip 重设。
  inputMonitor.on('keydown', (keycode: number) => statsManager?.recordKeyPress(keycode))
  inputMonitor.on('combo', (comboName: string) => statsManager?.recordKeyPress(comboName))
  inputMonitor.on('mousedown', (button: number) => {
    if (button === 1) {
      statsManager?.recordLeftClick()
    } else if (button === 2) {
      statsManager?.recordRightClick()
    }
  })
  inputMonitor.on('mousemove', (x: number, y: number) => statsManager?.recordMouseMove(x, y))
  inputMonitor.on('wheel', (delta: number) => statsManager?.recordScroll(delta))

  inputMonitor.start()

  // 每秒更新一次托盘图标和渲染进程（窗口可见时）
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
  reconcileAutoLaunchRegistration()
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
  statsManager?.flush()
  if (inputMonitor) {
    inputMonitor.stop()
  }
})
