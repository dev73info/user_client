import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'

import AuthorizedAppsView from '@/views/AuthorizedAppsView.vue'
import { HttpError } from '@/api/http'
import type { OAuthAuthorization } from '@/api/oauthAuthorizations'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  revoke: vi.fn(),
  confirm: vi.fn(),
  replace: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

const auth = reactive({ token: 'buyer-token', hydrate: vi.fn() })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/workbench/account/authorized-apps' }),
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('@/api/oauthAuthorizations', () => ({
  listOAuthAuthorizations: mocks.list,
  revokeOAuthAuthorization: mocks.revoke,
}))
vi.mock('ui_73info', () => ({
  Refresh: { template: '<span />' },
  TIcon: { template: '<span><slot /></span>' },
  TButton: {
    props: ['loading', 'disabled'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  TMessage: { success: mocks.success, error: mocks.error },
  TMessageBox: { confirm: mocks.confirm },
}))

function makeAuthorization(overrides: Partial<OAuthAuthorization> = {}): OAuthAuthorization {
  return {
    developer_username: 'shop_a',
    external_user_ids: ['shop-user-1', 'shop-user-2'],
    api_resource_count: 2,
    authorized_at: '2026-10-21 10:00:00',
    updated_at: '2026-10-21 10:00:00',
    ...overrides,
  }
}

function mountView(): VueWrapper {
  return mount(AuthorizedAppsView, {
    global: {
      stubs: {
        WorkbenchBarSlot: { template: '<div><slot /></div>' },
      },
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  vi.clearAllMocks()
  auth.token = 'buyer-token'
  mocks.confirm.mockResolvedValue(true)
})

describe('AuthorizedAppsView', () => {
  it('renders authorized developers and their external user ids', async () => {
    mocks.list.mockResolvedValue([makeAuthorization()])
    const wrapper = mountView()
    await flushPromises()

    expect(mocks.list).toHaveBeenCalledWith('buyer-token')
    expect(wrapper.text()).toContain('shop_a')
    expect(wrapper.text()).toContain('shop-user-1')
    expect(wrapper.text()).toContain('shop-user-2')
  })

  it('shows an empty state when there is no authorization', async () => {
    mocks.list.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('还没有授权任何应用')
  })

  it('revokes after confirmation and removes the row', async () => {
    mocks.list.mockResolvedValue([makeAuthorization()])
    mocks.revoke.mockResolvedValue(undefined)
    const wrapper = mountView()
    await flushPromises()

    const revokeButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('撤销授权'))
    expect(revokeButton).toBeTruthy()
    await revokeButton!.trigger('click')
    await flushPromises()

    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.revoke).toHaveBeenCalledWith('buyer-token', 'shop_a')
    expect(wrapper.text()).not.toContain('shop-user-1')
    expect(mocks.success).toHaveBeenCalled()
  })

  it('does not revoke when the confirmation is cancelled', async () => {
    mocks.list.mockResolvedValue([makeAuthorization()])
    mocks.confirm.mockResolvedValue(false)
    const wrapper = mountView()
    await flushPromises()

    const revokeButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('撤销授权'))
    await revokeButton!.trigger('click')
    await flushPromises()

    expect(mocks.revoke).not.toHaveBeenCalled()
  })

  it('redirects to login on 401', async () => {
    mocks.list.mockRejectedValue(new HttpError(401, '未登录'))
    mountView()
    await flushPromises()

    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'home',
        query: expect.objectContaining({ modal: 'auth', mode: 'login' }),
      }),
    )
  })
})
