import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useProfilePublishRequirement } from '@/composables/useProfilePublishRequirement'
import type { RequirementItem } from '@/api/requirements'
import type { useMyRequirementsData } from '@/composables/useMyRequirementsData'
import { useRequirementHallPublish } from '@/composables/useRequirementHallPublish'
import { useRequirementPageActions } from '@/composables/useRequirementPageActions'

/**
 * R047：三处「发布需求」入口的**提交载荷**用例（原先叫「逐字节对齐」）。
 *
 * 三处原本各写一份状态机，本轮合并成 `useRequirementPublishForm` 一份工厂 + 两个薄包装。
 * 用 `toStrictEqual` 而不是 `toEqual`：后者放过「多一个 `undefined` 键」，而这里要钉的正是键本身。
 *
 * **口径在 R047 修 bug 时改过一次，改的是错的旧口径**：
 * 旧断言钉的是「需求大厅 / 个人中心的载荷**没有** `development_cycle_days` 键」，
 * 那是把「前端漏接字段」当成契约钉住了 —— 弹窗里选「电签担保」时周期输入框照常渲染，
 * 用户填的值因 `emit` 无人接而丢弃，载荷也不带该字段；后端 `POST /requirements/`
 * （`crates/business/requirement/src/domain/requirement.rs` 的建单校验）对
 * `payment_mode == platform_guarantee` 要求「正数的开发周期」，缺了它必然 400。
 * 现在三处同口径（`includeDevelopmentCycle: true`）：
 * - 担保模式（`platform_guarantee`/电签担保）：载荷**带** `development_cycle_days`，且是填写的正数；
 * - 自管模式（`self_managed`）：不要求周期，归一化成 `undefined` —— 键在、值不带，
 *   `JSON.stringify` 会把键丢掉，后端收到的是「未填」（与后端 `Option<i32>` 的兼容口径一致）。
 */

const mocks = vi.hoisted(() => ({
  createRequirement: vi.fn(),
  getVerification: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
  createRequirement: mocks.createRequirement,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.getVerification }))
vi.mock('@/components/PublishModal.vue', () => ({ default: {} }))

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

const ROUTE_NAMES = [
  'requirement-hall',
  'workbench',
  'workbench-requirements',
  'workbench-realname',
  'workbench-account',
  'contract-sign',
  'payment',
  'home',
  'dev-resource-list',
]

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({
      name,
      path: `/${name}`,
      component: { template: '<div />' },
    })),
  })
}

/** 在真正的组件 setup 里跑组合式函数（`useRoute` / `useRouter` 需要注入上下文）。 */
async function withSetup<T>(factory: () => T) {
  let api!: T
  const router = makeRouter()
  await router.push({ name: 'workbench' })
  const wrapper = mount(
    defineComponent({
      setup() {
        api = factory()
        return () => h('div')
      },
    }),
    { global: { plugins: [router] } },
  )
  return { api, wrapper }
}

/** 载荷里的字段（三个入口共用；描述 ≥10 字、验收标准非空，能过纯校验）。 */
const FORM = {
  title: '  小程序订单页改版  ',
  description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
  budget: ' 3000 ',
  acceptance: '<p>订单列表可翻页，详情页字段齐全。</p>',
}

/** 归一化之后的固定部分：标题去空白、预算转数字。 */
const NORMALIZED = {
  title: '小程序订单页改版',
  description: FORM.description,
  budget: 3000,
  acceptance_criteria: FORM.acceptance,
}

/** 一个入口的驱动方式：填表（模拟 `PublishModal` 的 v-model 回推）+ 点提交。 */
type EntryHarness = {
  fill: (paymentMode: 'platform_guarantee' | 'self_managed', developmentCycleDays: string) => void
  submit: () => Promise<void>
  unmount: () => void
}

/** 需求大厅：模板用 `v-model:publishXxx` 直连这些 ref（不走 `modalBindings`）。 */
async function hallEntry(): Promise<EntryHarness> {
  const { api, wrapper } = await withSetup(() =>
    useRequirementHallPublish({ reloadHall: vi.fn(async () => {}) }),
  )

  await api.openPublishModal()

  return {
    fill: (paymentMode, developmentCycleDays) => {
      api.publishTitle.value = FORM.title
      api.publishDescription.value = FORM.description
      api.publishBudget.value = FORM.budget
      api.publishAcceptance.value = FORM.acceptance
      api.publishPaymentMode.value = paymentMode
      // 这一步就是本 bug 的接线点：工厂不返回它、模板不绑它，周期就进不了载荷。
      api.publishDevelopmentCycleDays.value = developmentCycleDays
    },
    submit: () => api.submitPublishRequirement(),
    unmount: () => wrapper.unmount(),
  }
}

/** 个人中心：`v-bind="publishModalBindings"`，靠 bindings 里的 `onUpdate:*` 回调回推。 */
async function profileEntry(): Promise<EntryHarness> {
  const { api, wrapper } = await withSetup(() =>
    useProfilePublishRequirement({
      reloadRequirements: vi.fn(async () => {}),
      onNeedLogin: vi.fn(),
      onNeedRealname: vi.fn(),
    }),
  )

  await api.ensurePublishRealnameApproved()

  return {
    fill: (paymentMode, developmentCycleDays) => {
      const bindings = api.publishModalBindings.value
      bindings['onUpdate:publishTitle'](FORM.title)
      bindings['onUpdate:publishDescription'](FORM.description)
      bindings['onUpdate:publishBudget'](FORM.budget)
      bindings['onUpdate:publishAcceptance'](FORM.acceptance)
      bindings['onUpdate:publishPaymentMode'](paymentMode)
      // `v-bind="publishModalBindings"` 的接线：不铺这一对键（`includeDevelopmentCycle: false`）时，
      // 这里拿到的是 `undefined` —— 断言它就是函数，等于把「弹窗那侧接得到值」钉死。
      const updateCycle = bindings['onUpdate:publishDevelopmentCycleDays']
      expect(typeof updateCycle).toBe('function')
      updateCycle?.(developmentCycleDays)
    },
    submit: () => api.submitRequirementPublish(),
    unmount: () => wrapper.unmount(),
  }
}

/** 取那次建单调用的载荷（顺带钉住「只发一次」与令牌）。 */
function capturedPayload(): unknown {
  expect(mocks.createRequirement).toHaveBeenCalledTimes(1)
  const [token, payload] = mocks.createRequirement.mock.calls[0] as [string, unknown]
  expect(token).toBe('token-1')
  return payload
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'token-1'
  auth.username = 'buyer'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  mocks.getVerification.mockResolvedValue({ status: 'approved' })
  mocks.createRequirement.mockResolvedValue(undefined)
})

describe('我的需求（工厂直连建单接口）', () => {
  it('自管模式：载荷带 development_cycle_days 键，值为 undefined', async () => {
    const data = {
      reload: vi.fn(async () => {}),
      depositRatioPercent: ref(30),
      myRequirements: ref([]),
      applyConversationDetail: vi.fn(),
      signingStatusForRequirement: vi.fn(),
    } as unknown as ReturnType<typeof useMyRequirementsData>
    const { api, wrapper } = await withSetup(() =>
      useRequirementPageActions({ data, rowFacts: (() => ({})) as never }),
    )

    await api.openPublishModal()
    const bindings = api.publishModal.value
    bindings['onUpdate:publishTitle'](FORM.title)
    bindings['onUpdate:publishDescription'](FORM.description)
    bindings['onUpdate:publishBudget'](FORM.budget)
    bindings['onUpdate:publishAcceptance'](FORM.acceptance)
    await bindings.onSubmit()

    expect(capturedPayload()).toStrictEqual({
      ...NORMALIZED,
      payment_mode: 'self_managed',
      development_cycle_days: undefined,
    })

    // 草稿作用域：发布按用户名隔离，编辑按需求号隔离（`edit-<需求号>`），没选中需求时为空串。
    expect(api.publishModal.value.draftScope).toBe('buyer')
    expect(api.editModal.value.draftScope).toBe('')
    await api.openRequirementEditForm({
      id: 1,
      requirement_id: '2026-900000000501',
      subscribe_status_change: false,
      title: '小程序订单页改版',
      description: FORM.description,
      acceptance_criteria: FORM.acceptance,
      status: 'pending_review',
      budget: 3000,
      payment_mode: 'self_managed',
      development_cycle_days: null,
      updated_at: '2026-10-20 10:00:00',
    } as unknown as RequirementItem)
    expect(api.editModal.value.draftScope).toBe('edit-2026-900000000501')

    wrapper.unmount()
  })
})

/**
 * 大厅与个人中心：同一份断言跑两遍。
 *
 * 这条用例替换掉的是旧断言「载荷没有 `development_cycle_days` 键」——那是在给漏接的字段做担保。
 */
const ENTRIES: Array<[string, () => Promise<EntryHarness>]> = [
  ['需求大厅', hallEntry],
  ['个人中心', profileEntry],
]

for (const [label, mountEntry] of ENTRIES) {
  describe(`${label}（担保模式 / 自管模式）`, () => {
    it('电签担保：载荷带 development_cycle_days，且是填写的正数', async () => {
      const entry = await mountEntry()
      entry.fill('platform_guarantee', '30')
      await entry.submit()

      expect(capturedPayload()).toStrictEqual({
        ...NORMALIZED,
        payment_mode: 'platform_guarantee',
        development_cycle_days: 30,
      })
      entry.unmount()
    })

    it('自管模式：不要求周期，键在、值 undefined（JSON 里被丢掉）', async () => {
      const entry = await mountEntry()
      // 自管模式下周期输入框不展示，表单里也就没有值：载荷按「未填」处理，后端也只对担保校验。
      entry.fill('self_managed', '')
      await entry.submit()

      expect(capturedPayload()).toStrictEqual({
        ...NORMALIZED,
        payment_mode: 'self_managed',
        development_cycle_days: undefined,
      })
      entry.unmount()
    })
  })
}
