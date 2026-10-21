import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 账号与安全页四个弹窗**在视图里**的接线：父级持有可见性、草稿与加载态，
 * 子组件只回传。这里端到端点一遍，专门盯「事件键名对不上会静默失效」这类问题——
 * `v-model:visible` 走 `update:visible`、草稿走 `update:value` / `update:email` / `update:code`，
 * 任何一个写成驼峰都会让弹窗「看着能点、其实什么都没发生」。
 */
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
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
  updateProfile: mocks.updateProfile,
  sendProfileEmailChangeCode: mocks.sendProfileEmailChangeCode,
  updateProfileEmail: mocks.updateProfileEmail,
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

type ViewSetup = {
  openAccountEntry: (key: string) => void
}

function setupState(wrapper: VueWrapper): ViewSetup {
  return (wrapper.vm.$ as unknown as { setupState: ViewSetup }).setupState
}

function buttonByText(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => button.text().includes(text))
  if (!found) {
    throw new Error(`弹窗里找不到按钮：${text}`)
  }
  return found
}

async function renderView(): Promise<VueWrapper> {
  const wrapper = mount(AccountCouponsView, {
    // TDialog 默认 teleport 到 body；就地渲染，按选择器定位弹窗内容
    global: {
      stubs: { Teleport: true, RealnameHero: true, WechatBindQrModal: true },
      config: { warnHandler: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

/** 打开某个「账号与安全」入口（与点入口行同一个分发函数）。 */
async function openEntry(wrapper: VueWrapper, key: string) {
  setupState(wrapper).openAccountEntry(key)
  await nextTick()
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom 没有 matchMedia，视图在 onMounted 里用它判移动端
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  mocks.getProfile.mockResolvedValue({
    username: 'alice',
    email: 'old@example.com',
    two_factor_enabled: false,
    wechat_bound: false,
  })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.updateProfile.mockResolvedValue({ token: 'next-token' })
  mocks.sendProfileEmailChangeCode.mockResolvedValue({})
  mocks.updateProfileEmail.mockResolvedValue({ email: 'new@example.com' })
  mocks.closeAccount.mockResolvedValue({})
  mocks.closeSettle.mockResolvedValue({})
})

describe('账号与安全页：四个弹窗的父子接线', () => {
  it('改用户名：输入回写父级草稿，点保存把新值提交上去', async () => {
    const wrapper = await renderView()
    await openEntry(wrapper, 'username')

    const input = wrapper.find('input[placeholder="请输入新的用户名"]')
    expect(input.exists()).toBe(true)
    // 初值来自 loadProfile 回填的那份
    expect((input.element as HTMLInputElement).value).toBe('alice')

    await input.setValue('alice_new')
    await buttonByText(wrapper, '保存用户名').trigger('click')
    await flushPromises()

    expect(mocks.updateProfile).toHaveBeenCalledWith('test-token', 'alice_new')
    wrapper.unmount()
  })

  it('改邮箱：发码用新邮箱，保存带新邮箱 + 验证码', async () => {
    const wrapper = await renderView()
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
    const wrapper = await renderView()
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
    const wrapper = await renderView()
    await openEntry(wrapper, 'closeSettle')

    await wrapper.find('#close-settle-confirmation').setValue('注销结算账户')
    await buttonByText(wrapper, '确认注销').trigger('click')
    await flushPromises()

    expect(mocks.closeSettle).toHaveBeenCalledWith('test-token')
    wrapper.unmount()
  })

  it('点弹窗右上角关闭按钮，父级可见性跟着回写（update:visible 生效）', async () => {
    const wrapper = await renderView()
    await openEntry(wrapper, 'username')
    expect(wrapper.find('input[placeholder="请输入新的用户名"]').exists()).toBe(true)

    await wrapper.find('.t73-dialog__close').trigger('click')
    await nextTick()

    expect(wrapper.find('input[placeholder="请输入新的用户名"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
