import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import MessagesView from '@/views/MessagesView.vue'

/**
 * 消息中心最小挂载烟测（这页原先零覆盖）。拆 1121 行的 `MessagesView` 之前先补一层网，
 * 只钉四件事：
 *
 * 1. 会话列表按行渲染——已开启会话与「会话待开启」两条来源都上线；
 * 2. 点行之后 `activeRequirementId` 生效、内嵌会话区出现，且传给会话弹窗的 props 是对的；
 * 3. 路由 query（`?requirement_id=`）联动：直接带 query 进页面就能打开对应会话；
 * 4. 开发者工作台那一支（`meta.devArea`）走的是另一套骨架，弹窗按 `api-mode="dev"` 挂。
 *
 * 会话弹窗组件（`RequirementConversationModal`）由另一条分支在改，这里用 stub 顶掉：
 * 本页只负责把 requirement-id / title / api-mode 传对，弹窗内部行为不在本用例范围。
 */
const mocks = vi.hoisted(() => ({
  conversations: vi.fn(),
  requirements: vi.fn(),
  disclosures: vi.fn(),
  respond: vi.fn(),
  subscribe: vi.fn(),
}))
vi.mock('@/api/conversations', async (orig) => ({
  ...(await orig<typeof import('@/api/conversations')>()),
  listRequirementConversations: mocks.conversations,
  listConversationHistoryDisclosures: mocks.disclosures,
  respondConversationHistoryDisclosure: mocks.respond,
  subscribeRequirementConversationEvents: mocks.subscribe,
}))
vi.mock('@/api/requirements', async (orig) => ({
  ...(await orig<typeof import('@/api/requirements')>()),
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
    template: '<div class="stub-conversation" />',
  },
}))
vi.mock('ui_73info', async (orig) => {
  const actual = await orig<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

/**
 * 四张需求单只出两行：
 * - REQ-1 已有会话（进行中、电签担保）；
 * - REQ-2 已接取但本地还没有会话记录（待开启）；
 * - REQ-3 没绑资源、REQ-4 已结单——两条都不该进「待开启」（先绑资源、且没结单才算待办）。
 */
const baseRequirements = [
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
  {
    id: 3,
    requirement_id: 'REQ-3',
    subscribe_status_change: false,
    bound_resource_id: null,
    title: '还没绑资源的单子',
    status: 'pending_review',
    payment_mode: 'self_managed',
    updated_at: '2026-10-18 09:00:00',
  },
  {
    id: 4,
    requirement_id: 'REQ-4',
    subscribe_status_change: false,
    bound_resource_id: 14,
    title: '已经结单的单子',
    status: 'completed',
    payment_mode: 'platform_guarantee',
    updated_at: '2026-10-17 09:00:00',
  },
] as unknown as import('@/api/requirements').RequirementItem[]

const baseConversations = [
  {
    id: 1,
    conversation_id: 'conv-1',
    requirement_id: 'REQ-1',
    requirement_title: '数据清洗插件定制',
    customer: 'alice',
    developer: 'dev_flow',
    status: 'open',
    requirement_status: 'in_development',
    unread_count: 3,
    last_message_at: '2026-10-20 10:30:00',
    last_message_by: 'dev_flow',
    last_message_content: '好的，我看一下',
    created_at: '2026-10-18 10:00:00',
    updated_at: '2026-10-20 10:30:00',
  },
] as unknown as import('@/api/conversations').RequirementConversation[]

const ROUTES = [
  { name: 'messages', path: '/messages' },
  { name: 'workbench-messages', path: '/workbench/messages' },
  { name: 'dev-messages', path: '/developer/messages', devArea: true },
]

beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  // 不用真 token：hydrate 会从 localStorage 读回空串，把这里设的身份冲掉
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  auth.token = 'test-token'
  auth.username = 'alice'

  mocks.conversations.mockResolvedValue(baseConversations)
  mocks.requirements.mockResolvedValue(baseRequirements)
  mocks.disclosures.mockResolvedValue([])
  mocks.subscribe.mockReturnValue(() => {})
})

async function render(
  entry: { name: string; query?: Record<string, string> } = { name: 'messages' },
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTES.map((route) => ({
      name: route.name,
      path: route.path,
      meta: route.devArea ? { devArea: true } : {},
      component: { template: '<div />' },
    })),
  })
  await router.push({ name: entry.name, query: entry.query ?? {} })
  const wrapper = mount(MessagesView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = VueWrapper

/** 内嵌会话区：本用例用 stub 组件顶掉真弹窗，只核对本页传进去的 props。 */
const conversationModal = (wrapper: Wrapper) =>
  wrapper.findComponent({ name: 'RequirementConversationModal' })

const portalRows = (wrapper: Wrapper) => wrapper.findAll('.messages-thread-row')
const devRows = (wrapper: Wrapper) => wrapper.findAll('.dev-messages__thread')

describe('消息中心：最小挂载烟测', () => {
  it('门户模式：接口按 token 取，会话行与待开启行都渲染', async () => {
    const { wrapper } = await render()

    expect(mocks.conversations).toHaveBeenCalledWith('test-token')
    expect(mocks.requirements).toHaveBeenCalledWith('test-token')

    // 顶部读数条：门户侧用 .wb-strip，三格读数在左、刷新键在 __action 槽
    const strip = wrapper.find('.wb-strip')
    expect(strip.exists()).toBe(true)
    const cells = strip.findAll('.wb-strip__item:not(.wb-strip__action)')
    expect(cells).toHaveLength(3)
    // 三条读数：已开启会话 1、待同步会话 1（REQ-3 没绑资源、REQ-4 已结单，都不算待办）、近 7 天更新 1
    expect(cells.map((cell) => cell.text())).toEqual(['已开启会话1', '待同步会话1', '近 7 天更新1'])

    // 两行：一条来自会话列表，一条来自「已接取但本地没有会话记录」的需求
    const rows = portalRows(wrapper)
    expect(rows).toHaveLength(2)

    const first = rows[0]!
    expect(first.text()).toContain('数据清洗插件定制')
    // 编号 + 支付模式同处一行；状态胶囊取需求状态文案（`deposit_paid` 一码两义不走这里）
    expect(first.text()).toContain('REQ-1 · 电签担保')
    expect(first.find('.wb-item__side').text()).toContain('开发中')
    // 未读小标：客户视角看开发者，对方发的算「对方」
    expect(first.find('.messages-thread-row__unread').text()).toBe('3')
    expect(first.text()).toContain('开发者：dev_flow')
    expect(first.text()).toContain('好的，我看一下')

    // REQ-3 / REQ-4 不进列表：前者没绑资源，后者已结单
    expect(wrapper.text()).not.toContain('还没绑资源的单子')
    expect(wrapper.text()).not.toContain('已经结单的单子')

    const second = rows[1]!
    expect(second.text()).toContain('爬虫小工具')
    expect(second.text()).toContain('待审核')
    expect(second.text()).toContain('会话待开启')
    expect(second.find('.messages-thread-row__unread').exists()).toBe(false)

    // 实时订阅在挂载后接上（离开时由 onBeforeUnmount 断开）
    expect(mocks.subscribe).toHaveBeenCalledWith('test-token', expect.anything())
    wrapper.unmount()
  })

  it('点会话行：写路由 query，内嵌会话区出现且 props 传对', async () => {
    const { wrapper, router } = await render()
    expect(wrapper.find('.stub-conversation').exists()).toBe(false)

    await portalRows(wrapper)[0]!.trigger('click')
    await flushPromises()

    // 打开会话走的是路由 query（三个入口共用同一份链接语义），不是页内纯状态
    expect(router.currentRoute.value.query.requirement_id).toBe('REQ-1')

    const modal = conversationModal(wrapper)
    expect(modal.exists()).toBe(true)
    const props = modal.props() as Record<string, unknown>
    expect(props.requirementId).toBe('REQ-1')
    expect(props.title).toBe('数据清洗插件定制')
    expect(props.apiMode).toBe('user')
    expect(props.displayMode).toBe('inline')
    expect(props.visible).toBe(true)
    expect(props.token).toBe('test-token')
    expect(props.currentUsername).toBe('alice')

    // 打开会话后列表与读数条整体让位，只留会话区（换入口不跳回用户工作台）
    expect(portalRows(wrapper)).toHaveLength(0)
    expect(wrapper.find('.wb-strip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('路由 query 联动：带 ?requirement_id= 进来直接打开对应会话', async () => {
    const { wrapper } = await render({ name: 'messages', query: { requirement_id: 'REQ-2' } })

    const modal = conversationModal(wrapper)
    expect(modal.exists()).toBe(true)
    const props = modal.props() as Record<string, unknown>
    expect(props.requirementId).toBe('REQ-2')
    expect(props.title).toBe('爬虫小工具')
    wrapper.unmount()
  })

  it('开发者工作台模式：另一套骨架 + api-mode="dev"', async () => {
    const { wrapper } = await render({ name: 'dev-messages' })

    // 开发者侧读数条与列表行类名各是一套（.dev-meta-strip / .dev-messages__thread）
    expect(wrapper.find('.dev-meta-strip').exists()).toBe(true)
    expect(wrapper.find('.wb-strip').exists()).toBe(false)

    const rows = devRows(wrapper)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('.dev-chip').text()).toBe('开发中')
    expect(rows[1]!.find('.dev-chip').text()).toBe('待审核')
    expect(rows[0]!.text()).toContain('查看沟通')
    expect(rows[1]!.text()).toContain('开启会话')

    await rows[0]!.trigger('click')
    await flushPromises()
    const props = conversationModal(wrapper).props() as Record<string, unknown>
    expect(props.requirementId).toBe('REQ-1')
    expect(props.apiMode).toBe('dev')
    wrapper.unmount()
  })
})
