import { flushPromises } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buttonByText, openEntry, renderView, stubMatchMedia } from '@/__tests__/accountViewHelpers'

/**
 * 账号与安全页「改密码 / 两步验证 / 印章管理 / 爱签账户管理」四个弹窗**在视图里**的接线。
 *
 * 这四个的共同点是：草稿更多（密码三个输入、爱签九个输入），动作也更多（发码、保存、
 * 制章、换企业信息）。端到端点一遍，盯的是「哪个 `update:xxx` 或确认事件写错了」——
 * 写错不会报错，只会让弹窗点得动、什么都没发生。
 */
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  sendProfilePasswordCode: vi.fn(),
  updateProfilePassword: vi.fn(),
  sendProfileTwoFactorCode: vi.fn(),
  updateProfileTwoFactor: vi.fn(),
  getBoundProviders: vi.fn(),
  getMySeals: vi.fn(),
  createSealMakeOnline: vi.fn(),
  modifyUserName: vi.fn(),
  hydrate: vi.fn(),
  replace: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  username: 'alice',
  isAuthed: true,
  hydrate: mocks.hydrate,
  setToken: vi.fn(),
  logout: vi.fn(),
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
  sendProfilePasswordCode: mocks.sendProfilePasswordCode,
  updateProfilePassword: mocks.updateProfilePassword,
  sendProfileTwoFactorCode: mocks.sendProfileTwoFactorCode,
  updateProfileTwoFactor: mocks.updateProfileTwoFactor,
  // 本文件用不到，但模块是整体 mock 的，视图 import 的名字都得在
  updateProfile: vi.fn(),
  sendProfileEmailChangeCode: vi.fn(),
  updateProfileEmail: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getBoundProviders: mocks.getBoundProviders,
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

vi.mock('@/api/asignAccount', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/asignAccount')>()),
  getMySeals: mocks.getMySeals,
  createSealMakeOnline: mocks.createSealMakeOnline,
  modifyUserName: mocks.modifyUserName,
}))

import AccountCouponsView from '@/views/AccountCouponsView.vue'

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  mocks.getProfile.mockResolvedValue({
    username: 'alice',
    email: 'old@example.com',
    two_factor_enabled: false,
    wechat_bound: false,
  })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.sendProfilePasswordCode.mockResolvedValue({})
  mocks.updateProfilePassword.mockResolvedValue({})
  mocks.sendProfileTwoFactorCode.mockResolvedValue({})
  mocks.updateProfileTwoFactor.mockResolvedValue({ two_factor_enabled: true })
  mocks.getMySeals.mockResolvedValue({
    success: true,
    data: {
      account: '91530628MAKA0U1Y96',
      seals: [{ sealNo: 'S-1', sealName: '公司公章', isDefault: true }],
      message: '',
    },
  })
  mocks.createSealMakeOnline.mockResolvedValue({ success: true, data: 'https://asign.example.com' })
  mocks.modifyUserName.mockResolvedValue({ success: true, data: null })
  window.open = vi.fn() as unknown as typeof window.open
})

describe('账号与安全页：改密码 / 两步验证 / 印章 / 爱签账户的父子接线', () => {
  it('改密码：四个草稿都回写，保存带旧密码、新密码和验证码并退出登录', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'password')

    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('old-pw123456')
    await inputs[1]!.setValue('pw123456')
    await inputs[2]!.setValue('pw123456')
    await inputs[3]!.setValue('654321')
    await buttonByText(wrapper, '保存密码').trigger('click')
    await flushPromises()

    expect(mocks.updateProfilePassword).toHaveBeenCalledWith(
      'test-token',
      'old-pw123456',
      'pw123456',
      '654321',
    )
    expect(auth.logout).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('两步验证：拨开关先自动发一次验证码，填码保存把目标状态交上去', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'twoFactor')

    const box = wrapper.find('.account-switch-control input[type="checkbox"]')
    expect((box.element as HTMLInputElement).checked).toBe(false)
    await box.setValue(true)
    await flushPromises()

    // 开关从「未开启」被打开：父级自动发一次验证码，并清掉旧验证码
    expect(mocks.sendProfileTwoFactorCode).toHaveBeenCalledWith('test-token')
    expect((box.element as HTMLInputElement).checked).toBe(true)

    await wrapper.find('.account-security-actions input').setValue('123456')
    await buttonByText(wrapper, '保存设置').trigger('click')
    await flushPromises()

    expect(mocks.updateProfileTwoFactor).toHaveBeenCalledWith('test-token', true, '123456')
    wrapper.unmount()
  })

  it('印章管理：点开才查，列表渲染出来，制章走链接、换企业信息切到另一套表单', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'seal')
    await flushPromises()

    expect(mocks.getMySeals).toHaveBeenCalledWith('test-token')
    expect(wrapper.text()).toContain('公司公章')

    await buttonByText(wrapper, '在线制作新印章').trigger('click')
    await flushPromises()
    expect(mocks.createSealMakeOnline).toHaveBeenCalledWith('test-token', {})
    expect(window.open).toHaveBeenCalledWith(
      'https://asign.example.com',
      '_blank',
      'noopener,noreferrer',
    )

    await buttonByText(wrapper, '修改企业信息').trigger('click')
    await nextTick()
    expect(wrapper.find('.t73-dialog__title').text()).toBe('企业信息')
    wrapper.unmount()
  })

  it('爱签改姓名：两个字段回写父级草稿，确认后按三要素提交', async () => {
    const wrapper = await renderView(AccountCouponsView)
    await openEntry(wrapper, 'personal')

    const inputs = wrapper.findAll('.asign-row input')
    await inputs[0]!.setValue('王五')
    await inputs[1]!.setValue('13900002222')
    await buttonByText(wrapper, '确认修改').trigger('click')
    await flushPromises()

    expect(mocks.modifyUserName).toHaveBeenCalledWith('test-token', {
      name: '王五',
      identifyType: 2,
      mobile: '13900002222',
    })
    wrapper.unmount()
  })
})
