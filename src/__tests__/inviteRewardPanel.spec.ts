import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { HttpError } from '@/api/http'
import InviteRewardPanel from '@/components/InviteRewardPanel.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  claim: vi.fn(),
  sync: vi.fn(),
  toDataURL: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  invoke: vi.fn(),
  push: vi.fn(),
  wechat: false,
}))

const auth = reactive({
  token: 'reward-token',
  username: 'tester',
  isAuthed: true,
  hydrate: vi.fn(),
})

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/workbench/badges' }),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('@/shared/auth/browser', () => ({ isWechatBrowser: () => mocks.wechat }))
vi.mock('@/api/inviteReward', () => ({
  getInviteRewards: mocks.get,
  claimInviteRewards: mocks.claim,
  syncInviteRewards: mocks.sync,
}))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }))
vi.mock('ui_73info', () => ({
  TButton: {
    props: ['disabled', 'loading', 'variant', 'tone'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  TDialog: { props: ['open'], template: '<div v-if="open"><slot /></div>' },
  TMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning,
    info: mocks.info,
  },
}))

const payout = {
  out_bill_no: 'IR20261107',
  amount_fen: 100,
  state: 'wait_user_confirm',
  package_info: 'mock-package',
  mch_id: '1743365011',
  app_id: 'wxcca827878ec0def8',
}

function rewardOverview(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    amount_fen: 100,
    require_invitee_realname: true,
    min_invitee_age_days: 0,
    total_invited: 3,
    total_rewarded_fen: 300,
    available_fen: 100,
    pending_fen: 100,
    paid_fen: 100,
    rewards: [
      {
        id: 'r1',
        invitee: 'u***3',
        amount_fen: 100,
        status: 'available',
        reason: '',
        created_at: '2026-11-07 10:00:00',
      },
      {
        id: 'r2',
        invitee: 'z***8',
        amount_fen: 100,
        status: 'pending',
        reason: '待被邀请人完成实名认证',
        created_at: '2026-11-06 10:00:00',
      },
      {
        id: 'r3',
        invitee: 'm***1',
        amount_fen: 100,
        status: 'paid',
        reason: '',
        created_at: '2026-10-30 10:00:00',
      },
    ],
    payouts: [],
    ...overrides,
  }
}

let wrapper: VueWrapper | undefined

function claimButton() {
  const found = wrapper!.findAll('button').find((item) => item.text() === '领取奖励')
  expect(found).toBeDefined()
  return found!
}

function clearBridge() {
  delete (window as Window & { WeixinJSBridge?: unknown }).WeixinJSBridge
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.wechat = false
  mocks.get.mockResolvedValue(rewardOverview())
  mocks.claim.mockResolvedValue({ payouts: [payout] })
  mocks.sync.mockResolvedValue(rewardOverview({ available_fen: 0, paid_fen: 200 }))
  mocks.toDataURL.mockResolvedValue('data:image/png;base64,qr')
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  clearBridge()
})

describe('邀请现金奖励面板', () => {
  it('渲染汇总、明细与状态', async () => {
    wrapper = mount(InviteRewardPanel)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('邀请现金奖励')
    expect(text).toContain('累计奖励')
    expect(text).toContain('可领取')
    expect(text).toContain('待入账')
    expect(text).toContain('已到账')
    expect(text).toContain('u***3')
    expect(text).toContain('待被邀请人完成实名认证')
    expect(text).toContain('待实名')
    expect(claimButton().attributes('disabled')).toBeUndefined()
  })

  it('微信内领取时调用 requestMerchantTransfer 并查单刷新', async () => {
    mocks.wechat = true
    mocks.invoke.mockImplementation(
      (
        _method: string,
        _params: Record<string, string>,
        callback: (result: { err_msg?: string }) => void,
      ) => callback({ err_msg: 'requestMerchantTransfer:ok' }),
    )
    Object.assign(window, { WeixinJSBridge: { invoke: mocks.invoke } })

    wrapper = mount(InviteRewardPanel)
    await flushPromises()
    await claimButton().trigger('click')
    await flushPromises()

    expect(mocks.claim).toHaveBeenCalledWith('reward-token')
    expect(mocks.invoke).toHaveBeenCalledWith(
      'requestMerchantTransfer',
      { mchId: '1743365011', appId: 'wxcca827878ec0def8', package: 'mock-package' },
      expect.any(Function),
    )
    expect(mocks.sync).toHaveBeenCalledWith('reward-token')
    expect(mocks.success).toHaveBeenCalled()
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })

  it('可领取为 0 但有待确认转账单时显示继续确认收款并再次拉起 JSAPI', async () => {
    mocks.wechat = true
    mocks.invoke.mockImplementation(
      (
        _method: string,
        _params: Record<string, string>,
        callback: (result: { err_msg?: string }) => void,
      ) => callback({ err_msg: 'requestMerchantTransfer:ok' }),
    )
    Object.assign(window, { WeixinJSBridge: { invoke: mocks.invoke } })
    mocks.get.mockResolvedValue(
      rewardOverview({
        available_fen: 0,
        payouts: [
          {
            out_bill_no: 'IR20261107',
            amount_fen: 100,
            reward_count: 1,
            status: 'wait_user_confirm',
            package_info: 'mock-package',
            created_at: '2026-11-07 10:05:00',
          },
        ],
      }),
    )

    wrapper = mount(InviteRewardPanel)
    await flushPromises()

    const button = wrapper.findAll('button').find((item) => item.text() === '继续确认收款')
    expect(button).toBeDefined()
    expect(button!.attributes('disabled')).toBeUndefined()

    await button!.trigger('click')
    await flushPromises()

    // 复用领取接口：后端返回已有的非终态单，不重复建单。
    expect(mocks.claim).toHaveBeenCalledWith('reward-token')
    expect(mocks.invoke).toHaveBeenCalledWith(
      'requestMerchantTransfer',
      { mchId: '1743365011', appId: 'wxcca827878ec0def8', package: 'mock-package' },
      expect.any(Function),
    )
  })

  it('微信内取消收款时提示稍后再领', async () => {
    mocks.wechat = true
    mocks.invoke.mockImplementation(
      (
        _method: string,
        _params: Record<string, string>,
        callback: (result: { err_msg?: string }) => void,
      ) => callback({ err_msg: 'requestMerchantTransfer:cancel' }),
    )
    Object.assign(window, { WeixinJSBridge: { invoke: mocks.invoke } })

    wrapper = mount(InviteRewardPanel)
    await flushPromises()
    await claimButton().trigger('click')
    await flushPromises()

    expect(mocks.warning).toHaveBeenCalledWith('已取消，可稍后再领')
  })

  it('非微信环境领取后生成带 inviteReward=claim 的扫码入口', async () => {
    wrapper = mount(InviteRewardPanel)
    await flushPromises()
    await claimButton().trigger('click')
    await flushPromises()

    expect(mocks.toDataURL).toHaveBeenCalled()
    expect(String(mocks.toDataURL.mock.calls[0]?.[0])).toContain('inviteReward=claim')
    expect(wrapper.text()).toContain('请在微信中扫码打开本页领取')
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('未绑定微信时提示先微信登录并给登录入口', async () => {
    mocks.claim.mockRejectedValue(new HttpError(409, '请先用微信登录后再领取', 'WECHAT_NOT_BOUND'))

    wrapper = mount(InviteRewardPanel)
    await flushPromises()
    await claimButton().trigger('click')
    await flushPromises()

    expect(mocks.error).toHaveBeenCalledWith('请先用微信登录后再领取')
    expect(wrapper.text()).toContain('请先用微信登录后再领取')
    const loginButton = wrapper.findAll('button').find((item) => item.text() === '去微信登录')
    expect(loginButton).toBeDefined()
    await loginButton!.trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({
      name: 'home',
      query: { modal: 'auth', mode: 'login', redirect_to: '/workbench/badges' },
    })
  })
})
