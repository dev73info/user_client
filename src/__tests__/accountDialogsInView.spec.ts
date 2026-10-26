import { flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buttonByText, openEntry, renderView, stubMatchMedia } from '@/__tests__/accountViewHelpers'

/**
 * 账号与安全页「改用户名 / 改邮箱 / 注销账号 / 注销结算账户」四个弹窗**在视图里**的接线。
 *
 * 端到端点一遍，专门盯「事件键名对不上会静默失效」这类问题：`v-model:visible` 走
 * `update:visible`、草稿走 `update:value` / `update:email` / `update:code` 这些带冒号的键，
 * 任何一个写成驼峰都会让弹窗「看着能点、其实什么都没发生」。
 */
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  sendProfileEmailChangeCode: vi.fn(),
  updateProfileEmail: vi.fn(),
  getBoundProviders: vi.fn(),
  closeAccount: vi.fn(),
  closeSettle: vi.fn(),
  logout: vi.fn(),
  setToken: vi.fn(),
  hydrate: vi.fn(),
  replace: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  username: 'alice',
  isAuthed: true,
  hydrate: mocks.hydrate,
  setToken: mocks.setToken,
  logout: mocks.logout,
  fetchProfile: vi.fn(async () => undefined),
})
const route = reactive({ query: {} as Record<string, string> })

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: mocks.replace, push: mocks.replace }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

vi.mock('@/api/settings', () => ({
  getProfile: mocks.getProfile,
  updateProfile: vi.fn(),
  sendProfileEmailChangeCode: mocks.sendProfileEmailChangeCode,
  updateProfileEmail: mocks.updateProfileEmail,
  // 本文件用不到，但模块是整体 mock 的，视图 import 的名字都得在
  sendProfilePasswordCode: vi.fn(),
  updateProfilePassword: vi.fn(),
  sendProfileTwoFactorCode: vi.fn(),
  updateProfileTwoFactor: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getBoundProviders: mocks.getBoundProviders,
  closeAccount: mocks.closeAccount,
}))

vi.mock('@/api/adapay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/adapay')>()),
  closeMyAdapaySettlementAccount: mocks.closeSettle,
}))

vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: vi.fn(async () => null),
  completeAsignIdentify: vi.fn(async () => ({
    status: 'none',
    real_name: '',
    id_card_no_masked: '',
  })),
}))

import AccountCouponsView from '@/views/AccountCouponsView.vue'

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  mocks.getProfile.mockResolvedValue({
    username: 'alice',
    email: 'old@example.com',
    two_factor_enabled: false,
  })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.sendProfileEmailChangeCode.mockResolvedValue({})
  mocks.updateProfileEmail.mockResolvedValue({ email: 'new@example.com' })
  mocks.closeAccount.mockResolvedValue({})
  mocks.closeSettle.mockResolvedValue({})
})

describe('账号与安全页：改邮箱 / 两个注销弹窗的父子接线', () => {
  it('改邮箱：发码用新邮箱，保存带新邮箱 + 验证码', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'email')

    await wrapper.find('input[type="email"]').setValue('new@example.com')
    await buttonByText(wrapper, '发送验证码').trigger('click')
    await flushPromises()
    expect(mocks.sendProfileEmailChangeCode).toHaveBeenCalledWith('test-token', 'new@example.com')

    await wrapper.find('input[type="text"]').setValue('123456')
    await buttonByText(wrapper, '保存邮箱').trigger('click')
    await flushPromises()
    expect(mocks.updateProfileEmail).toHaveBeenCalledWith('test-token', 'new@example.com', '123456')
    wrapper.unmount()
  })

  it('注销账号：确认词没输对时点不动「确认注销」，输对后注销并退出登录', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'close')

    const confirm = buttonByText(wrapper, '确认注销')
    expect(confirm.attributes('disabled')).toBeDefined()
    await confirm.trigger('click')
    await flushPromises()
    expect(mocks.closeAccount).not.toHaveBeenCalled()

    await wrapper.find('#account-close-confirmation').setValue('注销账号')
    await buttonByText(wrapper, '确认注销').trigger('click')
    await flushPromises()

    expect(mocks.closeAccount).toHaveBeenCalledWith('test-token')
    expect(mocks.logout).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('注销结算账户：确认词走父级校验，输对后调注销接口', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'closeSettle')

    await wrapper.find('#close-settle-confirmation').setValue('注销结算账户')
    await buttonByText(wrapper, '确认注销').trigger('click')
    await flushPromises()

    expect(mocks.closeSettle).toHaveBeenCalledWith('test-token')
    wrapper.unmount()
  })

  it('点弹窗右上角关闭按钮，父级可见性跟着回写（update:visible 生效）', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'email')
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)

    await wrapper.find('.t73-dialog__close').trigger('click')
    await nextTick()

    expect(wrapper.find('input[type="email"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
