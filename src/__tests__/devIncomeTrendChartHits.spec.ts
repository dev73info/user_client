import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DevIncomeTrendChart from '@/components/dev/DevIncomeTrendChart.vue'
import { CHART_WIDTH } from '@/composables/useIncomeChart'

import type { DevHomeIncomeBucket } from '@/composables/useIncomeChart'

/**
 * 命中带几何的回归用例。
 *
 * 背景：全屏看板会把曲线从「近 7 天」换成快照自带的「近 30 天」（见 `DevHomeView` 的 `incomeBuckets`），
 * 曾观察到切换后最右几块命中带像是留着旧几何。命中带的位置由 `bucketHitStyle` 按 `chartGeometry`
 * 算出来，是纯 computed，本不该残留——所以这里把它钉死：**切换后每一条都必须等于按新条数算出来的位置**，
 * 只要有一条不匹配就说明 DOM 复用或样式补丁出了问题。
 *
 * 顺带说明为什么不是「断言具体数字」：具体像素属于实现细节，改成按公式算更稳，
 * 公式本身来自 `useIncomeChart` 的约定（左右各 10px 内边距、点均分可用宽度、每带半格宽）。
 */
const PAD_X = 10
const USABLE = CHART_WIDTH - PAD_X * 2

function buckets(days: number): DevHomeIncomeBucket[] {
  return Array.from({ length: days }, (_, index) => ({
    label: `10-${String(index + 1).padStart(2, '0')}`,
    value: (index % 5) + 1,
  }))
}

/** 按天数算出第 index 条命中带应有的 left / right（百分比数值）。 */
function expectedBand(days: number, index: number) {
  const lastIndex = days - 1
  const step = USABLE / lastIndex
  const center = ((PAD_X + step * index) / CHART_WIDTH) * 100
  const half = 100 / lastIndex / 2
  return {
    left: Math.max(0, center - half),
    right: Math.max(0, 100 - center - half),
  }
}

/** 解析内联样式里的百分比。DOM 会把 `0.00%` 规范化成 `0%`，所以只比数值不比字符串。 */
function readBand(style: string | undefined) {
  const left = Number(/(?:^|;)\s*left:\s*([\d.]+)%/.exec(style ?? '')?.[1])
  const right = Number(/(?:^|;)\s*right:\s*([\d.]+)%/.exec(style ?? '')?.[1])
  return { left, right }
}

function expectBandAt(style: string | undefined, days: number, index: number) {
  const actual = readBand(style)
  const expected = expectedBand(days, index)
  // 内联值保留两位小数，容差取 0.01
  expect(actual.left, `第 ${index} 条命中带 left 与 ${days} 天几何不符`).toBeCloseTo(
    expected.left,
    1,
  )
  expect(actual.right, `第 ${index} 条命中带 right 与 ${days} 天几何不符`).toBeCloseTo(
    expected.right,
    1,
  )
}

const mountChart = (days: number) =>
  mount(DevIncomeTrendChart, {
    props: { buckets: buckets(days), caption: '测试口径' },
  })

describe('收入走势图命中带', () => {
  it('近 7 天：每条命中带与按 7 天算出的位置一致', () => {
    const wrapper = mountChart(7)
    const bands = wrapper.findAll('.dev-home__chart-hit')
    expect(bands).toHaveLength(7)
    bands.forEach((band, index) => expectBandAt(band.attributes('style'), 7, index))
    wrapper.unmount()
  })

  it('7 天切到 30 天：每一条都按 30 天重算，不留旧几何（回归）', async () => {
    const wrapper = mountChart(7)
    expect(wrapper.findAll('.dev-home__chart-hit')).toHaveLength(7)

    await wrapper.setProps({ buckets: buckets(30) })

    const bands = wrapper.findAll('.dev-home__chart-hit')
    expect(bands).toHaveLength(30)
    bands.forEach((band, index) => expectBandAt(band.attributes('style'), 30, index))
    wrapper.unmount()
  })

  it('换窗口时清掉悬停态：不会留着旧一天的读数与竖线（回归）', async () => {
    const wrapper = mountChart(7)
    // 悬停第 5 条（近 7 天窗口里的第 6 天）
    await wrapper.findAll('.dev-home__chart-hit')[5]!.trigger('mouseenter')
    expect(wrapper.find('.dev-home__chart-tip').exists()).toBe(true)

    // 进全屏 → 换成近 30 天：同一下标已经是另一天，旧读数必须消失
    await wrapper.setProps({ buckets: buckets(30) })

    expect(wrapper.find('.dev-home__chart-tip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('30 天切回 7 天同样重算（双向都不残留）', async () => {
    const wrapper = mountChart(30)
    await wrapper.setProps({ buckets: buckets(7) })

    const bands = wrapper.findAll('.dev-home__chart-hit')
    expect(bands).toHaveLength(7)
    bands.forEach((band, index) => expectBandAt(band.attributes('style'), 7, index))
    wrapper.unmount()
  })
})
