import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementBreach } from '@/composables/useRequirementBreach'
import type { AdapayBreachCase } from '@/api/adapay'
import type { RequirementItem } from '@/api/requirements'
import type { ContractSigningStatus } from '@/shared/contracts'

/**
 * 解除合作域编排层：入口条件必须靠**注入的合同事实**判断（不能在 composable 里再查一遍
 * 「有没有合同」），身份靠注入的用户名，`close()` 的五个 loading 守卫一个都不能漏。
 */

const mocks = vi.hoisted(() => ({
  getCase: vi.fn(),
  report: vi.fn(),
  platformReview: vi.fn(),
  decide: vi.fn(),
  withdraw: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/adapay', () => ({
  getAdapayBreachCase: mocks.getCase,
  reportAdapayTermination: mocks.report,
  requestAdapayPlatformReview: mocks.platformReview,
  submitAdapayBreachDecision: mocks.decide,
  withdrawAdapayBreach: mocks.withdraw,
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

const ME = 'client_view'

function breachCase(patch: Partial<AdapayBreachCase> = {}): AdapayBreachCase {
  return {
    id: 11,
    caseNo: 'BREACH_11',
    requirementId: '2026-900000000201',
    paymentId: 'pay_1',
    reportedBy: ME,
    reason: '交付内容与合同不符',
    status: 'submitted',
    depositAmountFen: 200000,
    depositAmountCny: '2000.00',
    refundAmountFen: 0,
    refundAmountCny: '0.00',
    compensationAmountFen: 0,
    compensationAmountCny: '0.00',
    extraCompensationFen: 0,
    extraCompensationCny: '0.00',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-01T10:00:00Z',
    ...patch,
  }
}

/** 需求单：担保模式、开发中（可以申报解除合作）。 */
function requirement(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    requirement_id: '2026-900000000201',
    title: '小程序首页改版',
    creator: ME,
    status: 'in_development',
    payment_mode: 'platform_guarantee',
    budget: 10000,
    ...patch,
  } as RequirementItem
}

const SIGNED: ContractSigningStatus = {
  has_contract: true,
  status: 2,
  party_a_signed: true,
  party_b_signed: true,
}

/** 只签了一方：「有合同但没签完」，这时同样没有可裁决的生效合同。 */
const HALF_SIGNED: ContractSigningStatus = {
  has_contract: true,
  status: 1,
  party_a_signed: true,
  party_b_signed: false,
}

function setup(options: { username?: string; contract?: ContractSigningStatus | null } = {}) {
  return useRequirementBreach({
    token: () => 'token',
    username: () => options.username ?? ME,
    // `undefined` 用默认的「已签完」；显式传 `null` 表示这条需求查不到合同。
    contractOf: () => (options.contract === undefined ? SIGNED : options.contract),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('解除合作 composable：合同事实与身份都靠注入', () => {
  it('有生效合同时才允许发起新一轮（判据来自注入的签约状态）', () => {
    const signed = setup({ contract: SIGNED })
    signed.breachRequirement.value = requirement()
    expect(signed.breachCanStartNewRound.value).toBe(true)

    const unsigned = setup({ contract: HALF_SIGNED })
    unsigned.breachRequirement.value = requirement()
    expect(unsigned.breachCanStartNewRound.value).toBe(false)

    const noContract = setup({ contract: null })
    noContract.breachRequirement.value = requirement()
    expect(noContract.breachCanStartNewRound.value).toBe(false)
  })

  it('无担保模式没有合同，不给发起', () => {
    const selfManaged = setup({ contract: SIGNED })
    selfManaged.breachRequirement.value = requirement({ payment_mode: 'self_managed' })
    expect(selfManaged.breachCanStartNewRound.value).toBe(false)
  })

  it('撤回 / 表态 / 可撤回都按注入的当前登录人算', () => {
    const breach = setup({ username: ME })
    breach.breachCase.value = breachCase({ status: 'withdrawn' })
    expect(breach.breachWithdrawnByMe.value).toBe(true)

    breach.breachCase.value = breachCase({ status: 'submitted', reportedBy: 'developer_side' })
    expect(breach.breachCanRespond.value).toBe(true)
    expect(breach.breachCanWithdraw.value).toBe(false)
  })
})

describe('解除合作 composable：打开 / 关闭', () => {
  it('打开时先按注入的合同事实过一遍入口，再取案件', async () => {
    mocks.getCase.mockResolvedValue(breachCase({ status: 'submitted' }))
    const breach = setup({ contract: SIGNED })

    await breach.openBreachReport(requirement())

    expect(mocks.getCase).toHaveBeenCalledWith('token', '2026-900000000201')
    expect(breach.breachVisible.value).toBe(true)
    expect(breach.breachCase.value?.caseNo).toBe('BREACH_11')
    expect(breach.breachCaseLoading.value).toBe(false)
  })

  it('入口条件不成立（无合同 / 状态不对）就什么都不做', async () => {
    const unsigned = setup({ contract: HALF_SIGNED })
    await unsigned.openBreachReport(requirement({ status: 'pending_deposit' }))
    expect(mocks.getCase).not.toHaveBeenCalled()
    expect(unsigned.breachVisible.value).toBe(false)

    const refused = setup({ contract: SIGNED })
    await refused.openBreachReport(requirement({ status: 'completed' }))
    expect(mocks.getCase).not.toHaveBeenCalled()
  })

  it('案件加载失败只弹 toast，弹窗仍然打开（表单可以继续申报）', async () => {
    mocks.getCase.mockRejectedValue(new Error('网络开小差'))
    const breach = setup()
    await breach.openBreachReport(requirement())
    expect(mocks.toast).toHaveBeenCalledWith('网络开小差', 'error')
    expect(breach.breachVisible.value).toBe(true)
    expect(breach.breachCase.value).toBeNull()
  })

  it('五个 loading 任意一个在跑都不关（漏掉一个就会中断请求）', () => {
    const breach = setup()
    const guards = [
      'breachLoading',
      'platformReviewLoading',
      'breachWithdrawLoading',
      'breachDecisionLoading',
      'breachCaseLoading',
    ] as const

    for (const guard of guards) {
      breach.breachVisible.value = true
      breach.breachRequirement.value = requirement()
      breach.breachReason.value = '理由'
      breach[guard].value = true
      breach.closeBreachReport()
      expect(breach.breachVisible.value, `${guard} 在跑时不该关闭弹窗`).toBe(true)
      expect(breach.breachRequirement.value).not.toBeNull()
      breach[guard].value = false
      breach.closeBreachReport()
      expect(breach.breachVisible.value, `${guard} 结束后应当能关闭`).toBe(false)
    }
  })

  it('关闭会清干净草稿与二次确认态', () => {
    const breach = setup()
    breach.breachVisible.value = true
    breach.breachRequirement.value = requirement()
    breach.breachReason.value = '理由'
    breach.breachNewRound.value = true
    breach.breachRejectPanel.value = true
    breach.breachDecisionNote.value = '说明'
    breach.breachWithdrawConfirm.value = true

    breach.closeBreachReport()

    expect(breach.breachVisible.value).toBe(false)
    expect(breach.breachRequirement.value).toBeNull()
    expect(breach.breachReason.value).toBe('')
    expect(breach.breachNewRound.value).toBe(false)
    expect(breach.breachRejectPanel.value).toBe(false)
    expect(breach.breachDecisionNote.value).toBe('')
    expect(breach.breachWithdrawConfirm.value).toBe(false)
  })
})

describe('解除合作 composable：申报 / 撤回 / 表态', () => {
  it('申报成功会新建案件并提示先协商，理由为空则拦下', async () => {
    const breach = setup()
    breach.breachRequirement.value = requirement()

    await breach.submitBreachReport()
    expect(mocks.report).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('请填写解除合作的事实和相关依据', 'warning')

    mocks.report.mockResolvedValue(breachCase())
    breach.breachReason.value = '  对方连续两周未交付  '
    await breach.submitBreachReport()

    expect(mocks.report).toHaveBeenCalledWith('token', '2026-900000000201', '对方连续两周未交付')
    expect(mocks.toast).toHaveBeenCalledWith('解除合作申请已提交，请先与对方协商', 'success')
    expect(breach.breachNewRound.value).toBe(false)
    expect(breach.breachCase.value?.caseNo).toBe('BREACH_11')
  })

  it('撤回成功后收起二次确认', async () => {
    mocks.withdraw.mockResolvedValue(breachCase({ status: 'withdrawn' }))
    const breach = setup()
    breach.breachCase.value = breachCase()
    breach.openBreachWithdrawConfirm()
    expect(breach.breachWithdrawConfirm.value).toBe(true)

    await breach.submitBreachWithdraw()

    expect(mocks.withdraw).toHaveBeenCalledWith('token', 11)
    expect(breach.breachWithdrawConfirm.value).toBe(false)
    expect(breach.breachCase.value?.status).toBe('withdrawn')
  })

  it('协商阶段表态与 AI 判定阶段表态的提示语不同（同一句「不同意」含义不一样）', async () => {
    mocks.decide.mockResolvedValue(breachCase({ status: 'ai_judged' }))
    const breach = setup()
    breach.breachCase.value = breachCase({ status: 'submitted', reportedBy: 'developer_side' })

    await breach.submitBreachDecision('rejected')
    expect(mocks.decide).toHaveBeenCalledWith('token', 11, 'rejected', '')
    expect(mocks.toast).toHaveBeenCalledWith('已表示不同意，任一方可申请平台介入', 'success')

    breach.breachCase.value = breachCase({ status: 'ai_judged' })
    await breach.submitBreachDecision('rejected')
    expect(mocks.toast).toHaveBeenCalledWith('已提交不接受，案件转客服人工判定', 'success')
  })

  it('申请平台介入后刷新案件', async () => {
    mocks.platformReview.mockResolvedValue(breachCase({ status: 'ai_reviewing' }))
    const breach = setup()
    breach.breachCase.value = breachCase()

    await breach.submitPlatformReview()

    expect(mocks.platformReview).toHaveBeenCalledWith('token', 11)
    expect(breach.breachCase.value?.status).toBe('ai_reviewing')
    expect(breach.platformReviewLoading.value).toBe(false)
  })

  it('重新申报：进入新一轮表单、清空理由，上一轮案件留着给说明引用', () => {
    const breach = setup()
    breach.breachCase.value = breachCase({ status: 'rejected' })
    breach.breachReason.value = '旧理由'
    breach.breachWithdrawConfirm.value = true

    breach.reopenBreachReport()

    expect(breach.breachNewRound.value).toBe(true)
    expect(breach.breachReason.value).toBe('')
    expect(breach.breachWithdrawConfirm.value).toBe(false)
    expect(breach.breachCase.value?.status).toBe('rejected')
  })
})
