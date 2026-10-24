import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import RequirementHallView from '@/views/RequirementHallView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求大厅「发布需求」的**开发周期**接线（R047 修 bug 的回归网）。
 *
 * 缺陷：大厅的 `PublishModal` 没绑 `publishDevelopmentCycleDays`，选「电签担保」时输入框照常渲染，
 * 但用户键入的值随 `emit` 无人接而丢弃，载荷里也不带 `development_cycle_days`；
 * 后端 `POST /requirements/` 对 `platform_guarantee` 要求「正数的开发周期」，于是**必然 400**。
 *
 * 这里挂的是真视图 + 真 `PublishModal`（只把富文本编辑器与大厅的展示子组件换成桩），
 * 走「点电签担保 → 输入周期 → 点确认发布」这条真实路径，最后看 `createRequirement` 的实参。
 * 纯组合式函数一层的载荷在 `requirementPublishPayloadParity.spec.ts` 里钉，这里钉模板那一段接线。
 */

const mocks = vi.hoisted(() => ({
  createRequirement: vi.fn(),
  getVerification: vi.fn(),
  spotlights: vi.fn(),
  overview: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
  createRequirement: mocks.createRequirement,
  listPublicRequirementSpotlights: mocks.spotlights,
  getPublicRequirementOverview: mocks.overview,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.getVerification }))
vi.mock('@/utils/seo', () => ({ setSeoMeta: vi.fn(), resetSeoMeta: vi.fn() }))
// 「电签担保」选项只在服务端说可用时渲染；真实现要问一次后端，这里直接给可用。
vi.mock('@/shared/adapayAvailability', () => ({
  platformGuaranteeReady: computed(() => true),
  platformGuaranteeLoaded: computed(() => true),
  loadAdapayAvailability: vi.fn(async () => {}),
}))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})

/** 富文本编辑器的桩：一个 textarea，值一改就按 `v-model` 的口径回推（tiptap 在 jsdom 里带不动）。 */
const RichTextEditorStub = {
  name: 'RichTextEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:model-value', 'notify'],
  template:
    '<textarea class="rich-stub" :value="modelValue" ' +
    '@input="$emit(\'update:model-value\', $event.target.value)" />',
}

const ROUTE_NAMES = ['requirement-hall', 'workbench-realname', 'home', 'workbench']

async function renderHall() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({
      name,
      path: `/${name}`,
      component: { template: '<div />' },
    })),
  })
  // 带 `?modal=publish` 进页面：这条 watch 是 immediate 的，弹窗挂载即开（不跑实名门禁）。
  await router.push({ name: 'requirement-hall', query: { modal: 'publish' } })

  const wrapper = mount(RequirementHallView, {
    global: {
      plugins: [router],
      stubs: {
        // `PublishModal` 内部用 `<Teleport>`：桩掉它，弹窗内容就留在 wrapper 里能直接查。
        teleport: true,
        RichTextEditor: RichTextEditorStub,
        RequirementHallToolbar: true,
        RequirementHallCard: true,
        RequirementHallAside: true,
        RequirementHallDetailDialog: true,
      },
    },
  })
  await flushPromises()

  return { wrapper, router }
}

/** 填标题 / 预算 / 两处富文本（周期与付款模式由各用例自己决定）。 */
async function fillBaseFields(wrapper: Awaited<ReturnType<typeof renderHall>>['wrapper']) {
  await wrapper.find('.publish-modal input[type="text"]').setValue('小程序订单页改版')
  await wrapper.find('.publish-modal input[type="number"]').setValue('3000')

  // 两处编辑器每次都重查一遍：一次输入会让弹窗重渲染，先前 `findAll` 拿到的第二个
  // textarea 已经是旧节点，对着它派发 input 事件不会有监听器接住（值写进了 DOM、表单却没动）。
  await wrapper.findAll('.rich-stub')[0]!.setValue('需要重做订单列表与详情页，支持批量操作。')
  await wrapper.findAll('.rich-stub')[1]!.setValue('订单列表可翻页，详情页字段齐全。')
}

/** 点「电签担保」：`PublishModal` 里它是一个 role=radio 的按钮。 */
async function chooseGuarantee(wrapper: Awaited<ReturnType<typeof renderHall>>['wrapper']) {
  const option = wrapper
    .findAll('.publish-modal .publish-mode-option')
    .find((button) => button.text().includes('电签担保'))
  expect(option).toBeTruthy()
  await option!.trigger('click')
}

function clickSubmit(wrapper: Awaited<ReturnType<typeof renderHall>>['wrapper']) {
  return wrapper.find('.publish-modal__actions .auth-btn.solid').trigger('click')
}

beforeEach(() => {
  vi.clearAllMocks()
  // 弹窗的草稿存在 localStorage：清干净，免得上一条用例的周期被恢复回来。
  window.localStorage.clear()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'token-1'
  auth.username = 'buyer'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  mocks.getVerification.mockResolvedValue({ status: 'approved' })
  mocks.createRequirement.mockResolvedValue(undefined)
  mocks.spotlights.mockResolvedValue({ total: 0, page: 1, page_size: 20, items: [] })
  mocks.overview.mockResolvedValue({ total_orders: 0, positive_rate: 100, recent_deals: [] })
})

describe('需求大厅发布需求：开发周期', () => {
  it('选电签担保 → 填 30 天 → 提交，周期随载荷带出', async () => {
    const { wrapper } = await renderHall()
    await fillBaseFields(wrapper)
    await chooseGuarantee(wrapper)

    // 担保模式下周期输入框才出现：这一步同时也证明模板那一侧接上了 `v-model`。
    const cycleInput = wrapper.find('.publish-cycle-field input')
    expect(cycleInput.exists()).toBe(true)
    await cycleInput.setValue('30')

    await clickSubmit(wrapper)
    await flushPromises()

    expect(mocks.createRequirement).toHaveBeenCalledTimes(1)
    const [token, payload] = mocks.createRequirement.mock.calls[0] as [string, unknown]
    expect(token).toBe('token-1')
    expect(payload).toStrictEqual({
      title: '小程序订单页改版',
      description: '需要重做订单列表与详情页，支持批量操作。',
      budget: 3000,
      acceptance_criteria: '订单列表可翻页，详情页字段齐全。',
      payment_mode: 'platform_guarantee',
      development_cycle_days: 30,
    })

    wrapper.unmount()
  })

  it('选电签担保但周期留空：前端拦下并提示，不发请求', async () => {
    const { wrapper } = await renderHall()
    await fillBaseFields(wrapper)
    await chooseGuarantee(wrapper)

    // 周期输入框在、但不填：校验顺序里周期排在最后，前四项都已通过，所以报的就是这一条。
    expect(wrapper.find('.publish-cycle-field input').element).toHaveProperty('value', '')

    await clickSubmit(wrapper)
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('担保需求必须填写开发周期（天）', 'error')
    expect(mocks.createRequirement).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
