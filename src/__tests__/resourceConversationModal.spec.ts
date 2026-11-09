import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ResourceConversationModal from '@/components/ResourceConversationModal.vue'
import type { RequirementConversationDetail } from '@/shared/conversations'

/**
 * 插件咨询弹窗的挂载烟测。
 *
 * 它复用需求会话的消息流 / 作曲器，但取数换了入口：
 * - 只有 `resourceId` 时按资源打开（后端会给购买者补建会话）；
 * - 带 `conversationId` 时按会话编号读取（作者从消息中心进入）。
 * 两条入口都不能退化成「打开是空壳」，发消息也必须走后端同一套消息接口。
 */
const mocks = vi.hoisted(() => ({
  getResource: vi.fn(),
  getDetail: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
  subscribe: vi.fn(),
}))

vi.mock('@/api/conversations', () => ({
  getResourceConversation: mocks.getResource,
  getConversationDetail: mocks.getDetail,
  sendRequirementConversationMessage: mocks.sendMessage,
  markRequirementConversationRead: mocks.markRead,
  subscribeRequirementConversationEvents: mocks.subscribe,
}))

const detail: RequirementConversationDetail = {
  conversation: {
    id: 1,
    conversation_id: 'conv-res-1',
    scene: 'resource',
    requirement_id: '',
    resource_id: 7,
    requirement_title: '红石插件',
    customer: 'buyer',
    developer: 'author',
    status: 'open',
    requirement_status: 'published',
    unread_count: 0,
    created_at: '2026-11-09 10:00:00',
    updated_at: '2026-11-09 10:00:00',
    history_segments: [],
    history_disclosures: [],
  },
  messages: [
    {
      id: 1,
      conversation_id: 'conv-res-1',
      sender: 'buyer',
      sender_role: 'customer',
      content: '这个插件怎么配置？',
      created_at: '2026-11-09 10:00:00',
    },
    {
      id: 2,
      conversation_id: 'conv-res-1',
      sender: 'author',
      sender_role: 'developer',
      content: '看文档第三节',
      created_at: '2026-11-09 10:01:00',
    },
  ],
  has_more: false,
}

const mountModal = (props: Record<string, unknown> = {}) =>
  mount(ResourceConversationModal, {
    props: {
      visible: true,
      token: 'tok',
      resourceId: 7,
      title: '红石插件',
      currentUsername: 'buyer',
      displayMode: 'inline',
      ...props,
    },
    global: {
      stubs: {
        WorkbenchBarSlot: { template: '<div><slot /></div>' },
      },
    },
  })

describe('插件咨询弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getResource.mockResolvedValue(structuredClone(detail))
    mocks.getDetail.mockResolvedValue(structuredClone(detail))
    mocks.sendMessage.mockResolvedValue(structuredClone(detail))
    mocks.markRead.mockResolvedValue({ last_read_message_id: 2 })
    mocks.subscribe.mockReturnValue(() => {})
  })

  it('按资源打开：拉会话、渲染消息与作者称谓', async () => {
    const wrapper = mountModal()
    await flushPromises()

    expect(mocks.getResource).toHaveBeenCalledWith('tok', 7)
    expect(mocks.subscribe).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('红石插件')
    // 内嵌形态的会话头搬进工作台顶栏，副信息不渲染；头像取对方（作者）首字
    expect(wrapper.find('.conversation-modal__avatar').text()).toBe('A')
    expect(wrapper.text()).toContain('这个插件怎么配置？')
    expect(wrapper.text()).toContain('看文档第三节')

    wrapper.unmount()
  })

  it('带会话编号时按会话读取（作者侧）', async () => {
    const wrapper = mountModal({ conversationId: 'conv-res-1', currentUsername: 'author' })
    await flushPromises()

    expect(mocks.getDetail).toHaveBeenCalledWith('tok', 'conv-res-1')
    expect(mocks.getResource).not.toHaveBeenCalled()
    // 作者视角的对方是买家
    expect(wrapper.find('.conversation-modal__avatar').text()).toBe('B')

    wrapper.unmount()
  })

  it('提交消息把草稿原文交给发消息接口', async () => {
    const wrapper = mountModal()
    await flushPromises()

    const textarea = wrapper.find('.conversation-modal__input-shell textarea')
    await textarea.setValue('  这个报错怎么处理？ ')
    await wrapper.find('.conversation-modal__send-btn').trigger('click')
    await flushPromises()

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage).toHaveBeenCalledWith(
      'tok',
      'conv-res-1',
      '这个报错怎么处理？',
      undefined,
    )

    wrapper.unmount()
  })
})
