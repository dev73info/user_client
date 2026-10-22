import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { PublicMcResourceItem } from '@/api/resources'
import SpotlightResourceSection from '@/components/home/SpotlightResourceSection.vue'
import { publicResourceFixture as resourceFixture } from './homeSpotlightFixtures'

/**
 * 首页「免费精选资源」整块（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 重点钉住搬迁里最容易静默坏掉的三处：
 * - **分页每页 8 张**：栅格条数、页码数量、下一/上一页的翻动结果；
 * - **点赞不回带 open**：按钮的 `.stop` 挡的是外层卡片的 `@click`，两者搬进同一组件后
 *   层级变了 —— 一旦冒泡漏过去，用户点一次赞会同时被带去资源详情；
 * - **封面兜底**：资源没有封面时渲染首字占位块而不是碎图。
 *
 * 组件只回抛事件（`open` / `like` / `more`），请求与跳转都在父级，这里不 mock 任何 api。
 */

function renderSection(resources: PublicMcResourceItem[], likeSubmittingIds = new Set<number>()) {
  return mount(SpotlightResourceSection, {
    props: { resources, highLikeThreshold: 5, likeSubmittingIds },
  })
}

describe('SpotlightResourceSection 精选资源区', () => {
  it('12 条资源只渲染第一页 8 张卡，并给出两个页码', () => {
    const resources = Array.from({ length: 12 }, (_, index) => resourceFixture({ id: index + 1 }))
    const wrapper = renderSection(resources)

    expect(wrapper.findAll('.portal-spotlight-card')).toHaveLength(8)
    expect(wrapper.findAll('.portal-pagination__page').map((node) => node.text())).toEqual([
      '1',
      '2',
    ])
    expect(wrapper.find('.portal-pagination').attributes('aria-label')).toBe('免费资源分页')
  })

  it('点「下一页」翻到第 2 页只剩 4 张；「上一页」回到 8 张并落在第 1 页', async () => {
    const resources = Array.from({ length: 12 }, (_, index) => resourceFixture({ id: index + 1 }))
    const wrapper = renderSection(resources)

    const [prev, next] = wrapper.findAll('.portal-pagination__nav')
    // 第一页时「上一页」禁用：翻页边界与 `goPage` 的越界判断一致。
    expect(prev!.attributes('disabled')).toBeDefined()

    await next!.trigger('click')
    expect(wrapper.findAll('.portal-spotlight-card')).toHaveLength(4)
    expect(wrapper.find('.portal-pagination__page.is-active').text()).toBe('2')

    await wrapper.findAll('.portal-pagination__nav')[0]!.trigger('click')
    expect(wrapper.findAll('.portal-spotlight-card')).toHaveLength(8)
    expect(wrapper.find('.portal-pagination__page.is-active').text()).toBe('1')
  })

  it('点赞只回抛一次 like，且不夹带 open（.stop 仍挡住卡片点击）', async () => {
    const wrapper = renderSection([resourceFixture({ id: 7, like_count: 3 })])

    await wrapper.find('.portal-spotlight-card__likes').trigger('click')

    const likes = wrapper.emitted('like')
    expect(likes).toHaveLength(1)
    // 双触发的判据：点赞那次点击没有被当成卡片点击。
    expect(wrapper.emitted('open')).toBeUndefined()
    expect((likes![0]![0] as { resourceId: number }).resourceId).toBe(7)
  })

  it('点卡片回抛 open；提交中的点赞按钮置灰', async () => {
    const wrapper = renderSection([resourceFixture({ id: 9 })], new Set([9]))

    expect(wrapper.find('.portal-spotlight-card__likes').attributes('disabled')).toBeDefined()
    await wrapper.find('.portal-spotlight-card').trigger('click')

    const opens = wrapper.emitted('open')
    expect(opens).toHaveLength(1)
    expect((opens![0]![0] as { resourceId: number }).resourceId).toBe(9)
  })

  it('没有封面时回落首字占位块；「更多免费资源」回抛 more', async () => {
    const wrapper = renderSection([resourceFixture({ id: 3, title: 'vanilla 整合' })])

    expect(wrapper.find('.portal-spotlight-card__cover-img').exists()).toBe(false)
    expect(wrapper.find('.portal-spotlight-card__cover-text').text()).toBe('V')

    await wrapper.find('.portal-link-btn').trigger('click')
    expect(wrapper.emitted('more')).toHaveLength(1)
  })

  it('没有资源时只显示空态，不渲染栅格与分页', () => {
    const wrapper = renderSection([])

    expect(wrapper.find('.portal-spotlight-grid').exists()).toBe(false)
    expect(wrapper.find('.portal-pagination').exists()).toBe(false)
    expect(wrapper.find('.portal-empty-state').text()).toContain('暂无免费资源')
  })
})
