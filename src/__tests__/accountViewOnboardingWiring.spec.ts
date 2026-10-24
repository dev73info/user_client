import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubMatchMedia } from '@/__tests__/accountViewHelpers'

/**
 * 账号与安全页**挂载时**两处企业开户口径的接线（BUG-013 / BUG-014 / BUG-017）。
 *
 * `settleAccountStage.spec.ts` / `realnameRecheck.spec.ts` 钉的是口径本身；这一层钉的是
 * **视图与域有没有真的照口径行事**——口径再对，只要视图里又自己写了一遍 `if`，页面照样错：
 *
 * - 回查：改回「每次都问」不会让任何组件级用例变红，只有整页挂起来才看得见多发了一次
 *   `POST /realname/asign/result`；而这个端点在历史版本里会连带重放「实名通过」的副作用，
 *   把企业开户一遍遍送审。
 * - 阶段：入口行那句话是 `stage` 一路算出来的（域 → 共享模块 → 行文案），域里自己判状态时
 *   空白卡号会被当成「已设置」，渠道驳回会被并进「待认证」。
 */
const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getBoundProviders: vi.fn(),
  getMyAdapayMember: vi.fn(),
  getMyRealnameVerification: vi.fn(),
  completeAsignIdentify: vi.fn(),
  resumeAsignIdentify: vi.fn(),
  open: vi.fn(),
  replace: vi.fn(),
}))

const auth = reactive({
  token: 'test-token',
  username: 'alice',
  isAuthed: true,
  hydrate: vi.fn(),
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
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,qr') } }))

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
  sendProfileEmailChangeCode: vi.fn(),
  updateProfileEmail: vi.fn(),
  sendProfilePasswordCode: vi.fn(),
  updateProfilePassword: vi.fn(),
  sendProfileTwoFactorCode: vi.fn(),
  updateProfileTwoFactor: vi.fn(),
}))

vi.mock('@/api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/auth')>()),
  getBoundProviders: mocks.getBoundProviders,
}))

vi.mock('@/api/adapay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/adapay')>()),
  getMyAdapayMember: mocks.getMyAdapayMember,
}))

vi.mock('@/api/realname', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/realname')>()),
  getMyRealnameVerification: mocks.getMyRealnameVerification,
  completeAsignIdentify: mocks.completeAsignIdentify,
  resumeAsignIdentify: mocks.resumeAsignIdentify,
}))

import AccountCouponsView from '@/views/AccountCouponsView.vue'

/** 一条指定状态的实名记录：`status` 决定挂载时该不该回查。 */
function record(status: string) {
  return {
    status,
    auth_type: 'IDENTITY_CARD',
    real_name: '张三',
    id_card_no_masked: '110***********1234',
    mobile_masked: '138****0000',
  }
}

async function renderAccountPage(): Promise<VueWrapper> {
  const wrapper = mount(AccountCouponsView, {
    global: {
      stubs: { RealnameHero: true },
      config: { warnHandler: () => {} },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  stubMatchMedia()
  vi.spyOn(window, 'open').mockImplementation(mocks.open)
  route.query = {}
  mocks.getProfile.mockResolvedValue({
    username: 'alice',
    email: 'old@example.com',
    two_factor_enabled: false,
    wechat_bound: false,
  })
  mocks.getBoundProviders.mockResolvedValue({ providers: [] })
  mocks.getMyAdapayMember.mockResolvedValue({
    onboardingStatus: 'active',
    acceptsSettlement: false,
  })
  mocks.completeAsignIdentify.mockResolvedValue({ status: 'none' })
  mocks.resumeAsignIdentify.mockRejectedValue(new Error('没有在跑的核身链接'))
})

describe('账号与安全页挂载：要不要回查实名结果', () => {
  it('已通过不回查：回查不会改变什么，只是白跑一趟渠道', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(record('approved'))
    await renderAccountPage()
    expect(mocks.completeAsignIdentify).not.toHaveBeenCalled()
  })

  it('已驳回也不回查', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(record('rejected'))
    await renderAccountPage()
    expect(mocks.completeAsignIdentify).not.toHaveBeenCalled()
  })

  it('处理中要问一次，渠道那边可能已经出结果', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(record('pending'))
    await renderAccountPage()
    expect(mocks.completeAsignIdentify).toHaveBeenCalledTimes(1)
  })

  it('根本没有实名记录也要问，账户页可能没加载到', async () => {
    mocks.getMyRealnameVerification.mockResolvedValue(null)
    await renderAccountPage()
    expect(mocks.completeAsignIdentify).toHaveBeenCalledTimes(1)
  })

  it('记录在、但状态是空的：仍算「还不知道」，要问', async () => {
    // 这一条区分「照口径走」与「自己再写一遍 if」：老写法 `!current || status === 'pending'`
    // 在这里不会问，而按口径「状态未知要问」，视图必须调共用函数。
    mocks.getMyRealnameVerification.mockResolvedValue(record(''))
    await renderAccountPage()
    expect(mocks.completeAsignIdentify).toHaveBeenCalledTimes(1)
  })
})

describe('账号与安全页入口行：收款账户走到哪一步了', () => {
  beforeEach(() => {
    // 实名已通过：结算那一行才轮到「渠道那边怎么样、卡绑没绑」来说话。
    mocks.getMyRealnameVerification.mockResolvedValue(record('approved'))
  })

  it('渠道驳回不在入口行写「待认证」：那是去整改，不是等（BUG-013）', async () => {
    mocks.getMyAdapayMember.mockResolvedValue({
      onboardingStatus: 'failed',
      acceptsSettlement: false,
    })
    const wrapper = await renderAccountPage()
    // 个人主体的标签口径是「开通被拒」（企业主体是「渠道审核未通过」），只要别落成「待认证」。
    expect(wrapper.text()).toContain('收款账户：开通被拒')
    expect(wrapper.text()).not.toContain('收款账户：待认证')
  })

  it('渠道已通过、还没绑卡写「待绑卡」：差的是用户那一步，入口可点开（BUG-017）', async () => {
    mocks.getMyAdapayMember.mockResolvedValue({
      onboardingStatus: 'active',
      acceptsSettlement: false,
    })
    const wrapper = await renderAccountPage()
    expect(wrapper.text()).toContain('收款账户：待绑卡')
  })

  it('后端说不能收款就不算已绑：不能写「已设置」', async () => {
    // `active` 但 `accepts_settlement = false`：号码不齐备，等于还不能收钱
    mocks.getMyAdapayMember.mockResolvedValue({
      onboardingStatus: 'active',
      acceptsSettlement: false,
    })
    const wrapper = await renderAccountPage()
    expect(wrapper.text()).not.toContain('结算账户：已设置')
    expect(wrapper.text()).toContain('收款账户：待绑卡')
    // 「注销结算账户」只在真的绑了卡时才该出现：空白号当已绑会多给一个解绑入口。
    expect(wrapper.text()).not.toContain('注销结算账户')
  })

  it('渠道还在审写「渠道审核中」，且入口不放开', async () => {
    mocks.getMyAdapayMember.mockResolvedValue({
      onboardingStatus: 'under_review',
      acceptsSettlement: false,
    })
    const wrapper = await renderAccountPage()
    expect(wrapper.text()).toContain('收款账户：渠道审核中')
  })
})
