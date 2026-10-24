import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import ProfileView from '@/views/ProfileView.vue'
import { useAuthStore } from '@/stores/auth'

/**
 * 个人中心「发布需求」的**开发周期**接线 —— 与大厅同一个 bug 的另一半。
 *
 * 个人中心的弹窗是 `<PublishModal v-bind="publishModalBindings" />`，那一对
 * `publishDevelopmentCycleDays` 键由 `useRequirementPublishModalBindings` 按
 * `includeDevelopmentCycle` 决定铺不铺。这个用例挂真视图 + 真 `PublishModal`，
 * 走「点电签担保 → 输入周期 → 点确认发布」，既验键名对得上（`v-bind` → props/emit），
 * 也验周期真的进了 `createRequirement` 的实参。
 */

const mocks = vi.hoisted(() => ({
  createRequirement: vi.fn(),
  getVerification: vi.fn(),
  requirements: vi.fn(),
  contractStatus: vi.fn(),
  conversations: vi.fn(),
  coupons: vi.fn(),
  profile: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
  createRequirement: mocks.createRequirement,
  listRequirements: mocks.requirements,
}))
vi.mock('@/api/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/contracts')>()),
  fetchContractSigningStatus: mocks.contractStatus,
}))
vi.mock('@/api/conversations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/conversations')>()),
  listRequirementConversations: mocks.conversations,
}))
vi.mock('@/api/coupons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/coupons')>()),
  listAvailableCoupons: mocks.coupons,
}))
vi.mock('@/api/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/settings')>()),
  getProfile: mocks.profile,
}))
vi.mock('@/api/realname', () => ({ getMyRealnameVerification: mocks.getVerification }))
// 「电签担保」只在服务端说可用时渲染；真实现要问一次后端。
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

const ROUTE_NAMES = [
  'workbench',
  'workbench-requirements',
  'workbench-messages',
  'workbench-account',
  'workbench-signatures',
  'workbench-invoices',
  'workbench-realname',
  'dev-profile',
  'dev-requirement-hall',
  'dev-my-requirements',
  'dev-plugins',
  'dev-wallet',
  'payment',
  'home',
  'requirement-hall',
]

async function renderProfile() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({
      name,
      path: `/${name}`,
      component: { template: '<div />' },
    })),
  })
  // `?modal=publish` 挂载即开窗（`syncModalQuery` 的 immediate watch），不跑实名门禁。
  await router.push({ name: 'workbench', query: { modal: 'publish' } })

  const wrapper = mount(ProfileView, {
    global: {
      plugins: [router],
      stubs: {
        // `PublishModal` 内部用 `<Teleport>`：桩掉它，弹窗内容留在 wrapper 里能直接查。
        teleport: true,
        RichTextEditor: RichTextEditorStub,
        RequirementConversationModal: true,
        RequirementProgressGuide: true,
        RequirementAgentPanel: true,
      },
    },
  })
  await flushPromises()

  return { wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'token-1'
  auth.username = 'buyer'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  mocks.getVerification.mockResolvedValue({ status: 'approved' })
  mocks.createRequirement.mockResolvedValue(undefined)
  mocks.requirements.mockResolvedValue([])
  mocks.contractStatus.mockResolvedValue({
    has_contract: false,
    party_a_signed: false,
    party_b_signed: false,
  })
  mocks.conversations.mockResolvedValue([])
  mocks.coupons.mockResolvedValue([])
  mocks.profile.mockResolvedValue({ avatar_url: '', email: 'buyer@example.com' })
})

describe('个人中心发布需求：开发周期', () => {
  it('选电签担保 → 填 20 天 → 提交，周期随载荷带出', async () => {
    const { wrapper } = await renderProfile()

    await wrapper.find('.publish-modal input[type="text"]').setValue('小程序订单页改版')
    await wrapper.find('.publish-modal input[type="number"]').setValue('3000')
    // 每次重查：一次输入会让弹窗重渲染，旧节点上的 input 事件没有监听器接住。
    await wrapper.findAll('.rich-stub')[0]!.setValue('需要重做订单列表与详情页，支持批量操作。')
    await wrapper.findAll('.rich-stub')[1]!.setValue('订单列表可翻页，详情页字段齐全。')

    const guarantee = wrapper
      .findAll('.publish-modal .publish-mode-option')
      .find((button) => button.text().includes('电签担保'))
    expect(guarantee).toBeTruthy()
    await guarantee!.trigger('click')

    const cycleInput = wrapper.find('.publish-cycle-field input')
    expect(cycleInput.exists()).toBe(true)
    await cycleInput.setValue('20')

    await wrapper.find('.publish-modal__actions .auth-btn.solid').trigger('click')
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
      development_cycle_days: 20,
    })

    wrapper.unmount()
  })
})
