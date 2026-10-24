import { computed, ref, watch } from 'vue'

import { money } from '@/shared/devFundDisplay'

import type { ComputedRef } from 'vue'

/**
 * 收入走势图的几何与交互：从 `views/DevHomeView.vue` 抽出来的纯计算部分。只吃数据（`buckets`），
 * 不读 store、不发请求、不碰 DOM。数据从哪来留在视图：真机按到账日归集，看板用快照的日序列。
 */

/** 走势图的一天：横轴标签 + 当天到账金额（毛额）。 */
export type DevHomeIncomeBucket = {
  label: string
  value: number
}

/** 近 7 天窗口；条数超过它（全屏看板改画近 30 天）就把横轴标签抽稀。 */
export const CHART_BUCKETS = 7

export const CHART_WIDTH = 320

/**
 * 画布高度。**必须与 `.dev-home__chart-svg` 的 CSS 高度是同一个数**——悬停竖线按它把坐标换算成
 * 百分比（见 `hoveredBucket`），差一点竖线就不贴点。拆成两个文件后只留这一个来源：
 * 组件把 `:style="{ height: `${CHART_HEIGHT}px` }"` 注到 svg 上，样式里不再另写高度。
 */
export const CHART_HEIGHT = 132

const CHART_PAD_X = 10
const CHART_PAD_TOP = 16
const CHART_PAD_BOTTOM = 10

/** 悬停读数胶囊在两端翻边的阈值（百分比）：胶囊比「最高一天」那颗宽，居中会溢出去。 */
const TIP_EDGE_PERCENT = 16

/** 30 天的日期挤不下：每 5 天标一个，从今天往回数，保证最右端永远是今天。 */
const AXIS_LABEL_STEP = 5

export function useIncomeChart(options: { buckets: ComputedRef<DevHomeIncomeBucket[]> }) {
  const incomeBuckets = options.buckets
  const chartMax = computed(() =>
    incomeBuckets.value.reduce((max, bucket) => Math.max(max, bucket.value), 0),
  )
  const hasIncomeData = computed(() => chartMax.value > 0)

  /** 折线与面积共用同一串坐标：横向铺满、纵向按最大值等比缩放。 */
  const chartGeometry = computed(() => {
    const buckets = incomeBuckets.value
    const usableWidth = CHART_WIDTH - CHART_PAD_X * 2
    const usableHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM
    const step = buckets.length > 1 ? usableWidth / (buckets.length - 1) : 0
    const baseline = CHART_HEIGHT - CHART_PAD_BOTTOM

    const points = buckets.map((bucket, index) => {
      const ratio = chartMax.value > 0 ? bucket.value / chartMax.value : 0

      return {
        ...bucket,
        x: CHART_PAD_X + step * index,
        y: baseline - ratio * usableHeight,
      }
    })

    const line = points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      )
      .join(' ')
    const first = points[0]
    const last = points[points.length - 1]
    const area =
      first && last
        ? `${line} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`
        : ''

    return { points, line, area, baseline }
  })

  /** 最高一天的读数标在它自己上方；贴边时把标签拉回画布内，避免溢出卡片。 */
  const peakIndex = computed(() =>
    incomeBuckets.value.reduce(
      (best, bucket, index) =>
        bucket.value > (incomeBuckets.value[best]?.value ?? 0) ? index : best,
      0,
    ),
  )

  const peakLabel = computed(() => money(incomeBuckets.value[peakIndex.value]?.value))

  /** 把第 index 天的横向位置换算成百分比；贴边时拉回画布内（「最高一天」那颗读数用）。 */
  function bucketLeftPercent(index: number): string {
    const lastIndex = incomeBuckets.value.length - 1
    if (lastIndex <= 0) {
      return '50%'
    }
    const percent = (index / lastIndex) * 100
    return `${Math.min(88, Math.max(12, percent)).toFixed(1)}%`
  }

  const peakLabelLeft = computed(() => bucketLeftPercent(peakIndex.value))

  /**
   * 鼠标悬停（或键盘聚焦）的那一天：每一天铺一条命中带，指上去就在头顶报「日期 · 金额」，
   * 并把圆点放大、画一条竖线；没有命中带时只有最高一天那颗读数。
   */
  const hoveredBucketIndex = ref<number | null>(null)

  /**
   * 换窗口（近 7 天 ⇄ 看板的近 30 天）时清掉悬停态。
   *
   * 不清的话，悬停读数会继续按要求「第 index 天」渲染——而同一个下标在新窗口里已经是另一天，
   * 竖线与胶囊还留在旧几何上（表现为切换后残留一条旧读数和一条旧竖线，直到鼠标再动一下才自愈）。
   * 只认日期序列，不认长度：两个窗口长度不同是常态，但内容换了就必须重来。
   */
  watch(
    () => incomeBuckets.value.map((bucket) => bucket.label).join('|'),
    () => {
      hoveredBucketIndex.value = null
    },
  )

  const hoveredBucket = computed(() => {
    const index = hoveredBucketIndex.value
    if (index == null) {
      return null
    }

    const bucket = incomeBuckets.value[index]
    const point = chartGeometry.value.points[index]
    const lastIndex = chartGeometry.value.points.length - 1
    if (!bucket || !point || lastIndex <= 0) {
      return null
    }

    const percent = (point.x / CHART_WIDTH) * 100
    // 头顶读数始终以当天那个点为锚，贴到两端时把胶囊翻到点的内侧（它比「最高一天」那颗宽，
    // 居中摆在最左/最右会溢出去）。竖线不参与收边，永远画在当天那个点上，两者不共用一个横坐标。
    const tipTransform =
      percent <= TIP_EDGE_PERCENT
        ? 'translateX(0)'
        : percent >= 100 - TIP_EDGE_PERCENT
          ? 'translateX(-100%)'
          : 'translateX(-50%)'

    return {
      label: bucket.label,
      value: bucket.value,
      tipLeft: `${percent.toFixed(2)}%`,
      tipTransform,
      guideLeft: `${percent.toFixed(2)}%`,
      // 竖线从该点画到基线：点与基线都在 CHART_HEIGHT 高的画布里，直接换算成百分比给高度
      top: `${((point.y / CHART_HEIGHT) * 100).toFixed(1)}%`,
      height: `${(((chartGeometry.value.baseline - point.y) / CHART_HEIGHT) * 100).toFixed(1)}%`,
    }
  })

  /** 命中带的左右边界：以当天那个点为中心、各占与邻点间距的一半，最外侧两条各自收在画布边上。 */
  function bucketHitStyle(index: number): Record<string, string> {
    const lastIndex = chartGeometry.value.points.length - 1
    if (lastIndex <= 0) {
      return { left: '0%', right: '0%' }
    }
    const center = (chartGeometry.value.points[index]!.x / CHART_WIDTH) * 100
    const half = 100 / lastIndex / 2
    return {
      left: `${Math.max(0, center - half).toFixed(2)}%`,
      right: `${Math.max(0, 100 - center - half).toFixed(2)}%`,
    }
  }

  const chartDays = computed(() => incomeBuckets.value.length)

  const sparseAxis = computed(() => chartDays.value > CHART_BUCKETS)

  const axisLabels = computed(() => {
    const points = chartGeometry.value.points
    const lastIndex = points.length - 1

    return points.flatMap((point, index) => {
      if ((lastIndex - index) % AXIS_LABEL_STEP !== 0) {
        return []
      }
      const percent = (point.x / CHART_WIDTH) * 100
      return [
        {
          label: point.label,
          left: `${percent.toFixed(2)}%`,
          transform:
            index === lastIndex
              ? 'translateX(-100%)'
              : index === 0
                ? 'translateX(0)'
                : 'translateX(-50%)',
        },
      ]
    })
  })
  return {
    CHART_WIDTH,
    CHART_HEIGHT,
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
  }
}
