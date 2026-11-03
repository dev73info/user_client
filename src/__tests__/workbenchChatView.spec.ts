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
  preferences: vi.fn(),
  updatePreference: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('@/api/conversations', async (original) => ({
  ...(await original<typeof import('@/api/conversations')>()),
  listRequirementConversations: mocks.conversations,
  listConversationHistoryDisclosures: mocks.disclosures,
  listThreadPreferences: mocks.preferences,
  updateThreadPreference: mocks.updatePreference,
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
  mocks.preferences.mockResolvedValue([])
  mocks.updatePreference.mockResolvedValue(undefined)
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
    // 列表只留标题 / 预览；开发者与需求状态都从行内移除
    expect(wrapper.find('.workbench-inbox__meta').exists()).toBe(false)
    expect(wrapper.find('.workbench-inbox__tag').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('开发者：dev_flow')
    expect(wrapper.get('.workbench-inbox__row').text()).not.toContain('开发中')
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

  it('桌面会话列表提供可拖拽、可键盘调整的分隔条', async () => {
    const { wrapper } = await render()
    const chat = wrapper.find('.workbench-chat')
    vi.spyOn(chat.element, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 700,
      width: 1000,
      height: 700,
      toJSON: () => ({}),
    })

    const resizer = wrapper.find('.workbench-pane-resizer')
    expect(resizer.attributes('role')).toBe('separator')
    expect(resizer.attributes('aria-valuemin')).toBe('280')
    expect(resizer.attributes('aria-valuemax')).toBe('520')

    await resizer.trigger('keydown', { key: 'ArrowRight' })
    expect(chat.attributes('style')).toContain('--uw-pane-width: 376px')
    wrapper.unmount()
  })

  it('会话列表不再提供「发起会话」入口；没有会话时右侧显示空态', async () => {
    mocks.conversations.mockResolvedValue([])
    mocks.requirements.mockResolvedValue([])
    const { wrapper } = await render()

    expect(wrapper.find('.workbench-chat__empty').text()).toContain('选择一个会话')
    expect(wrapper.find('.workbench-inbox__compose').exists()).toBe(false)
    expect(wrapper.find('.workbench-inbox__header').text()).not.toContain('新建会话')
    wrapper.unmount()
  })

  it('开发者消息中心复用聊天布局，并走开发者会话模式', async () => {
    const { wrapper } = await render('dev-messages')

    expect(wrapper.findComponent({ name: 'RequirementConversationModal' }).props('apiMode')).toBe(
      'dev',
    )
    wrapper.unmount()
  })

  it('需求接口返回空壳数组时仍保留会话，不因空项中断页面', async () => {
    mocks.requirements.mockResolvedValue([
      null,
    ] as unknown as import('@/api/requirements').RequirementItem[])
    const { wrapper } = await render()

    expect(wrapper.find('.workbench-chat').exists()).toBe(true)
    expect(wrapper.findAll('.workbench-inbox__row')).toHaveLength(1)
    wrapper.unmount()
  })

  it('右键会话弹出菜单，置顶后行标记为 is-pinned 且不再显示文字标签', async () => {
    const { wrapper } = await render()
    const row = wrapper.findAll('.workbench-inbox__row')[0]!
    await row.trigger('contextmenu', { clientX: 120, clientY: 200 })

    const menu = document.body.querySelector('.workbench-inbox__menu')
    expect(menu).toBeTruthy()
    expect(menu!.textContent).toContain('置顶')
    ;(menu!.querySelector('button') as HTMLButtonElement).click()
    await flushPromises()

    expect(mocks.updatePreference).toHaveBeenCalledWith('test-token', 'REQ-1', { pinned: true })
    const firstRow = wrapper.findAll('.workbench-inbox__row')[0]!
    expect(firstRow.classes()).toContain('is-pinned')
    // 置顶不再有可见的文字标签：只靠排序与右键菜单里的「取消置顶」表达
    expect(wrapper.find('.workbench-inbox__pin').exists()).toBe(false)
    expect(document.body.querySelector('.workbench-inbox__menu')).toBeNull()
    wrapper.unmount()
  })

  it('右键会话可删除，行立即从列表移除', async () => {
    const { wrapper } = await render()
    expect(wrapper.findAll('.workbench-inbox__row')).toHaveLength(2)

    const row = wrapper.findAll('.workbench-inbox__row')[0]!
    await row.trigger('contextmenu', { clientX: 120, clientY: 200 })
    const buttons = document.body.querySelectorAll('.workbench-inbox__menu button')
    ;(buttons[1] as HTMLButtonElement).click()
    await flushPromises()

    expect(mocks.updatePreference).toHaveBeenCalledWith('test-token', 'REQ-1', { hidden: true })
    expect(wrapper.findAll('.workbench-inbox__row')).toHaveLength(1)
    wrapper.unmount()
  })

  it('长按会话弹出菜单', async () => {
    const { wrapper } = await render()
    vi.useFakeTimers()
    const row = wrapper.findAll('.workbench-inbox__row')[0]!
    const event = new MouseEvent('pointerdown', {
      bubbles: true,
      clientX: 100,
      clientY: 300,
    })
    Object.defineProperty(event, 'pointerType', { value: 'touch' })
    row.element.dispatchEvent(event)
    vi.advanceTimersByTime(500)
    await flushPromises()

    expect(document.body.querySelector('.workbench-inbox__menu')).toBeTruthy()
    wrapper.unmount()
    vi.useRealTimers()
  })
})
