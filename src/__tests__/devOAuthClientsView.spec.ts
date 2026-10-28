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
    const wrapper = mount(DevOAuthClientsView)
    await flushPromises()
    await wrapper.find('input').setValue('我的小站')
    await wrapper.find('textarea').setValue('https://example.com/callback')
    await buttonByText(wrapper, '创建客户端').trigger('click')
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
