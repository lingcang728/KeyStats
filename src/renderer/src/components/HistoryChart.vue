<template>
  <div class="history-chart">
    <div class="header-row">
      <h3 class="section-title">历史趋势</h3>
      
      <!-- Chart Type Toggle -->
      <div class="segmented-control small">
        <button 
          :class="['segment-btn', { active: chartType === 'line' }]"
          @click="chartType = 'line'"
        >折线</button>
        <button 
          :class="['segment-btn', { active: chartType === 'bar' }]"
          @click="chartType = 'bar'"
        >柱状</button>
      </div>
    </div>
    
    <!-- Time Range & Metric Selection -->
    <div class="controls-row">
      <div class="segmented-control">
        <button 
          :class="['segment-btn', { active: timeRange === '7d' }]"
          @click="timeRange = '7d'"
        >7天</button>
        <button 
          :class="['segment-btn', { active: timeRange === '30d' }]"
          @click="timeRange = '30d'"
        >30天</button>
      </div>
      
      <div class="segmented-control scrollable">
        <button 
          v-for="m in metrics" 
          :key="m.key"
          :class="['segment-btn', { active: metric === m.key }]"
          @click="metric = m.key"
        >{{ m.label }}</button>
      </div>
    </div>
    
    <div ref="chartRef" class="chart-container"></div>
    
    <div class="total-stats">
      <span class="label">总计</span>
      <strong class="value">{{ formatTotal(totalValue) }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'

interface DayStats {
  date: string
  keyStrokes: number
  clicks: number
  mouseDistance: number
  scrollDistance: number
}

interface Props {
  data: DayStats[]
}

const props = defineProps<Props>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: echarts.ECharts | null = null

const timeRange = ref<'7d' | '30d'>('7d')
const metric = ref<'keyStrokes' | 'clicks' | 'mouseDistance' | 'scrollDistance'>('keyStrokes')
const chartType = ref<'line' | 'bar'>('line')

const metrics = [
  { key: 'keyStrokes', label: '键盘' },
  { key: 'clicks', label: '点击' },
  { key: 'mouseDistance', label: '移动' },
  { key: 'scrollDistance', label: '滚轮' }
]

const filteredData = computed(() => {
  const days = timeRange.value === '7d' ? 7 : 30
  return props.data.slice(-days)
})

const totalValue = computed(() => {
  return filteredData.value.reduce((sum, d) => sum + (d[metric.value] || 0), 0)
})

const formatTotal = (val: number): string => {
  if (metric.value === 'mouseDistance') {
    const meters = val / 3779.527559
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
    return `${meters.toFixed(1)} m`
  }
  return val.toLocaleString('en-US')
}

const initChart = () => {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)
  updateChart()
}

const updateChart = () => {
  if (!chartInstance || !filteredData.value.length) return
  
  const dates = filteredData.value.map(d => {
    const date = new Date(d.date)
    return `${date.getMonth() + 1}/${date.getDate()}`
  })
  
  let values = filteredData.value.map(d => d[metric.value] || 0)
  
  // Convert mouse distance to meters for display
  if (metric.value === 'mouseDistance') {
    values = values.map(v => Math.round(v / 3779.527559 * 10) / 10)
  }
  
  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    grid: {
      top: 10,
      right: 10,
      bottom: 20,
      left: 10,
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      confine: true, // 限制在图表区域内，防止溢出导致消失
      enterable: true, // 允许鼠标进入 Tooltip
      snap: true, // 自动吸附到最近的数据点
      showContent: true,
      backgroundColor: 'rgba(20, 20, 20, 0.85)', // 更深的黑色背景
      borderColor: 'rgba(255, 255, 255, 0.1)',
      borderWidth: 1,
      padding: [10, 16],
      textStyle: { color: '#fff', fontSize: 13, fontWeight: 500 },
      extraCssText: 'backdrop-filter: blur(10px); border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); pointer-events: none;', // pointer-events: none 防止 Tooltip 阻挡鼠标事件导致闪烁
      axisPointer: {
        type: 'line',
        snap: true, // 轴指示器吸附
        lineStyle: {
          color: 'rgba(255, 255, 255, 0.3)',
          width: 1,
          type: 'solid' // 实线更稳定
        }
      }
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: 'rgba(235, 235, 245, 0.6)', fontSize: 11, margin: 10 }
    },
    yAxis: {
      type: 'value',
      splitLine: { 
        lineStyle: { 
          color: 'rgba(255, 255, 255, 0.05)',
          type: 'dashed' 
        } 
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(235, 235, 245, 0.6)',
        fontSize: 11,
        formatter: (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toString()
      }
    },
    series: [{
      id: 'history_series', // 关键：固定 ID 防止重绘时被视为新系列
      type: chartType.value,
      data: values,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      // 开启通用过渡动画，实现丝滑切换
      universalTransition: true,
      // 初始动画时长
      animationDuration: 1000,
      // 更新动画时长（数据变化时）
      animationDurationUpdate: 300,
      itemStyle: {
        color: '#0A84FF',
        borderRadius: chartType.value === 'bar' ? [4, 4, 0, 0] : 0,
        borderColor: '#fff',
        borderWidth: 1.5
      },
      lineStyle: {
        width: 3,
        shadowColor: 'rgba(10, 132, 255, 0.5)',
        shadowBlur: 10
      },
      areaStyle: chartType.value === 'line' ? {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(10, 132, 255, 0.3)' },
          { offset: 1, color: 'rgba(10, 132, 255, 0.0)' }
        ])
      } : { opacity: 0 }
    }]
  }
  
  // 移除 replaceMerge，依赖 id 进行智能合并
  chartInstance.setOption(option, { notMerge: false })
}

// 监听图表类型变化，手动触发一次更新以应用 universalTransition
watch(chartType, () => {
  updateChart()
})

// 监听数据变化
watch([timeRange, metric, () => props.data], () => {
  updateChart()
}, { deep: true })

onMounted(() => {
  initChart()
  window.addEventListener('resize', () => chartInstance?.resize())
})

onUnmounted(() => {
  chartInstance?.dispose()
})
</script>

<style lang="scss" scoped>
@use '../styles/variables' as *;

.history-chart {
  @include card-glass;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.controls-row {
  display: flex;
  gap: 12px;
}

// iOS Segmented Control 风格
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
  
  &.scrollable {
    overflow-x: auto;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
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
    background: rgba(255, 255, 255, 0.4); // 更亮的选中态
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
  height: 180px;
  margin: 4px 0;
  transition: opacity 0.3s ease-out; /* Add smooth transition for container */
}

.total-stats {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  
  .label {
    font-size: 13px;
    color: $text-secondary;
  }
  
  .value {
    font-size: 17px;
    font-weight: 600;
    color: $text-primary;
  }
}
</style>
