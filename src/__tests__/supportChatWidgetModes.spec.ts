import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SupportChatWidget from '@/components/SupportChatWidget.vue'
import { useAuthStore } from '@/stores/auth'

import { FakeSupportSocket } from './helpers/supportConversation'

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

async function mountWidget() {
  wrapper = mount(SupportChatWidget, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('在线客服收起形态', () => {
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
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('默认只显示竖签文字，不显示吉祥物', async () => {
    const target = await mountWidget()

    expect(target.find('.support-widget').classes()).not.toContain('is-icon')
    expect(target.find('.support-fab__text').text()).toBe('在线客服')
    expect(target.find('.support-fab__stage').exists()).toBe(false)
  })

  it('点击竖签同时显示吉祥物并打开面板', async () => {
    const target = await mountWidget()
    const fab = target.find('.support-fab')

    await fab.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(target.find('.support-widget').classes()).toContain('is-icon')
    expect(target.find('.support-widget').classes()).toContain('is-open')
    expect(target.find('.support-fab__stage').exists()).toBe(true)
    expect(target.find('.support-fab__text').exists()).toBe(false)
    expect(target.find('.support-panel').exists()).toBe(true)

    await target.find('.support-panel__close').trigger('click')
    expect(target.find('.support-panel').exists()).toBe(false)
    expect(target.find('.support-widget').classes()).toContain('is-icon')
    expect(target.find('.support-fab__stage').exists()).toBe(true)
    expect(target.find('.support-fab__text').exists()).toBe(false)

    await fab.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(target.find('.support-panel').exists()).toBe(true)
  })

  it('面板打开时点击吉祥物上方的叉关闭面板并恢复竖签', async () => {
    const target = await mountWidget()

    await target.find('.support-fab').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(target.find('.support-widget').classes()).toContain('is-icon')
    expect(target.find('.support-panel').exists()).toBe(true)

    await target.find('.support-widget__dismiss').trigger('click')

    expect(target.find('.support-widget').exists()).toBe(true)
    expect(target.find('.support-panel').exists()).toBe(false)
    expect(target.find('.support-widget').classes()).not.toContain('is-icon')
    expect(target.find('.support-fab__text').exists()).toBe(true)
    expect(target.find('.support-fab__stage').exists()).toBe(false)
  })
})
