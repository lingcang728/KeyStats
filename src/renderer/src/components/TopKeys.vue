<template>
  <div class="top-keys">
    <div class="section-header">
      <h3 class="section-title">键位统计</h3>
      
      <!-- Time Range Toggle -->
      <div class="segmented-control small">
        <button 
          :class="['segment-btn', { active: timeRange === 'today' }]"
          @click="timeRange = 'today'"
        >今日</button>
        <button 
          :class="['segment-btn', { active: timeRange === 'total' }]"
          @click="timeRange = 'total'"
        >总计</button>
      </div>
    </div>
    
    <div class="keys-grid" v-if="currentKeys.length">
      <div
        v-for="(item, index) in currentKeys"
        :key="item.key"
        class="key-item"
        :style="{ animationDelay: `${index * 0.05}s` }"
      >
        <div class="key-info">
          <span class="keycap">{{ formatKeyName(item.key) }}</span>
          <div class="key-bar-container">
            <div class="key-bar" :style="{ width: `${Math.min(100, (item.count / maxCount) * 100)}%` }"></div>
          </div>
        </div>
        <span class="key-count">{{ formatCount(item.count) }}</span>
      </div>
    </div>
    <div v-else class="empty-state">
      <span class="empty-text">暂无数据</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface KeyStat {
  key: string
  count: number
}

interface Props {
  todayKeys: KeyStat[]
  totalKeys: KeyStat[]
}

const props = defineProps<Props>()
const timeRange = ref<'today' | 'total'>('today')

const currentKeys = computed(() => {
  return timeRange.value === 'today' ? props.todayKeys : props.totalKeys
})

const maxCount = computed(() => {
  if (!currentKeys.value.length) return 1
  return Math.max(...currentKeys.value.map(k => k.count))
})

const formatCount = (count: number): string => {
  return count.toLocaleString('en-US')
}

const formatKeyName = (key: string): string => {
  const keyMap: Record<string, string> = {
    'Space': 'Space',
    'Enter': '↵',
    'Backspace': '⌫',
    'Tab': '⇥',
    'Escape': 'Esc',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Shift': '⇧',
    'Control': 'Ctrl',
    'Alt': 'Alt',
    'Meta': '⌘',
    'CapsLock': 'Caps',
    'Delete': 'Del'
  }
  return keyMap[key] || key
}
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.top-keys {
  @include card-glass;
  padding: 16px;
}

.section-header {
  margin-bottom: 12px;
  padding: 0 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

// Reuse Segmented Control Styles (should arguably be global, but scoped here for now)
.segmented-control {
  background: rgba(118, 118, 128, 0.24);
  border-radius: 8px;
  padding: 2px;
  display: flex;
  gap: 2px;
  
  &.small {
    .segment-btn {
      padding: 4px 8px;
      font-size: 11px;
    }
  }
}

.segment-btn {
  border: none;
  background: transparent;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: $text-primary;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  
  &.active {
    background: rgba(255, 255, 255, 0.4);
    color: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  &:not(.active):hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }
}

.keys-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.key-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  animation: fadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
}

.key-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  
  // Lively Animation Setup
  cursor: default;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); // Custom bouncy bezier
  
  &:hover {
    transform: translateY(-5px) scale(1.1); // Pop up and grow
    background: rgba(255, 255, 255, 0.2); // Brighten background
    border-color: rgba(255, 255, 255, 0.4); // Brighten border
    box-shadow: 
      0 12px 20px rgba(0, 0, 0, 0.3), // Deep shadow for lift
      0 0 12px rgba(255, 255, 255, 0.2); // Outer glow
    color: #fff;
    z-index: 10; // Ensure it floats above
  }
}

.key-bar-container {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
  overflow: hidden;
}

.key-bar {
  height: 100%;
  background: $accent-blue;
  border-radius: 3px;
  transition: width 0.5s cubic-bezier(0.2, 0.8, 0.2, 1);
  box-shadow: 0 0 10px rgba($accent-blue, 0.4);
}

.key-count {
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  font-variant-numeric: tabular-nums;
  min-width: 40px;
  text-align: right;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: $text-muted;
}

.empty-text {
  font-size: 13px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
