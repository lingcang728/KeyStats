<template>
  <div class="app">
    
    <!-- Header -->
    <header class="header">
      <h1 class="app-title">KeyStats</h1>
      <button class="close-btn" @click="hideWindow" title="隐藏窗口">
        <span class="close-icon">✕</span>
      </button>
    </header>

    <!-- Main Stats Section -->
    <section class="stats-section">
      <!-- Keyboard -->
      <div class="stat-row single">
        <div class="stat-block">
          <div class="stat-left">
            <span class="stat-icon-wrapper blue-bg">
              <span class="stat-icon">⌨️</span>
            </span>
            <span class="stat-label">键盘敲击</span>
          </div>
          <span class="stat-value">{{ formatNumber(stats.keyStrokes) }}</span>
        </div>
      </div>

      <!-- Mouse Clicks - Side by Side -->
      <div class="stat-row dual">
        <div class="stat-cell">
          <div class="stat-top">
            <span class="stat-icon-wrapper blue-bg">
              <span class="stat-icon">🖱️</span>
            </span>
            <span class="stat-value-small">{{ formatNumber(stats.leftClicks) }}</span>
          </div>
          <span class="stat-label-small">左键点击</span>
        </div>
        <div class="stat-cell">
          <div class="stat-top">
            <span class="stat-icon-wrapper purple-bg">
              <span class="stat-icon">🖱️</span>
            </span>
            <span class="stat-value-small">{{ formatNumber(stats.rightClicks) }}</span>
          </div>
          <span class="stat-label-small">右键点击</span>
        </div>
      </div>

      <!-- Mouse Distance - Side by Side -->
      <div class="stat-row dual">
        <div class="stat-cell">
          <div class="stat-top">
            <span class="stat-icon-wrapper green-bg">
              <span class="stat-icon">↔️</span>
            </span>
            <span class="stat-value-small">{{ formatDistance(stats.mouseDistance) }}</span>
          </div>
          <span class="stat-label-small">鼠标移动</span>
        </div>
        <div class="stat-cell">
          <div class="stat-top">
            <span class="stat-icon-wrapper cyan-bg">
              <span class="stat-icon">↕️</span>
            </span>
            <span class="stat-value-small">{{ formatScroll(stats.scrollDistance) }}</span>
          </div>
          <span class="stat-label-small">滚动距离</span>
        </div>
      </div>
    </section>

    <!-- Top Keys Section -->
    <TopKeys :todayKeys="todayTopKeys" :totalKeys="totalTopKeys" />

    <!-- Keyboard Heatmap Section -->
    <KeyboardHeatmap :todayMap="todayKeyMap" :totalMap="totalKeyMap" />

    <!-- History Chart Section -->
    <HistoryChart :data="history" />

    <!-- Footer -->
    <footer class="footer">
      <label class="autostart-toggle">
        <input
          type="checkbox"
          v-model="autostart"
          @change="toggleAutostart"
        />
        <div class="switch"></div>
        <span class="toggle-label">开机启动</span>
      </label>
      
      <div class="footer-buttons">
        <button class="btn btn-outline" @click="confirmReset">
          重置
        </button>
        <button class="btn btn-secondary" @click="quitApp">
          退出
        </button>
      </div>
    </footer>

    <!-- Reset Confirm Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showResetModal" class="modal-overlay" @click.self="showResetModal = false">
          <div class="modal">
            <div class="modal-icon">⚠️</div>
            <h3 class="modal-title">重置统计数据？</h3>
            <p class="modal-text">此操作将清除今日所有数据，且无法撤销。</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click="showResetModal = false">取消</button>
              <button class="btn btn-danger" @click="resetStats">确认重置</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import HistoryChart from './components/HistoryChart.vue'
import TopKeys from './components/TopKeys.vue'
import KeyboardHeatmap from './components/KeyboardHeatmap.vue'

interface TodayStats {
  keyStrokes: number
  leftClicks: number
  rightClicks: number
  mouseDistance: number
  scrollDistance: number
}

interface DayStats {
  date: string
  keyStrokes: number
  clicks: number
  mouseDistance: number
  scrollDistance: number
}

interface KeyStat {
  key: string
  count: number
}

const stats = reactive<TodayStats>({
  keyStrokes: 0,
  leftClicks: 0,
  rightClicks: 0,
  mouseDistance: 0,
  scrollDistance: 0
})

const history = ref<DayStats[]>([])
const todayTopKeys = ref<KeyStat[]>([])
const totalTopKeys = ref<KeyStat[]>([])
const todayKeyMap = ref<Record<string, number>>({})
const totalKeyMap = ref<Record<string, number>>({})
const autostart = ref(false)
const showResetModal = ref(false)

const formatNumber = (val: number): string => {
  return val.toLocaleString('en-US')
}

const formatDistance = (pixels: number): string => {
  const meters = pixels / 3779.527559
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${meters.toFixed(1)} m`
}

const formatScroll = (val: number): string => {
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}m`
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`
  return val.toLocaleString('en-US')
}

// [DEV] Static Mock Data for Preview (Stable across re-renders)
// const today = new Date();
// const mockHistoryData = Array.from({ length: 7 }, (_, i) => {
//   const d = new Date(today);
//   d.setDate(today.getDate() + i + 1); // Future dates
//   return {
//     date: d.toISOString().split('T')[0],
//     keyStrokes: Math.floor(Math.random() * 5000) + 1000,
//     clicks: Math.floor(Math.random() * 2000) + 500,
//     mouseDistance: Math.floor(Math.random() * 100000) + 20000,
//     scrollDistance: Math.floor(Math.random() * 50000) + 5000
//   };
// });

const loadStats = async () => {
  try {
    const data = await window.api.getStats()
    if (!data) return
    
    if (data.todayStats) {
      stats.keyStrokes = data.todayStats.keyStrokes
      stats.leftClicks = data.todayStats.leftClicks
      stats.rightClicks = data.todayStats.rightClicks
      stats.mouseDistance = data.todayStats.mouseDistance
      stats.scrollDistance = data.todayStats.scrollDistance
    }
    
    if (data.historyData) {
      // ----------------------------------------------------------------
      // [DEV] Merge real history with static mock future data
      // ----------------------------------------------------------------
      // history.value = [...data.historyData, ...mockHistoryData];
      // ----------------------------------------------------------------
      // [END DEV]
      history.value = data.historyData // Original code
    }
    
    if (data.keyStats) {
      todayTopKeys.value = data.keyStats.slice(0, 15)
    }

    if (data.totalKeyStats) {
      totalTopKeys.value = data.totalKeyStats.slice(0, 15)
    }

    if (data.keyStatsMap) {
      todayKeyMap.value = data.keyStatsMap
    }

    if (data.totalKeyStatsMap) {
      totalKeyMap.value = data.totalKeyStatsMap
    }
  } catch (err) {
    console.error('Failed to load stats:', err)
  }
}

const loadAutostart = async () => {
  try {
    autostart.value = await window.api.getAutostart()
  } catch (err) {
    console.error('Failed to get autostart:', err)
  }
}

const toggleAutostart = async () => {
  try {
    await window.api.setAutostart(autostart.value)
  } catch (err) {
    console.error('Failed to set autostart:', err)
  }
}

const hideWindow = () => {
  window.api.hideWindow()
}

const quitApp = () => {
  console.log('[Renderer] quitApp called')
  window.api.quitApp()
}

const confirmReset = () => {
  showResetModal.value = true
}

const resetStats = async () => {
  try {
    await window.api.resetStats()
    showResetModal.value = false
    await loadStats()
  } catch (err) {
    console.error('Failed to reset stats:', err)
  }
}

const handleStatsUpdate = (data: any) => {
  if (data.todayStats) {
    stats.keyStrokes = data.todayStats.keyStrokes
    stats.leftClicks = data.todayStats.leftClicks
    stats.rightClicks = data.todayStats.rightClicks
    stats.mouseDistance = data.todayStats.mouseDistance
    stats.scrollDistance = data.todayStats.scrollDistance
  }
  
  if (data.historyData) {
    // ----------------------------------------------------------------
    // [DEV] Apply Mock Data on Live Updates too
    // ----------------------------------------------------------------
    // history.value = [...data.historyData, ...mockHistoryData];
    // ----------------------------------------------------------------
    history.value = data.historyData // Original code
  }
  
  if (data.keyStats) {
    todayTopKeys.value = data.keyStats.slice(0, 15)
  }

  if (data.totalKeyStats) {
    totalTopKeys.value = data.totalKeyStats.slice(0, 15)
  }

  if (data.keyStatsMap) {
    todayKeyMap.value = data.keyStatsMap
  }

  if (data.totalKeyStatsMap) {
    totalKeyMap.value = data.totalKeyStatsMap
  }
}

onMounted(() => {
  loadStats()
  loadAutostart()
  window.api.onStatsUpdate(handleStatsUpdate)
})

onUnmounted(() => {
  window.api.removeStatsListener()
})
</script>

<style lang="scss" scoped>
@use './styles/variables' as *;

.app {
  position: relative;
  width: 100%;
  height: 100%; /* 填满窗口 */
  max-width: none; /* 移除 max-width 限制，由窗口控制尺寸 */
  max-height: none;
  padding: $spacing-lg;
  
  // 全局 Glassmorphism
  @include glass-effect;
  border-radius: $border-radius-xl;
  overflow: hidden; /* 确保背景不溢出圆角 */
  
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  overflow-y: auto;
  overflow-x: hidden;
}

// ========================================
// Header
// ========================================
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: $spacing-xs;
  -webkit-app-region: drag;
}

.app-title {
  font-size: $font-size-xl;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: $text-primary;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  color: $text-secondary;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all $transition-fast;
  -webkit-app-region: no-drag;
  backdrop-filter: blur(10px);
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: $text-primary;
  }
}

.close-icon {
  font-size: 12px;
  font-weight: bold;
}

// ========================================
// Stats Section
// ========================================
.stats-section {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.stat-row {
  &.single {
    width: 100%;
  }
  
  &.dual {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $spacing-md;
  }
}

// iOS Control Center 风格模块
.stat-block {
  @include card-glass;
  @include hover-lift;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: default;
}

.stat-cell {
  @include card-glass;
  @include hover-lift;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px;
  height: 100px; // 固定高度，保持方形质感
  cursor: default;
}

.stat-left {
  display: flex;
  align-items: center;
  gap: $spacing-md;
}

.stat-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

// 圆形图标背景
.stat-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &.blue-bg { background: rgba($accent-blue, 0.2); color: $accent-blue; }
  &.purple-bg { background: rgba($accent-purple, 0.2); color: $accent-purple; }
  &.green-bg { background: rgba($accent-green, 0.2); color: $accent-green; }
  &.cyan-bg { background: rgba($accent-cyan, 0.2); color: $accent-cyan; }
}

.stat-icon {
  font-size: 18px;
}

.stat-label {
  font-size: $font-size-md;
  font-weight: 500;
  color: $text-primary;
}

.stat-label-small {
  font-size: $font-size-sm;
  color: $text-secondary;
  margin-top: auto;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  font-family: $font-family; // 不再强制 monospace，更像 iOS
  color: $text-primary;
}

.stat-value-small {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
}

// ========================================
// Footer
// ========================================
.footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: $spacing-md;
}

// iOS 风格 Toggle
.autostart-toggle {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  cursor: pointer;
  
  input {
    display: none;
  }
  
  .switch {
    width: 36px;
    height: 22px;
    background: rgba(120, 120, 128, 0.32);
    border-radius: 11px;
    position: relative;
    transition: background 0.3s;
    
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
    }
  }
  
  input:checked + .switch {
    background: $accent-green;
    &::after {
      transform: translateX(14px);
    }
  }
}

.toggle-label {
  font-size: $font-size-sm;
  color: $text-secondary;
}

.footer-buttons {
  display: flex;
  gap: $spacing-sm;
}

.btn {
  padding: 6px 14px;
  border: none;
  border-radius: 16px;
  font-size: $font-size-sm;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    filter: brightness(1.1);
    transform: scale(1.02);
  }
}

.btn-outline {
  background: rgba(255, 255, 255, 0.1);
  color: $text-primary;
  
  &:hover {
    background: rgba(255, 255, 255, 0.2);
  }
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.15);
  color: $text-primary;
}

.btn-danger {
  background: $accent-red;
  color: white;
}

// ========================================
// Modal
// ========================================
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $border-radius-lg;
  padding: 24px;
  width: 280px;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
}

.modal-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: white;
  margin-bottom: 8px;
}

.modal-text {
  font-size: 13px;
  color: $text-secondary;
  margin-bottom: 20px;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  
  button {
    flex: 1;
    padding: 8px;
    border-radius: 10px;
  }
}

// Modal Transition
.modal-enter-active,
.modal-leave-active {
  transition: all 0.25s cubic-bezier(0.25, 0.1, 0.25, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
