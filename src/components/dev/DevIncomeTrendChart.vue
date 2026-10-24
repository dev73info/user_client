<script setup lang="ts">
import { computed, useId } from 'vue'

import { useIncomeChart, CHART_HEIGHT, CHART_WIDTH } from '@/composables/useIncomeChart'
import { money } from '@/shared/devFundDisplay'

import type { DevHomeIncomeBucket } from '@/composables/useIncomeChart'

/**
 * 收入走势图：近 N 天到账折线 + 面积 + 悬停读数。
 *
 * 从 `views/DevHomeView.vue` 抽出来。坐标换算与悬停状态在 `useIncomeChart`，这里只负责画：
 * 数据从 `buckets` 进来（视图决定是「最近到账归集」还是「快照日序列」），组件不认识任何接口。
 *
 * 两个坑写在这里，免得下次重构踩回去：
 * 1. 面积填充的渐变 `<defs>` 用的是 **DOM id**，写死成 `devHomeIncomeFill` 时同页出现两个图表
 *    就会串色（`url(#id)` 永远解析到第一个），所以按 `useId()` 生成唯一 id 再拼；
 * 2. 画布高度不只是外观：悬停竖线按 `CHART_HEIGHT` 把坐标换算成百分比，高度与常量一旦不一致
 *    竖线就不贴点，而两者拆在两个文件里最容易只改一处，所以高度由下面这个常量注入到 svg 上。
 */
const props = defineProps<{
  /** 每天一个标签 + 金额，最早一天在左。 */
  buckets: DevHomeIncomeBucket[]
  /** 图上的 title：口径说明由视图给（真机是最近 100 笔到账的分布，看板是快照自带的日序列）。 */
  caption: string
}>()

const {
  hasIncomeData,
  chartGeometry,
  peakIndex,
  peakLabel,
  peakLabelLeft,
  hoveredBucketIndex,
  hoveredBucket,
  bucketHitStyle,
  chartDays,
  sparseAxis,
  axisLabels,
} = useIncomeChart({ buckets: computed(() => props.buckets) })

/** 渐变 id 按实例唯一：同页两个图表各染各的颜色，不互相顶掉。 */
const fillId = `dev-home-income-fill-${useId()}`
</script>

<template>
  <div class="dev-home__chart" :title="caption">
    <!-- 悬停时头顶换成那一天自己的读数（两颗都挂在同一个位置，同时出现会叠在一起） -->
    <span
      v-if="hoveredBucket"
      class="dev-home__chart-tip"
      :style="{ left: hoveredBucket.tipLeft, transform: hoveredBucket.tipTransform }"
    >
      {{ hoveredBucket.label }} · {{ money(hoveredBucket.value) }}
    </span>
    <span v-else-if="hasIncomeData" class="dev-home__chart-peak" :style="{ left: peakLabelLeft }">
      {{ peakLabel }}
    </span>

    <span
      v-if="hoveredBucket"
      class="dev-home__chart-guide"
      :style="{
        left: hoveredBucket.guideLeft,
        top: hoveredBucket.top,
        height: hoveredBucket.height,
      }"
    />

    <svg
      class="dev-home__chart-svg"
      :style="{ height: `${CHART_HEIGHT}px` }"
      :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
      preserveAspectRatio="none"
      role="img"
      :aria-label="`近 ${chartDays} 天到账金额，最高一天 ${peakLabel}`"
    >
      <defs>
        <linearGradient :id="fillId" x1="0" y1="0" x2="0" y2="1">
          <stop class="dev-home__chart-stop-a" offset="0%" />
          <stop class="dev-home__chart-stop-b" offset="100%" />
        </linearGradient>
      </defs>
      <line
        class="dev-home__chart-axis"
        x1="0"
        :x2="CHART_WIDTH"
        :y1="chartGeometry.baseline"
        :y2="chartGeometry.baseline"
      />
      <template v-if="hasIncomeData">
        <path class="dev-home__chart-area" :d="chartGeometry.area" :fill="`url(#${fillId})`" />
        <path
          class="dev-home__chart-line"
          :d="chartGeometry.line"
          vector-effect="non-scaling-stroke"
        />
        <circle
          v-for="(point, index) in chartGeometry.points"
          :key="point.label"
          class="dev-home__chart-dot"
          :class="{ 'is-peak': index === peakIndex, 'is-active': index === hoveredBucketIndex }"
          :cx="point.x"
          :cy="point.y"
          :r="index === hoveredBucketIndex ? 4 : index === peakIndex ? 3.5 : 2"
          vector-effect="non-scaling-stroke"
        />
      </template>
    </svg>

    <!-- 每天一条命中带：指到哪一天就在头顶报那一天的金额，键盘 Tab 也能逐天读 -->
    <div v-if="hasIncomeData" class="dev-home__chart-hits">
      <button
        v-for="(point, index) in chartGeometry.points"
        :key="point.label"
        type="button"
        class="dev-home__chart-hit"
        :style="bucketHitStyle(index)"
        :aria-label="`${point.label} 到账 ${money(point.value)}`"
        @mouseenter="hoveredBucketIndex = index"
        @mouseleave="hoveredBucketIndex = null"
        @focus="hoveredBucketIndex = index"
        @blur="hoveredBucketIndex = null"
      />
    </div>

    <div
      v-if="sparseAxis"
      class="dev-home__chart-axis-labels dev-home__chart-axis-labels--sparse"
      aria-hidden="true"
    >
      <span
        v-for="item in axisLabels"
        :key="item.label"
        :style="{ left: item.left, transform: item.transform }"
        >{{ item.label }}</span
      >
    </div>
    <div v-else class="dev-home__chart-axis-labels" aria-hidden="true">
      <span v-for="bucket in buckets" :key="bucket.label">{{ bucket.label }}</span>
    </div>

    <p v-if="!hasIncomeData" class="dev-home__chart-empty">近 {{ chartDays }} 天没有到账记录</p>
  </div>
</template>

<style scoped>
/* 空态原先挂在这一块外面（`dev-home__fund-trend` 的第二个孩子），搬进来不影响位置：
   图表块是普通流式块、无底色与边框，空态只在没有曲线时出现，与绝对定位的命中带互斥。 */
.dev-home__chart {
  position: relative;
  margin-top: 10px;
}

/* 高度不写在这里：由模板按 useIncomeChart 的 CHART_HEIGHT 注入，两者必须是同一个数 */
.dev-home__chart-svg {
  display: block;
  width: 100%;
}

.dev-home__chart-stop-a {
  stop-color: var(--dev-blue);
  stop-opacity: 0.32;
}

.dev-home__chart-stop-b {
  stop-color: var(--dev-blue);
  stop-opacity: 0;
}

.dev-home__chart-axis {
  stroke: var(--dev-line);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.dev-home__chart-line {
  fill: none;
  stroke: var(--dev-blue);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dev-home__chart-dot {
  fill: var(--dev-surface-strong);
  stroke: var(--dev-blue);
  stroke-width: 1.5;
}

.dev-home__chart-dot.is-peak {
  fill: var(--dev-blue);
}

.dev-home__chart-dot.is-active {
  fill: var(--dev-blue);
  stroke-width: 2.5;
}

/* 悬停读数：深底白字的胶囊，与「最高一天」那颗蓝胶囊区分开——蓝的是这一周的峰值，
   深色的是鼠标底下那一天的当日读数。横向位置与两端翻边由模板内联给（见 hoveredBucket）。 */
.dev-home__chart-tip {
  position: absolute;
  top: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--dev-ink);
  color: var(--dev-surface-strong);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

/* 从当天那个点到基线的竖线：指着哪一天，一眼能看出对应的是曲线上的哪个点 */
.dev-home__chart-guide {
  position: absolute;
  width: 1px;
  background: color-mix(in srgb, var(--dev-blue) 38%, transparent);
  pointer-events: none;
}

/* 命中带：铺满整个图（含下面的日期），指到哪一格就报哪一天；它盖在 SVG 之上，
   所以曲线上的圆点不各挂一次监听，焦点与悬停都集中在这七颗按钮上。 */
.dev-home__chart-hits {
  position: absolute;
  inset: 0;
}

.dev-home__chart-hit {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.dev-home__chart-hit:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: -2px;
  border-radius: 6px;
}

.dev-home__chart-peak {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--dev-blue);
  color: var(--dev-surface-strong);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

.dev-home__chart-axis-labels {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-top: 6px;
  color: var(--dev-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* 30 天横轴：只标抽稀后的几天，标签按对应点的横坐标绝对定位 */
.dev-home__chart-axis-labels--sparse {
  position: relative;
  display: block;
  height: 14px;
}

.dev-home__chart-axis-labels--sparse span {
  position: absolute;
  top: 0;
  white-space: nowrap;
}

.dev-home__chart-empty {
  margin: 8px 0 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
}
</style>
