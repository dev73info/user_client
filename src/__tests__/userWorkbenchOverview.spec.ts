import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import UserWorkbenchOverviewView from '@/views/UserWorkbenchOverviewView.vue'

const mocks = vi.hoisted(() => ({
  requirements: vi.fn(),
  contractStatus: vi.fn(),
  conversations: vi.fn(),
  coupons: vi.fn(),
  push: vi.fn(),
  error: vi.fn(),
}))

const auth = reactive({
  token: 'user-token',
  username: 'alice',
  isAuthed: true,
  hydrate: vi.fn(),
})

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/requirements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/requirements')>()),
  listRequirements: mocks.requirements,
}))
vi.mock('@/api/contracts', () => ({ fetchContractSigningStatus: mocks.contractStatus }))
vi.mock('@/api/conversations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/conversations')>()),
  listRequirementConversations: mocks.conversations,
}))
vi.mock('@/api/coupons', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/coupons')>()),
  listAvailableCoupons: mocks.coupons,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  TButton: {
    props: ['loading', 'iconOnly'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\', $event)"><slot /></button>',
  },
  TIcon: { template: '<span><slot /></span>' },
  TMessage: { error: mocks.error },
}))

const requirements = [
  {
    id: 1,
    requirement_id: 'REQ-1',
    title: '订单同步插件定制',
    status: 'pending_deposit',
    payment_mode: 'platform_guarantee',
    budget: 3000,
    created_time: '2026-11-03 09:00:00',
    bound_resource_id: 11,
  },
  {
    id: 2,
    requirement_id: 'REQ-2',
    title: '库存对账工具',
    status: 'completed',
    payment_mode: 'self_managed',
    budget: 1200,
    created_time: '2026-11-02 09:00:00',
    bound_resource_id: null,
  },
  {
    id: 3,
    requirement_id: 'REQ-3',
    title: '数据看板改版',
    status: 'in_development',
    payment_mode: 'self_managed',
    budget: null,
    created_time: '2026-11-01 09:00:00',
    bound_resource_id: null,
  },
] as unknown as import('@/api/requirements').RequirementItem[]

const conversations = [
  {
    id: 1,
    conversation_id: 'conv-1',
    requirement_id: 'REQ-1',
    requirement_title: '订单同步插件定制',
    customer: 'alice',
    developer: 'dev_flow',
    status: 'open',
    requirement_status: 'pending_deposit',
    unread_count: 0,
    last_message_at: '2026-11-03 10:30:00',
    last_message_by: 'dev_flow',
    last_message_content: '合同可以签了',
    created_at: '2026-11-03 09:00:00',
    updated_at: '2026-11-03 10:30:00',
  },
] as unknown as import('@/api/conversations').RequirementConversation[]

function buttonText(wrapper: ReturnType<typeof mount>, text: string) {
  const found = wrapper.findAll('button').find((item) => item.text().includes(text))
  expect(found).toBeDefined()
  return found!
}

async function render() {
  const wrapper = mount(UserWorkbenchOverviewView, {
    global: { stubs: { WorkbenchBarSlot: { template: '<div><slot /></div>' } } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirements.mockResolvedValue(requirements)
  mocks.contractStatus.mockResolvedValue({
    has_contract: true,
    party_a_signed: true,
    party_b_signed: true,
  })
  mocks.conversations.mockResolvedValue(conversations)
  mocks.coupons.mockResolvedValue([{ code: 'COUPON-1' }, { code: 'COUPON-2' }])
})

describe('用户工作台总览', () => {
  it('读数条使用真实需求、会话与优惠券数据', async () => {
    const wrapper = await render()

    expect(wrapper.get('.wb-strip').text()).toContain('我的需求')
    expect(wrapper.get('.wb-strip').text()).toContain('3')
    expect(wrapper.get('.wb-strip').text()).toContain('待处理')
    expect(wrapper.get('.wb-strip').text()).toContain('2')
    expect(wrapper.get('.wb-strip').text()).toContain('会话')
    expect(wrapper.get('.wb-strip').text()).toContain('1')
    expect(wrapper.get('.wb-strip').text()).toContain('可用券')
    expect(wrapper.get('.wb-strip').text()).toContain('2')
  })

  it('待处理与最近需求按真实列表渲染', async () => {
    const wrapper = await render()

    expect(wrapper.findAll('.overview-requirement')).toHaveLength(2)
    expect(wrapper.findAll('.overview-recent__row')).toHaveLength(3)
    expect(wrapper.get('.overview-recent').text()).toContain('订单同步插件定制')
    expect(wrapper.get('.overview-recent').text()).toContain('库存对账工具')
    expect(wrapper.get('.overview-recent').text()).toContain('数据看板改版')
  })

  it('快捷入口进入对应工作台路由', async () => {
    const wrapper = await render()

    await buttonText(wrapper, '消息中心').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'workbench-messages' })

    await buttonText(wrapper, '优惠券中心').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'workbench-coupons' })

    await buttonText(wrapper, '发布需求').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'home',
      query: { modal: 'publish' },
    })
  })

  it('点击欢迎区进入当前用户主页，发布按钮不触发主页跳转', async () => {
    const wrapper = await render()

    await wrapper.get('.overview-welcome').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'dev-profile',
      params: { username: 'alice' },
    })

    mocks.push.mockClear()
    await buttonText(wrapper, '发布需求').trigger('click')
    expect(mocks.push).toHaveBeenLastCalledWith({
      name: 'home',
      query: { modal: 'publish' },
    })
  })
})
