<template>
  <div class="stats-row">
    <div class="stats-left">
      <span class="icon">{{ icon }}</span>
      <span class="label">{{ title }}</span>
    </div>
    <div class="stats-right">
      <span class="value" :style="{ color: color || '#2196F3' }">
        {{ formattedValue }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title: string
  value: number
  icon: string
  color?: string
  unit?: string
}

const props = withDefaults(defineProps<Props>(), {
  unit: '',
  color: '#2196F3'
})

const formattedValue = computed(() => {
  if (props.unit === 'm') {
    // Convert pixels to meters
    const meters = props.value / 3779.527559
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`
    }
    return `${meters.toFixed(1)} m`
  }
  
  // Format with thousands separator
  return props.value.toLocaleString('en-US')
})
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.stats-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  
  &:last-child {
    border-bottom: none;
  }
}

.stats-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.icon {
  font-size: 20px;
  width: 28px;
  text-align: center;
}

.label {
  font-size: 14px;
  color: $text-secondary;
  font-weight: 500;
}

.value {
  font-size: 18px;
  font-weight: 700;
  font-family: 'SF Mono', 'Consolas', monospace;
}
</style>
