// 全局类型声明
import type { API } from '../../preload/index'

declare global {
  interface Window {
    api: API
  }
}

export {}
