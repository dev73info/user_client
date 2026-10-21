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
 * R047：三处「发布需求」入口的**提交载荷逐字节对齐**用例。
 *
 * 三处原本各写一份状态机，本轮合并成 `useRequirementPublishForm` 一份工厂 + 两个薄包装。
 * 重构最怕的就是「顺手统一」把载荷改了，所以在改之前先钉住三个调用点真正发给
 * `createRequirement` 的对象：用 `toStrictEqual` 深比较（`toEqual` 会放过
 * 「多一个 `undefined` 键」，看不出差别的正是这一处）。
 *
 * 三处的现状差异（**本轮不改，只钉住**）：
 * - 我的需求：载荷带 `development_cycle_days`（无担保时为 `undefined`，键仍在）；
 * - 需求大厅 / 个人中心：载荷**没有**这个键 —— 它们的表单里本来就没有开发周期字段。
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

/** 三个入口共用的表单内容（描述 ≥10 字、验收标准非空，能过纯校验）。 */
const FORM = {
  title: '  小程序订单页改版  ',
  description: '<p>需要重做订单列表与详情页，支持批量操作。</p>',
  budget: ' 3000 ',
  acceptance: '<p>订单列表可翻页，详情页字段齐全。</p>',
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

/**
 * 「我的需求」动作域的数据源：`useRequirementPageActions` 在 setup 阶段只读这 5 个成员
 * （`reload` / `depositRatioPercent` / `myRequirements` / `applyConversationDetail` /
 * `signingStatusForRequirement`）。这里只造这 5 个，再按整份 `data` 的形状断言——
 * 为了调一个发布入口把整套列表状态搬进单测没有意义，那部分由视图自己的用例覆盖。
 */
function makeMyRequirementsData() {
  return {
    reload: vi.fn(async () => {}),
    depositRatioPercent: ref(30),
    myRequirements: ref([]),
    applyConversationDetail: vi.fn(),
    signingStatusForRequirement: vi.fn(),
  } as unknown as ReturnType<typeof useMyRequirementsData>
}

/** 编辑实例回填用的那条需求（只取回填要读的字段）。 */
function requirement() {
  return {
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
  } as unknown as RequirementItem
}

describe('三处发布入口的提交载荷', () => {
  it('我的需求（工厂直连建单接口）：载荷带 development_cycle_days 键', async () => {
    const data = makeMyRequirementsData()
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

    expect(mocks.createRequirement).toHaveBeenCalledTimes(1)
    const [token, payload] = mocks.createRequirement.mock.calls[0] as [string, unknown]
    expect(token).toBe('token-1')
    expect(payload).toStrictEqual({
      title: '小程序订单页改版',
      description: FORM.description,
      budget: 3000,
      acceptance_criteria: FORM.acceptance,
      payment_mode: 'self_managed',
      development_cycle_days: undefined,
    })

    // 草稿作用域：发布按用户名隔离，编辑按需求号隔离（`edit-<需求号>`），没选中需求时为空串。
    expect(api.publishModal.value.draftScope).toBe('buyer')
    expect(api.editModal.value.draftScope).toBe('')
    await api.openRequirementEditForm(requirement())
    expect(api.editModal.value.draftScope).toBe('edit-2026-900000000501')

    wrapper.unmount()
  })

  it('需求大厅：载荷没有 development_cycle_days 键', async () => {
    const { api, wrapper } = await withSetup(() =>
      useRequirementHallPublish({ reloadHall: vi.fn(async () => {}) }),
    )

    await api.openPublishModal()
    api.publishTitle.value = FORM.title
    api.publishDescription.value = FORM.description
    api.publishBudget.value = FORM.budget
    api.publishAcceptance.value = FORM.acceptance
    await api.submitPublishRequirement()

    expect(mocks.createRequirement).toHaveBeenCalledTimes(1)
    const [token, payload] = mocks.createRequirement.mock.calls[0] as [string, unknown]
    expect(token).toBe('token-1')
    expect(payload).toStrictEqual({
      title: '小程序订单页改版',
      description: FORM.description,
      budget: 3000,
      acceptance_criteria: FORM.acceptance,
      payment_mode: 'self_managed',
    })

    wrapper.unmount()
  })

  it('个人中心：载荷没有 development_cycle_days 键', async () => {
    const { api, wrapper } = await withSetup(() =>
      useProfilePublishRequirement({
        reloadRequirements: vi.fn(async () => {}),
        onNeedLogin: vi.fn(),
        onNeedRealname: vi.fn(),
      }),
    )

    await api.ensurePublishRealnameApproved()
    const bindings = api.publishModalBindings.value
    bindings['onUpdate:publishTitle'](FORM.title)
    bindings['onUpdate:publishDescription'](FORM.description)
    bindings['onUpdate:publishBudget'](FORM.budget)
    bindings['onUpdate:publishAcceptance'](FORM.acceptance)
    await api.submitRequirementPublish()

    expect(mocks.createRequirement).toHaveBeenCalledTimes(1)
    const [token, payload] = mocks.createRequirement.mock.calls[0] as [string, unknown]
    expect(token).toBe('token-1')
    expect(payload).toStrictEqual({
      title: '小程序订单页改版',
      description: FORM.description,
      budget: 3000,
      acceptance_criteria: FORM.acceptance,
      payment_mode: 'self_managed',
    })

    // 草稿作用域与大厅同一口径（按用户名隔离），且与铺给 `PublishModal` 的那份一致。
    expect(api.draftScope.value).toBe('buyer')
    expect(api.publishModalBindings.value.draftScope).toBe('buyer')

    wrapper.unmount()
  })
})
