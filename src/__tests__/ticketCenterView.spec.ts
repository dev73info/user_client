import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import TicketCenterView from '@/views/TicketCenterView.vue'

/**
 * 工单中心最小挂载烟测（这页原先零覆盖）。拆 1114 行的 `TicketCenterView` 之前先补一层网，
 * 只钉四件事：
 *
 * 1. 列表按行渲染、读数条三格与接口实参（列表 / 详情都带 token）；
 * 2. 工具栏筛选是**前端**过滤：关键词收窄行数，并把页码打回第 1 页；
 * 3. 翻页只切本地切片，不重复打接口，第 2 页拿到的是第 11 条之后的记录；
 * 4. 提交动作的接口实参：新建（trim 后的 payload）、回复（工单号 + 内容）、关闭（工单号）。
 *
 * 展示口径（文案 / 配色 / 排序 / 筛选）在 `shared/ticketDisplay` 的纯函数里，
 * 这里只验父子接线，不重复钉文案。
 */
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  reply: vi.fn(),
  close: vi.fn(),
}))
vi.mock('@/api/tickets', async (orig) => ({
  ...(await orig<typeof import('@/api/tickets')>()),
  listTickets: mocks.list,
  getTicketDetail: mocks.detail,
  createTicket: mocks.create,
  replyTicket: mocks.reply,
  closeTicket: mocks.close,
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

/** 12 张工单：每一行都不一样，翻页与关键词筛选都能用编号区分。 */
const baseTickets = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1
  return {
    id: number,
    ticket_id: `T-${String(number).padStart(2, '0')}`,
    creator: 'alice',
    subject: `工单主题 ${number}`,
    category: '支付',
    priority: 'normal' as const,
    status: 'open' as const,
    created_at: '2026-10-01T10:00:00Z',
    // 编号越大越新，排序（同状态按更新时间倒序）后第 1 页就是 T-12 … T-03
    updated_at: `2026-10-${String(number + 8).padStart(2, '0')}T10:00:00Z`,
  }
})

const baseMessages = [
  {
    id: 1,
    ticket_id: 'T-12',
    sender: 'alice',
    sender_role: 'user',
    content: '我这边还是看不到资源',
    internal: false,
    created_at: '2026-10-20T10:00:00Z',
  },
  {
    id: 2,
    ticket_id: 'T-12',
    sender: 'support_01',
    sender_role: 'support',
    content: '已收到，正在核查',
    internal: false,
    created_at: '2026-10-20T11:00:00Z',
  },
]

const ROUTES = [
  { name: 'workbench-tickets', path: '/workbench/tickets', devArea: false },
  { name: 'dev-tickets', path: '/developer/tickets', devArea: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const auth = useAuthStore()
  // 不用真 token：hydrate 会从 localStorage 读回空串，把这里设的身份冲掉
  vi.spyOn(auth, 'hydrate').mockImplementation(() => {})
  auth.token = 'test-token'
  auth.username = 'alice'

  mocks.list.mockResolvedValue(baseTickets)
  mocks.detail.mockImplementation((_token: string, ticketId: string) =>
    Promise.resolve({
      ticket: baseTickets.find((ticket) => ticket.ticket_id === ticketId) ?? baseTickets[0],
      messages: ticketId === 'T-12' ? baseMessages : [],
    }),
  )
  mocks.create.mockResolvedValue({ ...baseTickets[0], ticket_id: 'T-13', subject: '新工单' })
  mocks.reply.mockResolvedValue({ ticket: baseTickets[0], messages: baseMessages })
  mocks.close.mockResolvedValue({ ...baseTickets[0], status: 'closed' })
})

async function render(entry: { name: string } = { name: 'workbench-tickets' }) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ROUTES.map((route) => ({
      name: route.name,
      path: route.path,
      meta: route.devArea ? { devArea: true } : {},
      component: { template: '<div />' },
    })),
  })
  await router.push({ name: entry.name })
  const wrapper = mount(TicketCenterView, {
    global: {
      plugins: [router],
      stubs: {
        // TDialog 默认 teleport 到 body，这里就地渲染以便按选择器定位弹窗内容
        Teleport: true,
        // 分页器只保留「翻到第 2 页」这一个动作，避免依赖 ui_73info 的分页 DOM
        TPagination: {
          name: 'TPagination',
          props: ['currentPage', 'pageSize', 'total'],
          emits: ['update:current-page'],
          template: `<button class="pager-next" @click="$emit('update:current-page', 2)" />`,
        },
        // TSelect 在 jsdom 里就地渲染会触发自身重渲染（同一页挂了三个），
        // 本用例不验下拉交互，换成能回传 modelValue 的原生 select。
        TSelect: {
          name: 'TSelect',
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)" />`,
        },
      },
    },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = VueWrapper
type Setup = Record<string, unknown>

function setupState(wrapper: Wrapper): Setup {
  return (wrapper.vm.$ as unknown as { setupState: Setup }).setupState
}

const portalRows = (wrapper: Wrapper) => wrapper.findAll('.ticket-list-row')
const devRows = (wrapper: Wrapper) => wrapper.findAll('.ticket-list-item')

describe('工单中心：最小挂载烟测', () => {
  it('开发者工作台：接口带 token，列表与读数条按排序后的第一页渲染', async () => {
    const { wrapper } = await render({ name: 'dev-tickets' })

    expect(mocks.list).toHaveBeenCalledWith('test-token')
    // 默认选中排序后的第一张（T-12），详情也用同一张 token
    expect(mocks.detail).toHaveBeenCalledWith('test-token', 'T-12')

    // 开发者侧读数条与列表行各是一套类名
    expect(wrapper.find('.dev-meta-strip').exists()).toBe(true)
    expect(wrapper.find('.wb-strip').exists()).toBe(false)
    expect(wrapper.findAll('.dev-meta-strip__value').map((cell) => cell.text())).toEqual([
      '12',
      '12',
      '0',
    ])

    // 默认每页 10 条：第 1 页是 T-12 … T-03
    const rows = devRows(wrapper)
    expect(rows).toHaveLength(10)
    expect(rows[0]!.text()).toContain('T-12')
    expect(rows[0]!.find('.dev-chip').text()).toBe('待处理')
    expect(rows[9]!.text()).toContain('T-03')

    // 详情面板拿到的是选中那张工单的消息
    expect(wrapper.find('.ticket-detail-header').text()).toContain('T-12')
    expect(wrapper.find('.ticket-thread').text()).toContain('已收到，正在核查')
    wrapper.unmount()
  })

  it('门户工作台：关键词筛选在前端收窄行数，并把页码打回第 1 页', async () => {
    const { wrapper } = await render()

    expect(wrapper.find('.wb-strip').exists()).toBe(true)
    expect(portalRows(wrapper)).toHaveLength(10)

    // 先翻到第 2 页（本地切片），再输入关键词
    await wrapper.find('.pager-next').trigger('click')
    await flushPromises()
    expect(portalRows(wrapper)).toHaveLength(2)
    expect(mocks.list).toHaveBeenCalledTimes(1)

    await wrapper.find('.wb-toolbar__search input').setValue('T-01')
    await flushPromises()

    const state = setupState(wrapper)
    expect(state.searchKeyword).toBe('T-01')
    expect(state.page).toBe(1)
    expect(portalRows(wrapper)).toHaveLength(1)
    expect(portalRows(wrapper)[0]!.text()).toContain('T-01')

    // 关键词是前端过滤，不该再打一次列表接口
    expect(mocks.list).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('新建工单：点开弹窗 → 提交，接口拿到 trim 后的 payload', async () => {
    const { wrapper } = await render()

    await wrapper.find('.wb-card-head__actions button').trigger('click')
    await flushPromises()
    expect(setupState(wrapper).composeOpen).toBe(true)

    const state = setupState(wrapper)
    state.newSubject = '  尾款支付后资源不可见  '
    state.newCategory = ' 支付 '
    state.newPriority = 'high'
    state.newContent = '  已支付尾款，资源页面仍是待支付状态。  '
    await flushPromises()

    const submit = wrapper.findAll('button').find((button) => button.text().includes('提交工单'))
    expect(submit).toBeDefined()
    await submit!.trigger('click')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith('test-token', {
      subject: '尾款支付后资源不可见',
      category: '支付',
      priority: 'high',
      content: '已支付尾款，资源页面仍是待支付状态。',
    })
    // 创建后按新工单号重新拉列表并保持选中
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(mocks.detail).toHaveBeenLastCalledWith('test-token', 'T-13')
    wrapper.unmount()
  })

  it('回复与关闭：接口实参分别是「工单号 + 内容」与「工单号」', async () => {
    const { wrapper } = await render({ name: 'dev-tickets' })

    await wrapper.find('.ticket-reply-box textarea').setValue('补充：换了浏览器也一样')
    const reply = wrapper.findAll('button').find((button) => button.text().includes('发送回复'))
    expect(reply).toBeDefined()
    await reply!.trigger('click')
    await flushPromises()
    expect(mocks.reply).toHaveBeenCalledWith('test-token', 'T-12', {
      content: '补充：换了浏览器也一样',
    })

    const close = wrapper.findAll('button').find((button) => button.text().includes('关闭工单'))
    expect(close).toBeDefined()
    await close!.trigger('click')
    await flushPromises()
    expect(mocks.close).toHaveBeenCalledWith('test-token', 'T-12')
    wrapper.unmount()
  })
})
