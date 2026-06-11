<template>
  <div class="keyboard-heatmap">
    <div class="section-header">
      <h3 class="section-title">按键热力图</h3>

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

    <div ref="chartRef" class="chart-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

interface Props {
  todayMap: Record<string, number>
  totalMap: Record<string, number>
}

const props = defineProps<Props>()
const timeRange = ref<'today' | 'total'>('today')
const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: echarts.ECharts | null = null

// 标准 60% 键盘布局（单位宽度，总宽 15u）。label 须与主进程 KeyCodeMap 的键名一致。
interface KeyDef {
  label: string
  w: number
  /** 渲染在键帽上的短名（缺省用 label） */
  short?: string
}

const KEY_ROWS: KeyDef[][] = [
  [
    { label: 'Esc', w: 1 },
    { label: 'F1', w: 1 }, { label: 'F2', w: 1 }, { label: 'F3', w: 1 }, { label: 'F4', w: 1 },
    { label: 'F5', w: 1 }, { label: 'F6', w: 1 }, { label: 'F7', w: 1 }, { label: 'F8', w: 1 },
    { label: 'F9', w: 1 }, { label: 'F10', w: 1 }, { label: 'F11', w: 1 }, { label: 'F12', w: 1 },
    { label: 'Delete', w: 2, short: 'Del' }
  ],
  [
    { label: '`', w: 1 },
    { label: '1', w: 1 }, { label: '2', w: 1 }, { label: '3', w: 1 }, { label: '4', w: 1 },
    { label: '5', w: 1 }, { label: '6', w: 1 }, { label: '7', w: 1 }, { label: '8', w: 1 },
    { label: '9', w: 1 }, { label: '0', w: 1 }, { label: '-', w: 1 }, { label: '=', w: 1 },
    { label: 'Backspace', w: 2, short: '⌫' }
  ],
  [
    { label: 'Tab', w: 1.5, short: '⇥' },
    { label: 'Q', w: 1 }, { label: 'W', w: 1 }, { label: 'E', w: 1 }, { label: 'R', w: 1 },
    { label: 'T', w: 1 }, { label: 'Y', w: 1 }, { label: 'U', w: 1 }, { label: 'I', w: 1 },
    { label: 'O', w: 1 }, { label: 'P', w: 1 }, { label: '[', w: 1 }, { label: ']', w: 1 },
    { label: '\\', w: 1.5 }
  ],
  [
    { label: 'CapsLock', w: 1.75, short: 'Caps' },
    { label: 'A', w: 1 }, { label: 'S', w: 1 }, { label: 'D', w: 1 }, { label: 'F', w: 1 },
    { label: 'G', w: 1 }, { label: 'H', w: 1 }, { label: 'J', w: 1 }, { label: 'K', w: 1 },
    { label: 'L', w: 1 }, { label: ';', w: 1 }, { label: "'", w: 1 },
    { label: 'Enter', w: 2.25, short: '↵' }
  ],
  [
    { label: 'Shift', w: 2.25, short: '⇧' },
    { label: 'Z', w: 1 }, { label: 'X', w: 1 }, { label: 'C', w: 1 }, { label: 'V', w: 1 },
    { label: 'B', w: 1 }, { label: 'N', w: 1 }, { label: 'M', w: 1 },
    { label: ',', w: 1 }, { label: '.', w: 1 }, { label: '/', w: 1 },
    { label: 'Shift', w: 2.75, short: '⇧' }
  ],
  [
    { label: 'Ctrl', w: 1.25 },
    { label: 'Win', w: 1.25, short: '⊞' },
    { label: 'Alt', w: 1.25 },
    { label: 'Space', w: 6.25, short: '' },
    { label: 'Alt', w: 1.25 },
    { label: '←', w: 1.25 }, { label: '↓', w: 1.25 }, { label: '→', w: 1.25 }
  ]
]

const TOTAL_UNITS = 15
const ROW_COUNT = KEY_ROWS.length

/**
 * 把计数表聚合到布局键名上：
 * 组合键（如 "Ctrl + C"）拆开后分别计入每个组成键，让热力图反映真实使用强度。
 */
const aggregateCounts = (map: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(map)) {
    const parts = key.includes(' + ') ? key.split(' + ') : [key]
    for (const part of parts) {
      out[part] = (out[part] || 0) + count
    }
  }
  return out
}

const activeCounts = computed(() =>
  aggregateCounts(timeRange.value === 'today' ? props.todayMap : props.totalMap)
)

// [xStart, rowIndex, width, label, count, shortLabel]
type HeatItem = [number, number, number, string, number, string]

const buildData = (): { items: HeatItem[]; maxCount: number } => {
  const counts = activeCounts.value
  const items: HeatItem[] = []
  let maxCount = 0
  KEY_ROWS.forEach((row, rowIdx) => {
    let x = 0
    for (const key of row) {
      const count = counts[key.label] || 0
      maxCount = Math.max(maxCount, count)
      items.push([x, rowIdx, key.w, key.label, count, key.short ?? key.label])
      x += key.w
    }
  })
  return { items, maxCount }
}

const renderItem: echarts.CustomSeriesRenderItem = (_params, api) => {
  const x = api.value(0) as number
  const row = api.value(1) as number
  const w = api.value(2) as number
  const short = api.value(5) as string
  const start = api.coord([x, row])
  const end = api.coord([x + w, row + 1])
  const gap = 3
  const rectW = end[0] - start[0] - gap
  const rectH = end[1] - start[1] - gap
  if (rectW <= 0 || rectH <= 0) return undefined as never

  return {
    type: 'group',
    children: [
      {
        type: 'rect',
        shape: { x: start[0] + gap / 2, y: start[1] + gap / 2, width: rectW, height: rectH, r: 4 },
        style: {
          fill: api.visual('color') as string,
          stroke: 'rgba(255, 255, 255, 0.08)',
          lineWidth: 1
        }
      },
      {
        type: 'text',
        style: {
          text: String(short),
          x: start[0] + gap / 2 + rectW / 2,
          y: start[1] + gap / 2 + rectH / 2,
          align: 'center',
          verticalAlign: 'middle',
          fontSize: 9,
          fontWeight: 500,
          fill: 'rgba(235, 235, 245, 0.78)'
        },
        silent: true
      }
    ]
  } as never
}

const updateChart = (): void => {
  if (!chartInstance) return
  const { items, maxCount } = buildData()

  chartInstance.setOption(
    {
      animation: false,
      grid: { left: 0, right: 0, top: 0, bottom: 0 },
      xAxis: { type: 'value', min: 0, max: TOTAL_UNITS, show: false },
      yAxis: { type: 'value', min: 0, max: ROW_COUNT, show: false, inverse: true },
      tooltip: {
        confine: true,
        backgroundColor: 'rgba(30, 32, 40, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (p: { value: HeatItem }) =>
          `${p.value[3]}<br/>按键 <strong>${p.value[4].toLocaleString('en-US')}</strong> 次`
      },
      visualMap: {
        show: false,
        dimension: 4,
        min: 0,
        max: Math.max(1, maxCount),
        inRange: {
          // 无数据 → 玻璃底色；高频 → iOS Blue 高亮
          color: ['rgba(255, 255, 255, 0.05)', 'rgba(10, 132, 255, 0.40)', 'rgba(10, 132, 255, 0.95)']
        }
      },
      series: [
        {
          type: 'custom',
          renderItem,
          data: items,
          encode: { x: 0, y: 1, tooltip: [3, 4] }
        }
      ]
    },
    { notMerge: true }
  )
}

watch([activeCounts, timeRange], () => updateChart())

onMounted(() => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value)
    updateChart()
  }
})

onUnmounted(() => {
  chartInstance?.dispose()
  chartInstance = null
})
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.keyboard-heatmap {
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

.chart-container {
  width: 100%;
  height: 150px;
}
</style>
