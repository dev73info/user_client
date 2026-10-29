import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'

import { usePublicResources } from '@/composables/usePublicResources'
import { useSpotlightCards } from '@/composables/useSpotlightCards'
import { useSpotlightPagination } from '@/composables/useSpotlightPagination'
import { useTagTreeStore } from '@/stores/tagTree'
import {
  publicResourceFixture as resourceFixture,
  tagTreeCatalogFixture,
} from './homeSpotlightFixtures'

/**
 * 精选资源区三支 composable（R047 从 `views/HomeView.vue` 拆出）的行为钉桩。
 *
 * 这里不测渲染，只测「搬走之后语义有没有变」的几处：
 * - 候选集：全部已发布资源，普通资源也要展示；
 * - 排序：精选 → 置顶 → 点赞 → 更新时间（比较器本身在 `resourceCardDisplay` 有自己的用例）；
 * - 封面：加载失败过的地址给空串（回落首字），其余过 `apiUrl`；
 * - 分页：每页 8 条、总数缩水时页码收回、跳页输入越界夹取；
 * - `usePublicResources`：去重 + 倒序、阈值非法值忽略、`resolveResourceRoute` 命中与兜底。
 *
 * 带生命周期钩子的 composable（分页要挂 `document` 点击）必须跑在组件实例里，
 * 否则 `onMounted` 会告警，故统一用 `withSetup` 包一层。
 */

function withSetup<T>(composable: () => T): { result: T; unmount: () => void } {
  let result!: T
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable()
        return () => h('div')
      },
    }),
  )
  return { result, unmount: () => wrapper.unmount() }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useSpotlightCards', () => {
  it('普通资源也进候选，同时仍按精选优先排序', () => {
    const resources = ref([
      resourceFixture({ id: 1, like_count: 1, updated_at: '2026-03-01 00:00:00' }),
      resourceFixture({ id: 2, is_pinned: true, updated_at: '2026-02-01 00:00:00' }),
      resourceFixture({ id: 3, like_count: 9, updated_at: '2026-01-01 00:00:00' }),
      resourceFixture({ id: 4, is_featured: true, updated_at: '2026-01-15 00:00:00' }),
    ])
    const { cards } = useSpotlightCards({ resources })

    expect(cards.value.map((card) => card.resourceId)).toEqual([4, 2, 3, 1])
    expect(cards.value.map((card) => card.accent)).toEqual(['nebula', 'sunset', 'forest', 'frost'])
    expect(cards.value[0]!.mark).toBe('精选')
  })

  it('没有精选或置顶时仍展示全部已发布资源', () => {
    const resources = ref([
      resourceFixture({ id: 1, like_count: 1 }),
      resourceFixture({ id: 2, like_count: 2 }),
    ])
    const { cards } = useSpotlightCards({ resources })

    expect(cards.value).toHaveLength(2)
  })

  it('封面失败过就回落首字：coverSrc 给空串，且封面地址进过 apiUrl', () => {
    const resources = ref([resourceFixture({ id: 1, cover_url: '/uploads/cover.png' })])
    const { cards, coverSrc, handleCoverError } = useSpotlightCards({
      resources,
    })

    const card = cards.value[0]!
    expect(card.coverUrl?.endsWith('/uploads/cover.png')).toBe(true)
    expect(coverSrc(card)).toBe(card.coverUrl)

    handleCoverError(card.coverUrl)
    expect(coverSrc(card)).toBe('')
  })
})

describe('useSpotlightPagination', () => {
  it('每页 8 条；总数缩水时页码收回范围内', async () => {
    const items = ref(Array.from({ length: 20 }, (_, index) => index + 1))
    const { result, unmount } = withSetup(() => useSpotlightPagination({ items }))
    const { page, pageCount, pagedItems } = result

    expect(pageCount.value).toBe(3)
    expect(pagedItems.value).toHaveLength(8)

    result.goPage(3)
    await nextTick()
    expect(page.value).toBe(3)
    expect(pagedItems.value).toEqual([17, 18, 19, 20])

    // 定时刷新后只剩 9 条 → 2 页，当前页从 3 收回 2。
    items.value = Array.from({ length: 9 }, (_, index) => index + 1)
    await nextTick()
    expect(pageCount.value).toBe(2)
    expect(page.value).toBe(2)

    unmount()
  })

  it('跳页输入越界夹到 [1, pageCount]，浮层一定关闭', async () => {
    const items = ref(Array.from({ length: 24 }, (_, index) => index + 1))
    const { result, unmount } = withSetup(() => useSpotlightPagination({ items }))

    result.toggleJump('ellipsis-right')
    expect(result.jumpOpen.value).toBe(true)

    result.jumpValue.value = '99'
    result.submitJump()
    expect(result.page.value).toBe(3)
    expect(result.jumpOpen.value).toBe(false)

    result.jumpValue.value = '0'
    result.submitJump()
    expect(result.page.value).toBe(1)

    unmount()
  })

  it('超过 9 页才折叠：两侧各留 1 页并带省略号', () => {
    const items = ref(Array.from({ length: 200 }, (_, index) => index + 1))
    const { result, unmount } = withSetup(() => useSpotlightPagination({ items }))

    result.goPage(12)
    expect(result.paginationItems.value.map((item) => item.key)).toEqual([
      'page-1',
      'ellipsis-left',
      'page-11',
      'page-12',
      'page-13',
      'ellipsis-right',
      'page-25',
    ])

    unmount()
  })
})

describe('usePublicResources', () => {
  it('写入列表时去重并按 updated_at 倒序；null 清空', () => {
    const { publicResources, applyResourceList } = usePublicResources()

    applyResourceList([
      resourceFixture({ id: 1, updated_at: '2026-01-01 00:00:00' }),
      resourceFixture({ id: 2, updated_at: '2026-03-01 00:00:00' }),
      resourceFixture({ id: 1, updated_at: '2026-02-01 00:00:00' }),
    ])

    expect(publicResources.value.map((item) => item.id)).toEqual([2, 1])

    applyResourceList(null)
    expect(publicResources.value).toEqual([])
  })

  it('高赞阈值：非法值保持缺省 5，合法值取整', () => {
    const { highLikeThreshold, applyHighLikeThreshold } = usePublicResources()

    applyHighLikeThreshold(0)
    applyHighLikeThreshold('abc')
    expect(highLikeThreshold.value).toBe(5)

    applyHighLikeThreshold('7.8')
    expect(highLikeThreshold.value).toBe(7)
  })

  it('resolveResourceRoute：按 platform 命中标签树，命中不到用第一组兜底', () => {
    useTagTreeStore().tree = tagTreeCatalogFixture()
    const { resolveResourceRoute } = usePublicResources()

    expect(resolveResourceRoute(resourceFixture({ id: 1, platform: '手绘' }))).toEqual({
      rootSlug: 'game',
      entrySlug: 'draw',
    })
    // 树里没有的平台：回落第一个根的第一组，避免卡片点不动。
    expect(resolveResourceRoute(resourceFixture({ id: 2, platform: '未收录' }))).toEqual({
      rootSlug: 'game',
      entrySlug: 'mc',
    })
  })

  it('resolveResourceRoute：标签树为空时给 null（由视图提示「目录暂未配置」）', () => {
    const { resolveResourceRoute } = usePublicResources()

    expect(resolveResourceRoute(resourceFixture({ id: 1 }))).toBeNull()
  })

  it('applyLikeState 只替换那一条，点赞数跟着走', () => {
    const { publicResources, applyResourceList, applyLikeState } = usePublicResources()
    applyResourceList([resourceFixture({ id: 1 }), resourceFixture({ id: 2 })])

    applyLikeState(1, { liked_by_me: true, like_count: 6 })

    expect(publicResources.value.find((item) => item.id === 1)).toMatchObject({
      liked_by_me: true,
      like_count: 6,
    })
    expect(publicResources.value.find((item) => item.id === 2)).toMatchObject({
      liked_by_me: false,
      like_count: 0,
    })
  })
})
