import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API
const api = {
  // 获取统计数据
  getStats: () => ipcRenderer.invoke('get-stats'),
  
  // 重置统计
  resetStats: () => ipcRenderer.invoke('reset-stats'),
  
  // 隐藏窗口
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  
  // 退出应用
  quitApp: () => {
    console.log('[Preload] quitApp called')
    return ipcRenderer.invoke('quit-app')
  },
  
  // 获取开机启动状态
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  
  // 设置开机启动
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('set-autostart', enabled),
  
  // 监听统计更新
  onStatsUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('stats-update', (_, data) => callback(data))
  },
  
  // 移除监听
  removeStatsListener: () => {
    ipcRenderer.removeAllListeners('stats-update')
  }
}

// 暴露 API 到 window.api
contextBridge.exposeInMainWorld('api', api)

// 类型声明
export type API = typeof api
