import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import { detail, nowIso, requirementRow, withHistory } from './fixtures/conversationDetail'

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

  it('点「详情」拉一次需求列表，抽屉渲染八项字段与两段富文本', async () => {
    mocks.listRequirements.mockResolvedValue([requirementRow])
    const wrapper = mountModal()
    await flushPromises()
    await wrapper.find('.conversation-modal__header-actions button').trigger('click')
    await flushPromises()
    expect(mocks.listRequirements).toHaveBeenCalledWith('tok')

    // 抽屉整棵 Teleport 到 body，只能从 document 上查
    const drawer = document.body.querySelector('.conversation-drawer')
    const labels = [...(drawer?.querySelectorAll('.conversation-drawer__meta dt') ?? [])].map((n) =>
      n.textContent?.trim(),
    )
    expect(labels.join(',')).toBe('编号,发布方式,状态,预算,创建,更新,需求方,开发者')
    expect(drawer?.textContent).toContain('开发中')
    expect(drawer?.textContent).toContain('5,000')

    // 两段富文本走 sanitize + v-html：标签要真的变成元素，被拍平成一行纯文本就是丢排版
    const rich = [...(drawer?.querySelectorAll('.conversation-drawer__rich') ?? [])]
    expect(rich).toHaveLength(2)
    expect(rich[0]?.querySelector('strong')?.textContent).toBe('能看')
    expect(rich[0]?.querySelectorAll('li')).toHaveLength(1)
    expect(rich[1]?.textContent).toContain('Lighthouse 90 分')
    wrapper.unmount()

    // apiMode 是抽屉里 listMyRequirements / listRequirements 的唯一分叉，抽组件后不能丢
    const devRow = structuredClone(requirementRow)
    delete (devRow as { developer?: string }).developer
    mocks.listRequirements.mockClear()
    mocks.listMyRequirements.mockResolvedValue([devRow])
    const devWrapper = mountModal({ apiMode: 'dev' })
    await flushPromises()
    await devWrapper.find('.conversation-modal__header-actions button').trigger('click')
    await flushPromises()
    expect(mocks.listMyRequirements).toHaveBeenCalledWith('tok')
    expect(mocks.listRequirements).not.toHaveBeenCalled()
    // 开发者侧那份 RequirementItem 没有 developer 字段，退回当前登录名
    const developerCell = document.body.querySelector(
      '.conversation-drawer__meta div:last-child dd',
    )
    expect(developerCell?.textContent?.trim()).toBe('alice')
    devWrapper.unmount()
  })

  it('有未公开历史区段时渲染提示条，申请与表决各触发一次接口', async () => {
    mocks.getDetail.mockResolvedValue(structuredClone(withHistory))
    mocks.requestHistory.mockResolvedValue(structuredClone(withHistory))
    mocks.respondHistory.mockResolvedValue({})
    const wrapper = mountModal()
    await flushPromises()
    expect(wrapper.find('.conversation-history-notice').exists()).toBe(true)
    expect(wrapper.find('.conversation-history-notice__segments').text()).toContain('carol')

    await wrapper.find('.conversation-history-notice__action').trigger('click')
    await flushPromises()
    expect(mocks.requestHistory).toHaveBeenCalledTimes(1)
    expect(mocks.requestHistory).toHaveBeenCalledWith('tok', 'REQ-1')

    const vote = wrapper.find('.conversation-history-vote')
    expect(vote.exists()).toBe(true)
    const approve = vote.find('.conversation-history-vote__actions button')
    // 没有表决在飞：按钮要可点（有表决时两颗一起禁用，见 :voting 绑定）
    expect(approve.attributes('disabled')).toBeUndefined()
    await approve.trigger('click')
    await flushPromises()
    expect(mocks.respondHistory).toHaveBeenCalledTimes(1)
    expect(mocks.respondHistory).toHaveBeenCalledWith('tok', 31, 'approved')
    wrapper.unmount()
  })
})
