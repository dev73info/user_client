import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SupportChatWidget from '@/components/SupportChatWidget.vue'
import { useAuthStore } from '@/stores/auth'

import {
  FakeSupportSocket,
  latestSupportSocket,
  supportConversation,
  supportDetail,
  supportMessage,
} from './helpers/supportConversation'

const GUEST_TOKEN = ['73sg', 'test', 'guest'].join('_')

const mocks = vi.hoisted(() => ({
  listChannels: vi.fn(),
  listMine: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  availability: vi.fn(),
  upload: vi.fn(),
  rate: vi.fn(),
  createGuestSession: vi.fn(),
}))

vi.mock('@/api/support', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/support')>()),
  listPublicSupportChannels: mocks.listChannels,
  listMySupportConversations: mocks.listMine,
  getSupportConversationDetail: mocks.detail,
  createSupportConversation: mocks.create,
  sendSupportMessage: mocks.send,
  getSupportAvailability: mocks.availability,
  uploadSupportAttachment: mocks.upload,
  rateSupportConversation: mocks.rate,
  createSupportGuestSession: mocks.createGuestSession,
}))

let wrapper: VueWrapper | undefined

async function mountWidget(openSocket = true) {
  wrapper = mount(SupportChatWidget, { attachTo: document.body })
  await flushPromises()
  if (openSocket && FakeSupportSocket.instances.length > 0) latestSupportSocket().emitOpen()
  return wrapper
}

async function openPanel(target: VueWrapper) {
  await target.find('.support-fab').trigger('keydown', { key: 'Enter' })
  await flushPromises()
}

describe('在线客服浮窗', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    FakeSupportSocket.instances = []
    vi.stubGlobal('WebSocket', FakeSupportSocket)
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((media: string) => ({
        matches: false,
        media,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    setActivePinia(createPinia())
    window.localStorage.clear()
    const auth = useAuthStore()
    auth.token = 'test-token'
    auth.username = 'alice'
    mocks.listChannels.mockResolvedValue([
      { channel_key: 'web_widget', label: '网页在线客服', enabled: true },
    ])
    mocks.listMine.mockResolvedValue([])
    mocks.availability.mockResolvedValue({ online: true, online_agents: 2 })
    mocks.createGuestSession.mockResolvedValue({
      token: GUEST_TOKEN,
      display_name: '访客A1B2C3',
    })
    mocks.detail.mockImplementation(async (_token, id: number) =>
      supportDetail(id, [supportMessage({ conversation_id: id, content: '需要协助' })]),
    )
    mocks.create.mockImplementation(async (_token, content: string) =>
      supportConversation({ last_message: content }),
    )
    mocks.send.mockImplementation(async (_token, id: number, content: string) =>
      supportMessage({ id: 2, conversation_id: id, content }),
    )
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('网页渠道关闭时不展示入口，也不建连', async () => {
    mocks.listChannels.mockResolvedValue([
      { channel_key: 'web_widget', label: '网页在线客服', enabled: false },
    ])
    await mountWidget(false)
    expect(wrapper!.find('.support-fab').exists()).toBe(false)
    expect(FakeSupportSocket.instances).toHaveLength(0)
  })

  it('默认竖签不渲染关闭入口', async () => {
    const target = await mountWidget()
    expect(target.find('.support-widget').exists()).toBe(true)
    expect(target.find('.support-widget__dismiss').exists()).toBe(false)
  })

  it('未登录自动建立访客会话，无需登录即可发送', async () => {
    useAuthStore().token = ''
    const target = await mountWidget(false)
    await openPanel(target)
    await target.find('textarea').setValue('访客咨询')
    await target.find('.support-send').trigger('click')
    await flushPromises()

    expect(mocks.createGuestSession).toHaveBeenCalledOnce()
    expect(mocks.listMine).toHaveBeenCalledWith(GUEST_TOKEN)
    expect(mocks.create).toHaveBeenCalledWith(GUEST_TOKEN, '访客咨询', [])
    expect(target.text()).not.toContain('请先登录')
    expect(FakeSupportSocket.instances[0]?.url).toContain('/api/support/guest/conversations/ws')
  })

  it('首条消息创建会话，后续消息复用同一会话', async () => {
    const target = await mountWidget()
    await openPanel(target)
    await target.find('textarea').setValue('需要协助')
    await target.find('.support-send').trigger('click')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith('test-token', '需要协助', [])
    expect(target.text()).toContain('需要协助')

    await target.find('textarea').setValue('补充说明')
    await target.find('.support-send').trigger('click')
    await flushPromises()

    expect(mocks.send).toHaveBeenCalledWith('test-token', 1, '补充说明', [])
    expect(target.findAll('.support-msg')).toHaveLength(2)
    expect(target.text()).toContain('补充说明')
    expect((target.find('textarea').element as HTMLTextAreaElement).value).toBe('')
  })

  it('发送失败保留输入并恢复发送按钮', async () => {
    mocks.listMine.mockResolvedValue([supportConversation()])
    mocks.send.mockRejectedValue(new Error('会话已关闭'))
    const target = await mountWidget()
    await openPanel(target)
    await target.find('textarea').setValue('这条不能丢')
    await target.find('.support-send').trigger('click')
    await flushPromises()

    expect((target.find('textarea').element as HTMLTextAreaElement).value).toBe('这条不能丢')
    expect(target.find('[role="alert"]').text()).toBe('会话已关闭')
    expect(target.find('.support-send').attributes('disabled')).toBeUndefined()
  })

  it('打开面板时接收实时回复并同步已读', async () => {
    mocks.listMine.mockResolvedValue([supportConversation()])
    const target = await mountWidget()
    await openPanel(target)
    const messages = [
      supportMessage(),
      supportMessage({
        id: 2,
        sender_username: 'support_dev',
        sender_role: 'agent',
        content: '客服回复',
      }),
    ]
    mocks.detail.mockResolvedValue(supportDetail(1, messages, { user_last_read_message_id: 2 }))
    mocks.detail.mockClear()
    latestSupportSocket().emitMessage(supportDetail(1, messages, { user_last_read_message_id: 1 }))
    await flushPromises()

    expect(target.find('.support-msg--agent').text()).toContain('客服回复')
    expect(target.findAll('.support-msg')).toHaveLength(2)
    expect(mocks.detail).toHaveBeenCalledWith('test-token', 1)
  })

  it('面板展示客服在线状态', async () => {
    const target = await mountWidget()
    await openPanel(target)

    expect(target.find('.support-panel').text()).toContain('客服在线')
  })

  it('会话结束后可提交满意度评价', async () => {
    mocks.listMine.mockResolvedValue([
      supportConversation({
        status: 'closed',
        satisfaction_rating: null,
        satisfaction_comment: null,
      }),
    ])
    mocks.detail.mockResolvedValue(
      supportDetail(1, [supportMessage()], {
        status: 'closed',
        satisfaction_rating: null,
        satisfaction_comment: null,
      }),
    )
    mocks.rate.mockResolvedValue(
      supportConversation({
        status: 'closed',
        satisfaction_rating: 5,
        satisfaction_comment: '很好',
        satisfaction_rated_at: '2026-10-28 10:00:00',
        satisfaction_rated_by: 'alice',
      }),
    )
    const target = await mountWidget()
    await openPanel(target)
    await target.find('.support-panel__history-toggle').trigger('click')
    await target.find('.support-history__item').trigger('click')
    await flushPromises()

    const stars = target.findAll('.support-rating__picker button')
    expect(stars).toHaveLength(5)
    await stars[4]!.trigger('click')
    await target.find('.support-rating__submit').trigger('click')
    await flushPromises()

    expect(mocks.rate).toHaveBeenCalledWith('test-token', 1, 5, null)
    expect(target.text()).toContain('很好')
  })

  it('退出登录自动切换访客身份，换账号后切回账号令牌', async () => {
    vi.useFakeTimers()
    mocks.listMine.mockResolvedValue([supportConversation()])
    const target = await mountWidget()
    await openPanel(target)
    const first = latestSupportSocket()
    const auth = useAuthStore()
    auth.token = ''
    await flushPromises()
    vi.advanceTimersByTime(60_000)

    expect(first.closed).toBe(true)
    expect(target.find('.support-panel').exists()).toBe(true)
    expect(mocks.listMine).toHaveBeenCalledWith(GUEST_TOKEN)

    auth.token = 'next-token'
    await flushPromises()
    expect(FakeSupportSocket.instances.length).toBeGreaterThanOrEqual(3)
    expect(latestSupportSocket().url).toContain('next-token')
    await openPanel(target)
    expect(mocks.listMine).toHaveBeenLastCalledWith('next-token')
  })

  it('侧签支持指针点击展开与关闭', async () => {
    const target = await mountWidget()
    const fab = target.find('.support-fab')
    const tap = () => {
      const pointerDown = Object.assign(new Event('pointerdown', { bubbles: true }), {
        pointerType: 'mouse',
        button: 0,
        clientX: 1000,
        clientY: 300,
      })
      fab.element.dispatchEvent(pointerDown)
      const pointerUp = Object.assign(new Event('pointerup', { bubbles: true }), {
        pointerType: 'mouse',
        clientX: 1000,
        clientY: 300,
      })
      fab.element.dispatchEvent(pointerUp)
    }
    tap()
    await flushPromises()
    expect(target.find('.support-widget').classes()).toContain('is-icon')
    expect(target.find('.support-panel').exists()).toBe(true)

    await target.find('.support-panel__close').trigger('click')
    expect(target.find('.support-panel').exists()).toBe(false)
    expect(target.find('.support-widget').classes()).toContain('is-icon')

    tap()
    await flushPromises()
    expect(target.find('.support-panel').exists()).toBe(true)
  })
})
