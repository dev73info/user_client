import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'

/**
 * 需求会话弹窗的挂载烟测。
 *
 * 这个组件（3,700 行，且此前的零测试覆盖）在 R047 里先做「删死码 + 纯函数外移」，
 * 后面还要拆组件。拆之前先把三条不报错、但一断就整块功能消失的链路钉住：
 *
 * 1. `visible` 由 false 变 true 必须拉一次会话详情 —— 时间线、已读上报、实时订阅
 *    全挂在这条 watch 上，依赖数组漏一项就是「打开是空壳」；
 * 2. 输入并提交必须把草稿原文交给发消息接口 —— 参数挪位不会编译报错，
 *    只会发出去一条空消息；
 * 3. 有消息时不能渲染空态 —— 空态是 `v-else-if` 链上的兜底，
 *    条件顺序写反就会「有消息也说暂无消息」。
 *
 * 组件在 `displayMode: 'inline'` 下设 `Teleport :disabled`，元素留在原位，
 * 因此挂载后可以直接按 class 查，不必 attachTo body。
 */
const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  sendMessage: vi.fn(),
  requestHistory: vi.fn(),
  respondHistory: vi.fn(),
  markRead: vi.fn(),
  subscribe: vi.fn(),
  fetchRequirementDetail: vi.fn(),
  listRequirements: vi.fn(),
  listMyRequirements: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/api/conversations', () => ({
  getRequirementConversationByRequirement: mocks.getDetail,
  sendRequirementConversationMessage: mocks.sendMessage,
  requestRequirementHistoryDisclosure: mocks.requestHistory,
  respondConversationHistoryDisclosure: mocks.respondHistory,
  markRequirementConversationRead: mocks.markRead,
  subscribeRequirementConversationEvents: mocks.subscribe,
}))
vi.mock('@/api/requirements', () => ({
  fetchRequirementDetail: mocks.fetchRequirementDetail,
  listRequirements: mocks.listRequirements,
}))
vi.mock('@/api/devRequirements', () => ({ listMyRequirements: mocks.listMyRequirements }))
vi.mock('@/api/resources', () => ({ listPublicMcResourceVersions: vi.fn() }))
vi.mock('@/api/contracts', () => ({ fetchAsignRequirementPreviewUrl: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: { ...actual.TMessage, success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  }
})

const nowIso = new Date().toISOString()

const detail = {
  conversation: {
    id: 7,
    conversation_id: 'conv-1',
    requirement_id: 'REQ-1',
    requirement_title: '做个落地页',
    customer: 'alice',
    developer: 'bob',
    status: 'open' as const,
    requirement_status: 'in_development',
    unread_count: 0,
    last_message_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    history_segments: [],
    history_disclosures: [],
  },
  messages: [
    {
      id: 11,
      conversation_id: 'conv-1',
      sender: 'bob',
      sender_role: 'developer' as const,
      content: '首版已经发你了',
      created_at: nowIso,
    },
    {
      id: 12,
      conversation_id: 'conv-1',
      sender: 'alice',
      sender_role: 'customer' as const,
      content: '收到，我看下',
      created_at: nowIso,
    },
  ],
}

const mountModal = (props: Record<string, unknown> = {}) =>
  mount(RequirementConversationModal, {
    props: {
      visible: true,
      token: 'tok',
      requirementId: 'REQ-1',
      currentUsername: 'alice',
      displayMode: 'inline',
      ...props,
    },
    global: {
      stubs: {
        WorkbenchBarSlot: { template: '<div><slot /></div>' },
        // 工具条自己会拉合同 / 交付状态，与本组件无关，换成空壳
        RequirementConversationActions: { template: '<div class="actions-stub" />' },
      },
    },
  })

describe('需求会话弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDetail.mockResolvedValue(structuredClone(detail))
    mocks.sendMessage.mockResolvedValue(structuredClone(detail))
    mocks.markRead.mockResolvedValue({ last_read_message_id: 12 })
    mocks.fetchRequirementDetail.mockResolvedValue({
      requirement_id: 'REQ-1',
      status: 'in_development',
    })
    mocks.subscribe.mockReturnValue(() => {})
  })

  it('渲染时间线与作曲器', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.find('.conversation-modal__messages').exists()).toBe(true)
    expect(wrapper.findAll('.conversation-message').length).toBe(2)
    expect(wrapper.text()).toContain('首版已经发你了')
    expect(wrapper.text()).toContain('收到，我看下')
    // 同一天的两条消息前有且只有一个日期分隔条
    expect(wrapper.findAll('.conversation-date-pill').length).toBe(1)

    expect(wrapper.find('.conversation-modal__composer').exists()).toBe(true)
    expect(wrapper.find('.conversation-modal__input-shell textarea').exists()).toBe(true)

    wrapper.unmount()
  })

  it('visible 由 false 变 true 时拉一次会话详情', async () => {
    const wrapper = mountModal({ visible: false })
    await flushPromises()
    expect(mocks.getDetail).not.toHaveBeenCalled()

    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(mocks.getDetail).toHaveBeenCalledWith('tok', 'REQ-1')
    // 打开会话要顺手订上实时流，否则新消息不会自己出现
    expect(mocks.subscribe).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('提交消息把草稿原文交给发消息接口', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const textarea = wrapper.find('.conversation-modal__input-shell textarea')
    await textarea.setValue('  这一版还差个页脚  ')
    await wrapper.find('.conversation-modal__send-btn').trigger('click')
    await flushPromises()

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith('tok', 'conv-1', '这一版还差个页脚', undefined)
    // 发完清空草稿，输入框不该留着上一句
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')

    wrapper.unmount()
  })

  it('已有消息时不渲染空态', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.find('.conversation-modal__empty').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('暂无消息')

    wrapper.unmount()
  })

  it('没有消息时渲染空态并保留作曲器', async () => {
    mocks.getDetail.mockResolvedValue({
      conversation: structuredClone(detail.conversation),
      messages: [],
    })
    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.find('.conversation-modal__empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无消息')
    // 空会话仍然要能发第一条消息
    expect(wrapper.find('.conversation-modal__input-shell textarea').exists()).toBe(true)

    wrapper.unmount()
  })
})
