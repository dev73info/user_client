import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, type Ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { useDevRequirementFilters } from '@/composables/useDevRequirementFilters'
import type { DevMyOrderRow } from '@/shared/devDelivery'

/**
 * 筛选域 composable 的单测（R047 抽卡片时一并把筛选搬出来，这里补上原先没有的覆盖）。
 *
 * 页面级的四件事在 `devMyRequirementsView.spec.ts` 里钉着，但那四条只走了关键词筛选；
 * 状态档位（含「待签合同」这个中间态）、翻页回到第 1 页与「路由需求号灌词 / 回收」
 * 都没人看着——这一段搬进 composable 之后单独钉一遍，搬坏了当场就红。
 *
 * 用例用一个小宿主组件拿住 composable 的返回值：composable 依赖 `reactive` / `watch` / `computed`，
 * 脱离组件实例跑不出更新。
 */
/** 组件实例上的 `ref` 会被代理自动解包：类型上跟着解一层，运行时的读数才对得上。 */
type Unwrapped<T> = { [K in keyof T]: T[K] extends Ref<infer V> ? V : T[K] }
type Harness = Unwrapped<ReturnType<typeof useDevRequirementFilters>>

const Host = defineComponent({
  props: {
    rows: { type: Array as () => DevMyOrderRow[], required: true },
    requirementIdQuery: { type: String, default: '' },
  },
  setup(props, { expose }) {
    const filters = useDevRequirementFilters({
      rows: () => props.rows,
      statusKeyOf: (row) => (row.item ? row.item.status : 'unlinked'),
      requirementIdQuery: () => props.requirementIdQuery,
    })
    expose(filters)
  },
  template: '<div />',
})

function row(requirementId: string, status: 'in_development' | 'completed', title: string) {
  return {
    key: `requirement:${requirementId}`,
    requirementId,
    delivery: null,
    receipts: [],
    title: null,
    customer: null,
    item: {
      id: 1,
      requirement_id: requirementId,
      created_time: '2026-09-01 09:00:00',
      creator: 'alice',
      title,
      payment_mode: 'platform_guarantee',
      status,
      updated_at: '2026-09-12 10:00:00',
    },
  } as DevMyOrderRow
}

function makeRows() {
  return [
    row('REQ-1', 'in_development', '数据清洗插件定制'),
    row('REQ-2', 'completed', '爬虫小工具'),
    // 补充行：需求已解绑，档位是 unlinked
    {
      key: 'requirement:REQ-9',
      requirementId: 'REQ-9',
      delivery: null,
      receipts: [{ paymentId: 'pay_9', amount: 100, paidAt: '2026-09-12 12:00:00' }],
      title: '一笔无主到账',
      customer: 'bob',
      item: null,
    } as DevMyOrderRow,
  ]
}

async function mountHarness(props: Record<string, unknown> = {}) {
  const wrapper = mount(Host, { props: { rows: makeRows(), ...props } })
  await flushPromises()
  return { wrapper, state: wrapper.vm as unknown as Harness }
}

describe('useDevRequirementFilters', () => {
  it('状态档位筛到对应的一行，补充行占 unlinked 一档', async () => {
    const { wrapper, state } = await mountHarness()
    expect(state.filteredRows).toHaveLength(3)

    state.filters.status = 'completed'
    await flushPromises()
    expect(state.filteredRows.map((item) => item.requirementId)).toEqual(['REQ-2'])

    state.filters.status = 'unlinked'
    await flushPromises()
    expect(state.filteredRows.map((item) => item.requirementId)).toEqual(['REQ-9'])

    // 档位字符串对不上任何一行时筛空，而不是退回全量
    state.filters.status = 'contract_pending'
    await flushPromises()
    expect(state.filteredRows).toHaveLength(0)
    expect(state.hasActiveFilters).toBe(true)
    wrapper.unmount()
  })

  it('关键词覆盖需求编号、标题、资源与流水号', async () => {
    const { wrapper, state } = await mountHarness()

    state.filters.keyword = '爬虫'
    await flushPromises()
    expect(state.filteredRows.map((item) => item.requirementId)).toEqual(['REQ-2'])

    // 开发者手里往往只有流水号：也要搜得到那一笔到账
    state.filters.keyword = 'pay_9'
    await flushPromises()
    expect(state.filteredRows.map((item) => item.requirementId)).toEqual(['REQ-9'])

    state.filters.keyword = '   '
    await flushPromises()
    expect(state.filteredRows).toHaveLength(3)
    expect(state.hasActiveFilters).toBe(false)
    wrapper.unmount()
  })

  it('翻到第 2 页后改筛选回到第 1 页', async () => {
    const { wrapper, state } = await mountHarness({ rows: [...makeRows(), ...makeRows()] })
    state.pageSize = 1
    await flushPromises()
    state.page = 2
    await flushPromises()
    expect(state.page).toBe(2)

    state.filters.status = 'completed'
    await flushPromises()
    expect(state.page).toBe(1)
    wrapper.unmount()
  })

  it('路由带来的需求号灌进搜索框；参数撤掉时回收它，用户自己敲的词不动', async () => {
    const { wrapper, state } = await mountHarness({ requirementIdQuery: 'REQ-2' })
    expect(state.filters.keyword).toBe('REQ-2')
    expect(state.filteredRows.map((item) => item.requirementId)).toEqual(['REQ-2'])

    // 参数被去掉（点侧边栏回这一页）：只回收灌进来的编号，回到全量
    await wrapper.setProps({ requirementIdQuery: '' })
    await flushPromises()
    expect(state.filters.keyword).toBe('')
    expect(state.filteredRows).toHaveLength(3)

    // 用户自己敲的词不因为「参数没了」被清掉
    state.filters.keyword = '爬虫'
    await flushPromises()
    await wrapper.setProps({ requirementIdQuery: '' })
    await flushPromises()
    expect(state.filters.keyword).toBe('爬虫')
    wrapper.unmount()
  })
})
