import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 收益钱包页的挂载烟测（R047 拆分时补的）：看两件最容易在拆分里走样的事——
 * ① 保证金三档读数（充值总额 / 可提现 / 冻结）是不是还从接口原样落在大数位上；
 * ② 「提现保证金」入口点下去，提交接口收到的实参（金额归一、通道固定 adapay、备注 null）对不对。
 *
 * 页面级 mount（不是 shallowMount）：卡与弹窗都是真组件，只把「资金明细」子视图换成桩，
 * 免得它自己去拉三路台账。
 */
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  setting: vi.fn(),
  depositStatus: vi.fn(),
  depositSummary: vi.fn(),
  createDepositWithdrawal: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: '/workbench/developer/wallet/overview' }),
}))
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ token: 'test-token', hydrate: vi.fn() }),
}))
vi.mock('ui_73info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ui_73info')>()
  const toast =
    (type: 'success' | 'error' | 'warning' | 'info') =>
    (message: string): void =>
      mocks.toast(message, type)
  return {
    ...actual,
    TMessage: {
      ...actual.TMessage,
      success: toast('success'),
      error: toast('error'),
      warning: toast('warning'),
      info: toast('info'),
    },
  }
})
vi.mock('@/api/devWallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/devWallet')>()),
  getDevWalletOverview: mocks.overview,
  getDevWithdrawalSetting: mocks.setting,
  updateDevWithdrawalSetting: mocks.setting,
}))
vi.mock('@/api/devOrderDeposit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/devOrderDeposit')>()),
  getDevOrderDepositStatus: mocks.depositStatus,
  getDevOrderDepositWithdrawalSummary: mocks.depositSummary,
  createDevOrderDepositWithdrawalRequest: mocks.createDepositWithdrawal,
}))
vi.mock('@/api/devCredit', () => ({ getDevCreditSelf: vi.fn().mockResolvedValue(null) }))

import DevWalletView from '@/views/DevWalletView.vue'

const OVERVIEW = {
  total_income_cny: 880,
  today_income_cny: 120,
  today_income_change_rate: 12.5,
  total_completed_orders: 6,
  active_requirement_count: 2,
  withdrawable_balance_cny: 300,
  pending_withdraw_cny: 0,
  paid_withdraw_cny: 580,
  recent_income: [],
}

function renderPage(): VueWrapper {
  return mount(DevWalletView, {
    attachTo: document.body,
    global: { config: { warnHandler: () => {} }, stubs: { DevFundRecordsView: true } },
  })
}

/** 按文案找**页面里**的那个按钮（保证金卡的两个出口：提现保证金 / 充值） */
function pageButton(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((button) => (button.text() ?? '').includes(text))
  if (!found) throw new Error(`页面里找不到按钮：${text}`)
  return found
}

/** 按文案找**弹窗里**的按钮（整页找会把卡片上的入口也匹配进来） */
function dialogButton(text: string) {
  const found = [...document.querySelectorAll('.t73-dialog button')].find((button) =>
    (button.textContent ?? '').includes(text),
  )
  if (!found) throw new Error(`弹窗里找不到按钮：${text}`)
  return found as HTMLButtonElement
}

describe('收益钱包页读数与保证金提现入口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.overview.mockResolvedValue(OVERVIEW)
    mocks.setting.mockResolvedValue({
      auto_withdraw_enabled: false,
      payout_channel_ready: true,
      payout_schedule_note: 'T+1 到账，免手续费',
    })
    mocks.depositStatus.mockResolvedValue({
      total_paid_cny: 2000,
      frozen_cny: 500,
      // 与可提现（退回台账口径）故意取不同的数：读数取错来源时这条用例才拦得住
      available_cny: 1000,
      pending_refund_cny: 0,
      pending_withdraw_cny: 0,
    })
    mocks.depositSummary.mockResolvedValue({
      withdrawable_balance_cny: 1200.54,
      pending_withdraw_cny: 0,
      paid_withdraw_cny: 799.46,
      withdrawals: [],
    })
    mocks.createDepositWithdrawal.mockResolvedValue({ status: 'payout_processing' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('renders the three deposit readings from the deposit endpoints', async () => {
    const wrapper = renderPage()
    await flushPromises()

    const depositCard = wrapper
      .findAll('.wallet-hero__card')
      .find((card) => card.text().includes('保证金余额'))
    if (!depositCard) throw new Error('没渲染出保证金卡')

    const text = depositCard.text()
    // 充值总额取自保证金状态，可提现取自退回台账，冻结取自状态里的冻结额——三档各自独立
    expect(text).toContain('充值总额 ¥2000.00')
    expect(text).toContain('¥1200.54')
    expect(text).toContain('冻结中 ¥500.00')
    // 收入池的读数不该串到保证金卡上
    expect(text).not.toContain('¥300.00')
    wrapper.unmount()
  })

  it('submits the deposit withdrawal with the normalized amount and adapay channel', async () => {
    const wrapper = renderPage()
    await flushPromises()

    await pageButton(wrapper, '提现保证金').trigger('click')
    await flushPromises()
    expect(document.querySelector('.t73-dialog')?.textContent).toContain('保证金提现')

    // 金额框按真实输入路径走：先打字、再失焦，TInputNumber 在失焦时才回写 modelValue
    const amountInput = document.querySelector(
      '.t73-dialog .t73-input-number input',
    ) as HTMLInputElement
    expect(amountInput).toBeTruthy()
    amountInput.value = '12.34'
    amountInput.dispatchEvent(new Event('input'))
    amountInput.dispatchEvent(new Event('blur'))
    await flushPromises()

    dialogButton('提交申请').click()
    await flushPromises()

    expect(mocks.createDepositWithdrawal).toHaveBeenCalledExactlyOnceWith('test-token', {
      amount_cny: 12.34,
      channel: 'adapay',
      account_name: '',
      account_no: '',
      note: null,
    })
    // 提交成功后走静默后台刷新，把保证金读数与台账换一遍（首屏 1 次 + 提交后 1 次）
    expect(mocks.depositSummary).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('keeps the deposit withdrawal entry disabled below the withdraw threshold', async () => {
    mocks.depositSummary.mockResolvedValue({
      withdrawable_balance_cny: 0,
      pending_withdraw_cny: 0,
      paid_withdraw_cny: 2000,
      withdrawals: [],
    })
    const wrapper = renderPage()
    await flushPromises()

    const button = pageButton(wrapper, '提现保证金')
    expect(button.attributes('disabled')).toBeDefined()

    await button.trigger('click')
    await flushPromises()
    // 入口点不动，弹窗不该开（也就不会有提交）
    expect(document.querySelector('.t73-dialog')).toBeNull()
    expect(mocks.createDepositWithdrawal).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
