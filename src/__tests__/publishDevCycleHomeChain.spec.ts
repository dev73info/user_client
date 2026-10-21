import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import HomeView from '@/views/HomeView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 门户首页「发布需求」的**开发周期**接线 —— 与大厅 / 个人中心同一个 bug 的第三处实例（R047）。
 *
 * 首页的状态机还留在 `HomeView` 里（没迁到 `useRequirementPublishForm` 工厂），工厂早接好的那一项在这里漏了
 * 四处：状态、模板 `v-model`、校验、载荷。后果分两半：发布（`POST`）选「电签担保」被后端 `validate_new`
 * 判 400；「驳回 → 重新提交」（`PATCH`，后端不跑 `validate_new`）则**不报错、周期静默丢掉**（本文件重点）。
 */
const mocks = vi.hoisted(() => ({
  createRequirement: vi.fn(),
  resubmitRequirement: vi.fn(),
  requirements: vi.fn(),
  spotlights: vi.fn(),
  overview: vi.fn(),
  getVerification: vi.fn(),
  depositRatio: vi.fn(),
  coupons: vi.fn(),
  communityPosts: vi.fn(),
  resources: vi.fn(),
  promoMeta: vi.fn(),
  checkinStatus: vi.fn(),
  tagTree: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
  createRequirement: mocks.createRequirement,
  resubmitRequirement: mocks.resubmitRequirement,
  listRequirements: mocks.requirements,
  listPublicRequirementSpotlights: mocks.spotlights,
  getPublicRequirementOverview: mocks.overview,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.getVerification }))
vi.mock('@/api/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/settings')>()),
  getDepositRatio: mocks.depositRatio,
}))
vi.mock('@/api/coupons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/coupons')>()),
  listAvailableCoupons: mocks.coupons,
}))
vi.mock('@/api/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/community')>()),
  listCommunityPosts: mocks.communityPosts,
}))
vi.mock('@/api/resources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resources')>()),
  listAllPublicMcResources: mocks.resources,
}))
vi.mock('@/api/points', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/points')>()),
  getResourcePromoMeta: mocks.promoMeta,
  getCheckinStatus: mocks.checkinStatus,
}))
// 首页会 `void tagTreeStore.ensure()`：这个 promise 不接 rejection，真请求会变成未处理拒绝。
vi.mock('@/api/resourceTags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/resourceTags')>()),
  getProcessedTagTree: mocks.tagTree,
}))
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

/** 富文本编辑器的桩：textarea 一改就按 `v-model` 的口径回推（tiptap 在 jsdom 里带不动）。 */
const RichTextEditorStub = {
  name: 'RichTextEditor',
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:model-value', 'notify'],
  template:
    '<textarea class="rich-stub" :value="modelValue" ' +
    '@input="$emit(\'update:model-value\', $event.target.value)" />',
}

// 只为 `router.resolve` / `RouterLink` 提供名字：路径统一 `/${name}`，与真路由表无关。
const ROUTE_NAMES =
  'home requirement-hall workbench workbench-realname workbench-requirements workbench-badges dev-profile dev-plugins team-profile'.split(
    ' ',
  )

type HomeWrapper = Awaited<ReturnType<typeof renderHome>>['wrapper']

async function renderHome(query: Record<string, string> = { modal: 'publish' }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({
      name,
      path: `/${name}`,
      component: { template: '<div />' },
    })),
  })
  // 带 `?modal=publish` 进页面：`publishVisible` 是 route 的 pure computed，弹窗挂载即开（不跑实名门禁）。
  await router.push({ name: 'home', query })

  const wrapper = mount(HomeView, {
    global: {
      plugins: [router],
      stubs: {
        // `PublishModal` 内部用 `<Teleport>`：桩掉它，弹窗内容留在 wrapper 里能直接查。
        teleport: true,
        RichTextEditor: RichTextEditorStub,
        RequirementAgentPanel: true,
        // 登录 / 微信扫码两个弹窗与本用例无关，桩掉免得它们在挂载时自己起轮询。
        AuthModal: true,
        WechatLoginQrModal: true,
      },
    },
  })
  await flushPromises()

  return { wrapper, router }
}

/** 填标题 / 预算 / 两处富文本（周期与付款模式由各用例自己决定）。 */
async function fillBaseFields(wrapper: HomeWrapper) {
  await wrapper.find('.publish-modal input[type="text"]').setValue('小程序订单页改版')
  await wrapper.find('.publish-modal input[type="number"]').setValue('3000')

  // 每次都重查：一次输入会让弹窗重渲染，先前 `findAll` 拿到的 textarea 已是旧节点，input 事件无人接。
  await wrapper.findAll('.rich-stub')[0]!.setValue('需要重做订单列表与详情页，支持批量操作。')
  await wrapper.findAll('.rich-stub')[1]!.setValue('订单列表可翻页，详情页字段齐全。')
}

/** 点「电签担保」：`PublishModal` 里它是一个 role=radio 的按钮。 */
async function chooseGuarantee(wrapper: HomeWrapper) {
  const option = wrapper
    .findAll('.publish-modal .publish-mode-option')
    .find((button) => button.text().includes('电签担保'))
  expect(option).toBeTruthy()
  await option!.trigger('click')
}

function clickSubmit(wrapper: HomeWrapper) {
  return wrapper.find('.publish-modal__actions .auth-btn.solid').trigger('click')
}

const REJECTED_REQUIREMENT = {
  id: 'req-1',
  title: '小程序订单页改版',
  status: 'rejected' as const,
  statusLabel: '已驳回',
  updatedAtLabel: '3/5 10:00',
  description: '需要重做订单列表与详情页，支持批量操作。',
  acceptanceCriteria: '订单列表可翻页，详情页字段齐全。',
  budget: 3000,
  // 原需求就是电签担保：重新编辑时付款模式从这条回填，周期输入框因此可见。
  paymentMode: 'platform_guarantee' as const,
}

/**
 * 进「重新编辑」态。首页今天**没有 UI 入口**能进这个态：`openSpotlight()` 里「按标题找需求 →
 * `openDepositCard`」那几行只剩资源卡片走得通（`spotlightCards` 只产出 `kind: 'resource'`，
 * 资源分支在 `resourceId != null` 时就 return 了）。用例因此直接调模板背后同一个函数，之后全程走
 * 真实 `PublishModal` 与真实提交逻辑；入口缺失本身已记在任务报告的迁移对照表里，本轮不改视图结构。
 */
function openRejectedForResubmit(wrapper: HomeWrapper) {
  const setupState = (wrapper.vm.$ as unknown as { setupState: Record<string, unknown> }).setupState
  const openDepositCard = setupState.openDepositCard as (item: unknown) => void
  expect(typeof openDepositCard).toBe('function')
  openDepositCard(REJECTED_REQUIREMENT)
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
  mocks.resubmitRequirement.mockResolvedValue(undefined)
  mocks.requirements.mockResolvedValue([])
  mocks.spotlights.mockResolvedValue({ total: 0, page: 1, page_size: 1, items: [] })
  mocks.overview.mockResolvedValue({ total_orders: 0, positive_rate: 100, recent_deals: [] })
  mocks.depositRatio.mockResolvedValue({ deposit_ratio_percent: 20 })
  mocks.coupons.mockResolvedValue([])
  mocks.communityPosts.mockResolvedValue([])
  mocks.resources.mockResolvedValue([])
  mocks.promoMeta.mockResolvedValue({ high_like_threshold: 5 })
  // 签到状态与本用例无关：给 null（卡片回落「已签到」，composable 内部也接受 null）。
  mocks.checkinStatus.mockResolvedValue(null)
  mocks.tagTree.mockResolvedValue({ roots: [] })
})

describe('门户首页发布需求：开发周期', () => {
  it('选电签担保 → 填 30 天 → 发布，周期随载荷带出', async () => {
    const { wrapper } = await renderHome()
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

  it('重新提交（PATCH）同样带周期：驳回需求重填 45 天 → resubmitRequirement 实参含周期', async () => {
    const { wrapper } = await renderHome({})
    openRejectedForResubmit(wrapper)
    await flushPromises()

    // 编辑态：标题 / 预算 / 验收标准从被驳回的需求回填，付款模式回填成担保 → 周期框可见。
    expect(wrapper.find('.publish-modal').exists()).toBe(true)
    expect(wrapper.find('.publish-cycle-field input').exists()).toBe(true)

    await wrapper.find('.publish-cycle-field input').setValue('45')
    await clickSubmit(wrapper)
    await flushPromises()

    // 走的是 PATCH：后端不跑 `validate_new`，周期丢了不会报错 —— 所以这条断言只能靠前端钉住。
    expect(mocks.createRequirement).not.toHaveBeenCalled()
    expect(mocks.resubmitRequirement).toHaveBeenCalledTimes(1)
    const [token, requirementId, payload] = mocks.resubmitRequirement.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(token).toBe('token-1')
    expect(requirementId).toBe('req-1')
    expect(payload).toStrictEqual({
      title: '小程序订单页改版',
      description: '需要重做订单列表与详情页，支持批量操作。',
      budget: 3000,
      acceptance_criteria: '订单列表可翻页，详情页字段齐全。',
      payment_mode: 'platform_guarantee',
      development_cycle_days: 45,
    })

    wrapper.unmount()
  })

  it('选电签担保但周期留空：前端拦下并提示，不发请求', async () => {
    const { wrapper } = await renderHome()
    await fillBaseFields(wrapper)
    await chooseGuarantee(wrapper)

    // 周期输入框在、但不填：校验顺序里周期排在最后，前几步都已通过，所以报的就是这一条。
    expect(wrapper.find('.publish-cycle-field input').element).toHaveProperty('value', '')

    await clickSubmit(wrapper)
    await flushPromises()

    expect(mocks.toast).toHaveBeenCalledWith('担保需求必须填写开发周期（天）', 'error')
    expect(mocks.createRequirement).not.toHaveBeenCalled()
    expect(mocks.resubmitRequirement).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
