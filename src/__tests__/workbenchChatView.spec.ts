import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import WorkbenchChatView from '@/components/workbench/WorkbenchChatView.vue'
import { useAuthStore } from '@/stores/auth'

const mocks = vi.hoisted(() => ({
  conversations: vi.fn(),
  requirements: vi.fn(),
  disclosures: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('@/api/conversations', async (original) => ({
  ...(await original<typeof import('@/api/conversations')>()),
  listRequirementConversations: mocks.conversations,
  listConversationHistoryDisclosures: mocks.disclosures,
  subscribeRequirementConversationEvents: mocks.subscribe,
}))

vi.mock('@/api/requirements', async (original) => ({
  ...(await original<typeof import('@/api/requirements')>()),
  listRequirements: mocks.requirements,
}))

vi.mock('@/components/RequirementConversationModal.vue', () => ({
  default: {
    name: 'RequirementConversationModal',
    props: {
      displayMode: { type: String, default: '' },
      visible: { type: Boolean, default: false },
      token: { type: String, default: '' },
      apiMode: { type: String, default: '' },
      currentUsername: { type: String, default: '' },
      requirementId: { type: String, default: '' },
      title: { type: String, default: '' },
    },
    emits: ['updated', 'close'],
    template: '<div class="stub-workbench-chat-pane" />',
  },
}))

const conversations = [
  {
    id: 1,
    conversation_id: 'conv-1',
    requirement_id: 'REQ-1',
    requirement_title: '数据清洗插件定制',
    customer: 'alice',
    developer: 'dev_flow',
    status: 'open',
    requirement_status: 'in_development',
    unread_count: 2,
    last_message_at: '2026-10-20 10:30:00',
    last_message_by: 'dev_flow',
    last_message_content: '好的，我看一下',
    created_at: '2026-10-18 10:00:00',
    updated_at: '2026-10-20 10:30:00',
  },
] as unknown as import('@/api/conversations').RequirementConversation[]

const requirements = [
  {
    id: 1,
    requirement_id: 'REQ-1',
    subscribe_status_change: false,
    bound_resource_id: 11,
    title: '数据清洗插件定制',
    status: 'in_development',
    payment_mode: 'platform_guarantee',
    updated_at: '2026-10-20 09:00:00',
  },
  {
    id: 2,
    requirement_id: 'REQ-2',
    subscribe_status_change: false,
    bound_resource_id: 12,
    title: '爬虫小工具',
    status: 'pending_review',
    payment_mode: 'self_managed',
    updated_at: '2026-10-19 09:00:00',
  },
] as unknown as import('@/api/requirements').RequirementItem[]

const routes = [
  { name: 'workbench', path: '/workbench', component: { template: '<div />' } },
  {
    name: 'workbench-requirements',
    path: '/workbench/requirements',
    component: { template: '<div />' },
  },
  {
    name: 'dev-messages',
    path: '/workbench/developer/messages',
    component: { template: '<div />' },
    meta: { devArea: true, workbenchChat: true },
  },
  {
    name: 'dev-requirement-hall',
    path: '/workbench/developer/requirements/hall',
    component: { template: '<div />' },
    meta: { devArea: true },
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.token = 'test-token'
  auth.username = 'alice'
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})

  mocks.conversations.mockResolvedValue(conversations)
  mocks.requirements.mockResolvedValue(requirements)
  mocks.disclosures.mockResolvedValue([])
  mocks.subscribe.mockReturnValue(() => {})
})

async function render(name = 'workbench') {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push({ name })
  const wrapper = mount(WorkbenchChatView, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { router, wrapper }
}

describe('工作台聊天首页', () => {
  it('默认展示第一条真实会话，列表同时保留未开启会话', async () => {
    const { wrapper } = await render()

    expect(wrapper.findAll('.workbench-inbox__row')).toHaveLength(2)
    expect(wrapper.find('.workbench-inbox__row.is-active').text()).toContain('数据清洗插件定制')
    expect(wrapper.text()).toContain('开发者：dev_flow')
    expect(wrapper.text()).toContain('爬虫小工具')

    const modal = wrapper.findComponent({ name: 'RequirementConversationModal' })
    expect(modal.props()).toMatchObject({
      displayMode: 'inline',
      visible: true,
      apiMode: 'user',
      requirementId: 'REQ-1',
      title: '数据清洗插件定制',
      token: 'test-token',
      currentUsername: 'alice',
    })
    wrapper.unmount()
  })

  it('搜索过滤会话，点击另一条后写入真实会话路由', async () => {
    const { router, wrapper } = await render()

    await wrapper.find('.workbench-inbox__search input').setValue('爬虫')
    await flushPromises()
    const rows = wrapper.findAll('.workbench-inbox__row')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text()).toContain('爬虫小工具')

    await rows[0]!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.requirement_id).toBe('REQ-2')
    expect(
      wrapper.findComponent({ name: 'RequirementConversationModal' }).props('requirementId'),
    ).toBe('REQ-2')
    wrapper.unmount()
  })

  it('新建会话进入我的需求；没有会话时右侧显示空态', async () => {
    mocks.conversations.mockResolvedValue([])
    mocks.requirements.mockResolvedValue([])
    const { router, wrapper } = await render()

    expect(wrapper.find('.workbench-chat__empty').text()).toContain('选择一个会话')
    await wrapper.find('.workbench-inbox__compose').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('workbench-requirements')
    wrapper.unmount()
  })

  it('开发者消息中心复用聊天布局，并走开发者会话模式', async () => {
    const { router, wrapper } = await render('dev-messages')

    expect(wrapper.findComponent({ name: 'RequirementConversationModal' }).props('apiMode')).toBe(
      'dev',
    )
    await wrapper.find('.workbench-inbox__compose').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('dev-requirement-hall')
    wrapper.unmount()
  })
})
