import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buttonByText } from '@/__tests__/accountViewHelpers'
import DevOAuthClientsView from '@/views/DevOAuthClientsView.vue'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  rotate: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', hydrate: vi.fn() }),
}))

vi.mock('@/api/oauthClients', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/oauthClients')>()),
  createOAuthClient: mocks.create,
  listOAuthClients: mocks.list,
  updateOAuthClient: mocks.update,
  rotateOAuthClientSecret: mocks.rotate,
  deleteOAuthClient: mocks.remove,
}))

const client = {
  client_id: 'client-1',
  name: '我的小站',
  redirect_uris: ['https://example.com/callback'],
  allowed_scopes: ['profile'],
  client_secret_prefix: 'prefix',
  is_active: true,
}

describe('接入客户端页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue([])
    mocks.create.mockResolvedValue({ client_id: 'client-1', client_secret: 'secret-once' })
  })

  it('创建后刷新列表并展示一次性密钥', async () => {
    const wrapper = mount(DevOAuthClientsView, { attachTo: document.body })
    await flushPromises()

    await buttonByText(wrapper, '新建客户端').trigger('click')
    await flushPromises()

    // 表单在 TDialog 里（Teleport 到 body），用 DOM 直接写值
    const dialog = document.body.querySelector('.t73-dialog')!
    expect(dialog).toBeTruthy()
    const nameInput = dialog.querySelector<HTMLInputElement>('input[type="text"]')!
    nameInput.value = '我的小站'
    nameInput.dispatchEvent(new Event('input'))
    const uriInput = dialog.querySelector<HTMLTextAreaElement>('textarea')!
    uriInput.value = 'https://example.com/callback'
    uriInput.dispatchEvent(new Event('input'))
    await flushPromises()

    const createButton = [
      ...dialog.querySelectorAll<HTMLButtonElement>('.t73-dialog__footer button'),
    ].find((button) => button.textContent?.includes('创建客户端'))!
    createButton.click()
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('test-token', {
      name: '我的小站',
      redirect_uris: ['https://example.com/callback'],
      scopes: ['profile'],
    })
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('secret-once')
    wrapper.unmount()
  })

  it('编辑保存只提交当前客户端的名称与回调地址', async () => {
    mocks.list.mockResolvedValue([client])
    const wrapper = mount(DevOAuthClientsView)
    await flushPromises()
    await buttonByText(wrapper, '编辑').trigger('click')
    const item = wrapper.find('.dev-oauth-clients__item')
    await item.find('input').setValue('改名后的小站')
    await item.find('textarea').setValue('https://example.com/oauth/callback')
    await buttonByText(wrapper, '保存').trigger('click')
    await flushPromises()

    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('test-token', 'client-1', {
      name: '改名后的小站',
      redirect_uris: ['https://example.com/oauth/callback'],
    })
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(buttonByText(wrapper, '编辑').exists()).toBe(true)
    wrapper.unmount()
  })
})
