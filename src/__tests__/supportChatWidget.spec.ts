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

const mocks = vi.hoisted(() => ({
  listChannels: vi.fn(),
  listMine: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@/api/support', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/support')>()),
  listPublicSupportChannels: mocks.listChannels,
  listMySupportConversations: mocks.listMine,
  getSupportConversationDetail: mocks.detail,
  createSupportConversation: mocks.create,
  sendSupportMessage: mocks.send,
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
    const auth = useAuthStore()
    auth.token = 'test-token'
    auth.username = 'alice'
    mocks.listChannels.mockResolvedValue([
      { channel_key: 'web_widget', label: '网页在线客服', enabled: true },
    ])
    mocks.listMine.mockResolvedValue([])
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

  it('未登录只提示登录，不发会话请求', async () => {
    useAuthStore().token = ''
    const target = await mountWidget(false)
    await openPanel(target)
    expect(target.text()).toContain('请先登录后再使用在线客服')
    expect(mocks.listMine).not.toHaveBeenCalled()
    expect(FakeSupportSocket.instances).toHaveLength(0)
  })

  it('首条消息创建会话，后续消息复用同一会话', async () => {
    const target = await mountWidget()
    await openPanel(target)
    await target.find('textarea').setValue('需要协助')
    await target.find('.support-send').trigger('click')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith('test-token', '需要协助')
    expect(target.text()).toContain('需要协助')

    await target.find('textarea').setValue('补充说明')
    await target.find('.support-send').trigger('click')
    await flushPromises()

    expect(mocks.send).toHaveBeenCalledWith('test-token', 1, '补充说明')
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

  it('退出登录清理旧会话且不重连，换账号后使用新令牌', async () => {
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
    expect(target.find('.support-panel').exists()).toBe(false)
    expect(FakeSupportSocket.instances).toHaveLength(1)

    auth.token = 'next-token'
    await flushPromises()
    expect(FakeSupportSocket.instances).toHaveLength(2)
    expect(latestSupportSocket().url).toContain('next-token')
    await openPanel(target)
    expect(mocks.listMine).toHaveBeenLastCalledWith('next-token')
  })

  it('侧签支持指针点击展开与关闭', async () => {
    const target = await mountWidget()
    const fab = target.find('.support-fab')
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
    await flushPromises()
    expect(target.find('.support-panel').exists()).toBe(true)

    await target.find('.support-panel__close').trigger('click')
    expect(target.find('.support-panel').exists()).toBe(false)
  })
})
