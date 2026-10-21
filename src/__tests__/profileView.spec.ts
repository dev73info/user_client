import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import ProfileView from '@/views/ProfileView.vue'

// 个人中心此前零覆盖：这里只做一条最小挂载烟测，钉住「顶部读数条的数字」与
// 「需求进度列表有条目」这两个最容易被清理动作误伤的出口，不追求覆盖交互细节。
const mocks = vi.hoisted(() => ({
  requirements: vi.fn(),
  contractStatus: vi.fn(),
  conversations: vi.fn(),
  coupons: vi.fn(),
  profile: vi.fn(),
}))

vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
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
]

function requirement(overrides: Record<string, unknown>) {
  return {
    id: 1,
    requirement_id: 'REQ-1',
    bound_resource_id: null,
    bound_resource_version_count: null,
    created_time: '2026-09-01 09:00:00',
    creator: 'alice',
    title: '需求标题',
    budget: 1000,
    payment_mode: 'platform_guarantee',
    status: 'pending_final',
    updated_at: '2026-09-12 10:00:00',
    ...overrides,
  }
}

const signedStatus = {
  has_contract: true,
  party_a_signed: true,
  party_b_signed: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'buyer'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  // 三条需求各命中一种「可操作」口径，用来钉住读数条的「待处理」格：
  // 待付尾款且合同已签（可付）、被驳回（可重新提交）、已完成（可评价）
  mocks.requirements.mockResolvedValue([
    requirement({ id: 1, requirement_id: 'REQ-1', bound_resource_id: 11, status: 'pending_final' }),
    requirement({
      id: 2,
      requirement_id: 'REQ-2',
      title: '被驳回的需求',
      payment_mode: 'self_managed',
      status: 'rejected',
      updated_at: '2026-09-11 10:00:00',
    }),
    requirement({
      id: 3,
      requirement_id: 'REQ-3',
      title: '已完成的需求',
      status: 'completed',
      updated_at: '2026-09-10 10:00:00',
    }),
  ])
  mocks.contractStatus.mockResolvedValue(signedStatus)
  mocks.conversations.mockResolvedValue([])
  mocks.coupons.mockResolvedValue([
    { id: 1, status: 'unused' },
    { id: 2, status: 'used' },
  ])
  mocks.profile.mockResolvedValue({
    avatar_url: '',
    email: 'buyer@example.com',
    subscribe_official_activity: true,
  })
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTE_NAMES.map((name) => ({
      name,
      path: `/${name}`,
      component: { template: '<div />' },
    })),
  })
  await router.push({ name: 'workbench' })
  const wrapper = mount(ProfileView, {
    global: {
      plugins: [router],
      stubs: {
        PublishModal: true,
        RequirementConversationModal: true,
        RequirementProgressGuide: true,
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('个人中心总览', () => {
  it('挂载后按接口数据渲染顶部读数条与需求进度列表', async () => {
    const { wrapper } = await render()
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')

    // 读数条四格：需求 3 / 待处理 3 / 会话 1（唯一绑定了资源的需求）/ 可用券 1
    const cards = wrapper.findAll('.wb-strip__item:not(.wb-strip__action)')
    expect(cards).toHaveLength(4)
    expect(cards.map((card) => card.find('.wb-strip__label').text())).toEqual([
      '需求',
      '待处理',
      '会话',
      '可用券',
    ])
    expect(cards.map((card) => card.find('.wb-strip__value').text())).toEqual(['3', '3', '1', '1'])

    // 需求进度：三条都在，按更新时间倒序，第一行带编号、担保方式与状态文案
    const rows = wrapper.findAll('.overview-requirement-list li')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.text()).toContain('REQ-1')
    expect(rows[0]?.text()).toContain('电签担保')
    expect(rows[0]?.text()).toContain('待付尾款')
    expect(rows[1]?.text()).toContain('被驳回的需求')
    expect(rows[1]?.text()).toContain('无电签约定')
    expect(rows[2]?.text()).toContain('已完成的需求')

    // 资料卡与已订阅状态来自 getProfile
    expect(wrapper.text()).toContain('buyer@example.com')
    expect(wrapper.text()).toContain('官方活动：已订阅')

    // 支付弹窗与尾款确认弹窗的死链已删除：不该再有任何 .pay-modal 节点
    expect(wrapper.find('.pay-modal').exists()).toBe(false)
    wrapper.unmount()
  })

  it('没有需求单时给出空态，读数条的「需求」「待处理」都归零', async () => {
    mocks.requirements.mockResolvedValue([])
    mocks.coupons.mockResolvedValue([])
    const { wrapper } = await render()

    const values = wrapper
      .findAll('.wb-strip__item:not(.wb-strip__action)')
      .map((card) => card.find('.wb-strip__value').text())
    expect(values).toEqual(['0', '0', '0', '0'])
    expect(wrapper.find('.overview-requirement-list').exists()).toBe(false)
    expect(wrapper.find('.overview-empty-state').text()).toContain('暂无需求单')
    wrapper.unmount()
  })
})
