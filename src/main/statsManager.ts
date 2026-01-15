import Store from 'electron-store'
import { getKeyName } from './inputMonitor'

// 今日统计数据结构
interface TodayStats {
  keyStrokes: number
  leftClicks: number
  rightClicks: number
  mouseDistance: number
  scrollDistance: number
  date: string
}

// 单日历史数据
interface DayStats {
  date: string
  keyStrokes: number
  clicks: number
  mouseDistance: number
  scrollDistance: number
}

// 按键统计
interface KeyStats {
  [key: string]: number
}

// 存储结构
interface StoreSchema {
  today: TodayStats
  history: DayStats[]
  keyStats: KeyStats
  totalKeyStats: KeyStats // 新增：总计按键统计
}

const DEFAULT_TODAY: TodayStats = {
  keyStrokes: 0,
  leftClicks: 0,
  rightClicks: 0,
  mouseDistance: 0,
  scrollDistance: 0,
  date: new Date().toISOString().split('T')[0]
}

export class StatsManager {
  private store: Store<StoreSchema>
  private today: TodayStats
  private history: DayStats[]
  private keyStats: KeyStats // 今日按键统计
  private totalKeyStats: KeyStats // 总计按键统计
  private lastMouseX: number = 0
  private lastMouseY: number = 0
  private hasLastMouse: boolean = false

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'keystats-data',
      defaults: {
        today: { ...DEFAULT_TODAY },
        history: [],
        keyStats: {},
        totalKeyStats: {}
      }
    })

    // 加载数据
    this.today = this.store.get('today', { ...DEFAULT_TODAY })
    this.history = this.store.get('history', [])
    this.keyStats = this.store.get('keyStats', {})

    // 加载或初始化总计数据
    // 如果是旧版本升级上来，totalKeyStats 为空，可以用当前 keyStats 初始化（虽然不完全准确，但比从零开始好）
    this.totalKeyStats = this.store.get('totalKeyStats', {})
    if (Object.keys(this.totalKeyStats).length === 0 && Object.keys(this.keyStats).length > 0) {
      this.totalKeyStats = { ...this.keyStats }
      this.store.set('totalKeyStats', this.totalKeyStats)
    }

    // 检查日期变化
    this.checkDayChange()
  }

  // 检查日期是否变化，如果是新的一天则重置
  checkDayChange(): void {
    const currentDate = new Date().toISOString().split('T')[0]

    if (this.today.date !== currentDate) {
      // 保存昨天的数据到历史
      if (this.today.date && (this.today.keyStrokes > 0 || this.today.leftClicks > 0)) {
        this.history.push({
          date: this.today.date,
          keyStrokes: this.today.keyStrokes,
          clicks: this.today.leftClicks + this.today.rightClicks,
          mouseDistance: this.today.mouseDistance,
          scrollDistance: this.today.scrollDistance
        })

        // 只保留最近30天的历史
        if (this.history.length > 30) {
          this.history = this.history.slice(-30)
        }

        this.store.set('history', this.history)
      }

      // 重置今天的数据
      this.today = {
        ...DEFAULT_TODAY,
        date: currentDate
      }
      this.keyStats = {} // 重置今日按键统计
      this.save()
    }
  }

  // 记录按键
  recordKeyPress(key: number | string): void {
    this.today.keyStrokes++

    // 记录具体按键统计
    const keyName = typeof key === 'number' ? getKeyName(key) : key

    // 更新今日统计
    this.keyStats[keyName] = (this.keyStats[keyName] || 0) + 1

    // 更新总计统计
    this.totalKeyStats[keyName] = (this.totalKeyStats[keyName] || 0) + 1

    this.saveDebounced()
  }

  // 记录左键点击
  recordLeftClick(): void {
    this.today.leftClicks++
    this.saveDebounced()
  }

  // 记录右键点击
  recordRightClick(): void {
    this.today.rightClicks++
    this.saveDebounced()
  }

  // 记录鼠标移动
  recordMouseMove(x: number, y: number): void {
    if (this.hasLastMouse) {
      const dx = x - this.lastMouseX
      const dy = y - this.lastMouseY
      const distance = Math.sqrt(dx * dx + dy * dy)

      // 只累计有意义的移动（避免抖动）
      if (distance > 1) {
        this.today.mouseDistance += distance
      }
    }

    this.lastMouseX = x
    this.lastMouseY = y
    this.hasLastMouse = true

    // 鼠标移动保存频率更低
    this.saveDebounced()
  }

  // 记录滚动
  recordScroll(delta: number): void {
    this.today.scrollDistance += Math.abs(delta)
    this.saveDebounced()
  }

  // 获取今日统计
  getTodayStats(): TodayStats {
    return { ...this.today }
  }

  // 获取历史数据
  getHistoryData(days: number = 7): DayStats[] {
    const currentDate = new Date().toISOString().split('T')[0]

    // 合并历史数据和今天的数据
    const allData = [
      ...this.history,
      {
        date: currentDate,
        keyStrokes: this.today.keyStrokes,
        clicks: this.today.leftClicks + this.today.rightClicks,
        mouseDistance: this.today.mouseDistance,
        scrollDistance: this.today.scrollDistance
      }
    ]

    return allData.slice(-days)
  }

  // 获取按键统计（返回前15个最常用的键）
  getKeyStats(): { key: string; count: number }[] {
    return Object.entries(this.keyStats)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }

  // 获取总计按键统计（返回前15个最常用的键）
  getTotalKeyStats(): { key: string; count: number }[] {
    return Object.entries(this.totalKeyStats)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }

  // 重置今日数据
  resetToday(): void {
    this.today = {
      ...DEFAULT_TODAY,
      date: new Date().toISOString().split('T')[0]
    }
    this.keyStats = {}
    // 注意：不重置 totalKeyStats
    this.save()
  }

  // 防抖保存
  private saveTimer: NodeJS.Timeout | null = null

  private saveDebounced(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }
    this.saveTimer = setTimeout(() => {
      this.save()
    }, 1000)
  }

  // 保存数据
  private save(): void {
    this.store.set('today', this.today)
    this.store.set('keyStats', this.keyStats)
    this.store.set('totalKeyStats', this.totalKeyStats)
  }
}
