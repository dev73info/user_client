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

/**
 * 发送失败与只读期两条行为修复的回归（R047）。
 *
 * 拆成独立文件是因为与主 spec 合在同一个文件会超过 300 行模块预算；
 * 这两条钉的都是「不报错的坏」：发送失败会清空整条时间线、只读期仍能打开表情/附件。
 */
describe('需求会话弹窗 · 错误态与只读期', () => {
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
  it('发送失败时整条时间线仍在，只在作曲器提示且草稿不丢', async () => {
    mocks.sendMessage.mockRejectedValue(new Error('网络异常，消息未发出'))

    const wrapper = mountModal()
    await flushPromises()
    const textarea = wrapper.find('.conversation-modal__input-shell textarea')
    await textarea.setValue('这一版还差个页脚')
    await wrapper.find('.conversation-modal__send-btn').trigger('click')
    await flushPromises()

    // 时间线还在：原有两条气泡没被「空态 / 整块错误态」顶掉
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.conversation-message').length).toBe(2)
    expect(wrapper.text()).toContain('首版已经发你了')
    expect(wrapper.find('.conversation-modal__empty').exists()).toBe(false)
    // 提示挂在作曲器一侧、内容是失败原因；时间线里没有它
    const sendError = wrapper.find('.conversation-modal__composer .conversation-modal__send-error')
    expect(sendError.text()).toContain('网络异常，消息未发出')
    // 草稿原样留着，用户点一下就能重发
    expect((textarea.element as HTMLTextAreaElement).value).toBe('这一版还差个页脚')
    wrapper.unmount()
  })

  it('发送失败后再发成功，提示消失且草稿清空', async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error('网络异常，消息未发出'))

    const wrapper = mountModal()
    await flushPromises()
    const textarea = wrapper.find('.conversation-modal__input-shell textarea')
    await textarea.setValue('再试一次')
    await wrapper.find('.conversation-modal__send-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.conversation-modal__send-error').exists()).toBe(true)

    // 第二次走成功分支（beforeEach 里的 sendMessage 是 resolve）
    await wrapper.find('.conversation-modal__send-btn').trigger('click')
    await flushPromises()
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.conversation-modal__send-error').exists()).toBe(false)
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
    wrapper.unmount()
  })

  it('合同归档只读期点表情 / 附件按钮不会开面板、也不会触发文件选择', async () => {
    // archive_locked_at 有值即「进入资料保留期只读」，此时 composerLocked 为真
    mocks.fetchRequirementDetail.mockResolvedValue({
      requirement_id: 'REQ-1',
      status: 'in_development',
      archive_locked_at: nowIso,
    })

    const wrapper = mountModal()
    await flushPromises()
    expect(wrapper.find('[data-testid="conversation-archive-readonly"]').exists()).toBe(true)

    const emojiButton = wrapper.find('button[aria-label="选择表情"]')
    const attachButton = wrapper.find('button[aria-label="添加截图附件"]')
    // 第一道闸：模板上这两颗按钮本来就该是 disabled
    expect(emojiButton.attributes('disabled')).toBeDefined()
    expect(attachButton.attributes('disabled')).toBeDefined()
    /* 第二道闸才是守卫本身。`@vue/test-utils` 的 trigger 遇到 disabled 会直接跳过派发
       （`BaseWrapper.trigger` 里的 `!this.isDisabled()`），所以先摘掉 disabled 再点，单看
       守卫兜不兜得住 —— 这是「按钮看起来可用」时的真实路径。 */
    emojiButton.element.removeAttribute('disabled')
    await emojiButton.trigger('click')
    await flushPromises()
    expect(wrapper.find('.conversation-modal__emoji-panel').exists()).toBe(false)

    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    const fileClick = vi.spyOn(fileInput, 'click')
    attachButton.element.removeAttribute('disabled')
    await attachButton.trigger('click')
    await flushPromises()
    expect(fileClick).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('未锁定时表情面板能打开、附件按钮会触发文件选择', async () => {
    const wrapper = mountModal() // 对照组：防止守卫写宽了把正常会话也挡掉
    await flushPromises()
    await wrapper.find('button[aria-label="选择表情"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.conversation-modal__emoji-panel').exists()).toBe(true)
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    const fileClick = vi.spyOn(fileInput, 'click')
    await wrapper.find('button[aria-label="添加截图附件"]').trigger('click')
    await flushPromises()
    expect(fileClick).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
