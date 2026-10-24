import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementBreach } from '@/composables/useRequirementBreach'
import type { RequirementItem } from '@/api/requirements'
import type { ContractSigningStatus } from '@/shared/contracts'
import { breachCaseDetail, breachCaseItem, breachCaseResponse } from './helpers/breachCase'

/**
 * 解除合作域编排层（读取与开关）：入口条件必须靠**注入的合同事实**判断
 * （不能在 composable 里再查一遍「有没有合同」），身份靠注入的用户名，
 * `close()` 的四个 loading 守卫一个都不能漏。
 *
 * 契约口径：读 `GET /api/requirement/{id}/breach-case`（`has_case = false` 是正常空态）。
 * 申报 / 表态 / 撤回的接线在 `requirementBreachActions.spec.ts`。
 */

const mocks = vi.hoisted(() => ({
  getCase: vi.fn(),
  getDetail: vi.fn(),
  report: vi.fn(),
  respond: vi.fn(),
  withdraw: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/afterSales', () => ({
  getRequirementBreachCase: mocks.getCase,
  getAfterSalesCase: mocks.getDetail,
  reportTermination: mocks.report,
  respondAfterSalesCase: mocks.respond,
  withdrawAfterSalesCase: mocks.withdraw,
  listMyAfterSalesCases: vi.fn(),
  openAfterSalesCase: vi.fn(),
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

const RID = '2026-900000000201'
/** 夹具里立案人是 alice、对方当事人是 bob（见 `helpers/breachCase`）。 */
const FILER = 'alice'
const RESPONDENT = 'bob'

/** 需求单：担保模式、开发中（可以申报解除合作）。 */
function requirement(patch: Partial<RequirementItem> = {}): RequirementItem {
  return {
    requirement_id: RID,
    title: '小程序首页改版',
    creator: FILER,
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
    username: () => options.username ?? FILER,
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
    const filer = setup({ username: FILER })
    filer.breachCase.value = breachCaseItem()
    expect(filer.breachCanWithdraw.value).toBe(true)
    expect(filer.breachCanRespond.value).toBe(false)

    const respondent = setup({ username: RESPONDENT })
    respondent.breachCase.value = breachCaseItem()
    expect(respondent.breachCanRespond.value).toBe(true)
    expect(respondent.breachCanWithdraw.value).toBe(false)

    filer.breachCase.value = breachCaseItem({ status: 'withdrawn', is_open: false })
    expect(filer.breachWithdrawnByMe.value).toBe(true)
  })
})

describe('解除合作 composable：打开 / 关闭', () => {
  it('打开时先按注入的合同事实过一遍入口，再取案件与详情', async () => {
    mocks.getCase.mockResolvedValue(breachCaseResponse(breachCaseItem(), RID))
    mocks.getDetail.mockResolvedValue(breachCaseDetail())
    const breach = setup({ contract: SIGNED })

    await breach.openBreachReport(requirement())

    expect(mocks.getCase).toHaveBeenCalledWith('token', RID)
    expect(mocks.getDetail).toHaveBeenCalledWith('token', 'BC-20261028153000-AB12')
    expect(breach.breachVisible.value).toBe(true)
    expect(breach.breachCase.value?.case_no).toBe('BC-20261028153000-AB12')
    expect(breach.breachCaseDetail.value?.claim_note).toBe('交付内容与合同不符')
    expect(breach.breachCaseLoading.value).toBe(false)
  })

  it('没有案件时（has_case = false）是正常空态：弹窗照开，只是不出案件块', async () => {
    mocks.getCase.mockResolvedValue(breachCaseResponse(null, RID))
    const breach = setup({ contract: SIGNED })

    await breach.openBreachReport(requirement())

    expect(breach.breachVisible.value).toBe(true)
    expect(breach.breachCase.value).toBeNull()
    expect(breach.breachCaseDetail.value).toBeNull()
    // 没有案件就没有详情可取，也不该弹错
    expect(mocks.getDetail).not.toHaveBeenCalled()
    expect(mocks.toast).not.toHaveBeenCalled()
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

  it('四个 loading 任意一个在跑都不关（漏掉一个就会中断请求）', () => {
    const breach = setup()
    const guards = [
      'breachLoading',
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
    breach.breachDecisionNote.value = '说明'
    breach.breachWithdrawConfirm.value = true

    breach.closeBreachReport()

    expect(breach.breachVisible.value).toBe(false)
    expect(breach.breachRequirement.value).toBeNull()
    expect(breach.breachReason.value).toBe('')
    expect(breach.breachNewRound.value).toBe(false)
    expect(breach.breachDecisionNote.value).toBe('')
    expect(breach.breachWithdrawConfirm.value).toBe(false)
  })
})
