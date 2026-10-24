import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useRequirementBreach } from '@/composables/useRequirementBreach'
import type { RequirementItem } from '@/api/requirements'
import type { ContractSigningStatus } from '@/shared/contracts'
import { breachCaseDetail, breachCaseItem, breachCaseResponse } from './helpers/breachCase'

/**
 * 解除合作域编排层（写动作）：申报、表态、撤回、重新申报。
 *
 * 三条契约口径在这里钉死：
 * - 申报走 `POST /api/requirement/{id}/termination`，只有一段事实与依据；
 * - 表态 / 撤回的路径参数是**案号**（不是数字 id），表态只有 `approve` / `reject`；
 * - 没写说明时请求体只带 `action`（契约里 `note` 可选，空串与「不写」含义不同）。
 *
 * 「申请平台介入」没有契约端点，那条用例随动作一起删了。
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
const CASE_NO = 'BC-20261028153000-AB12'
/** 夹具里立案人是 alice、对方当事人是 bob（见 `helpers/breachCase`）。 */
const FILER = 'alice'
const RESPONDENT = 'bob'

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

function setup(username: string = FILER) {
  return useRequirementBreach({
    token: () => 'token',
    username: () => username,
    contractOf: () => SIGNED,
  })
}

/** 让「提交成功后重取案件」这条路有东西可返回。 */
function withCase(item = breachCaseItem()) {
  mocks.getCase.mockResolvedValue(breachCaseResponse(item, RID))
  mocks.getDetail.mockResolvedValue(breachCaseDetail())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('解除合作 composable：申报', () => {
  it('理由为空或不足 5 个字都拦下，不发请求', async () => {
    const breach = setup()
    breach.breachRequirement.value = requirement()

    await breach.submitBreachReport()
    expect(mocks.report).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('请填写解除合作的事实和相关依据', 'warning')

    breach.breachReason.value = '  太短  '
    await breach.submitBreachReport()
    expect(mocks.report).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith('事实与依据至少 5 个字', 'warning')
  })

  it('申报走 termination，成功后重取案件并提示等对方表态', async () => {
    withCase()
    mocks.report.mockResolvedValue({
      requirement_id: RID,
      case_no: CASE_NO,
      status: 'negotiating',
      existing: false,
    })
    const breach = setup()
    breach.breachRequirement.value = requirement()
    breach.breachReason.value = '  对方连续两周未交付  '

    await breach.submitBreachReport()

    expect(mocks.report).toHaveBeenCalledWith('token', RID, '对方连续两周未交付')
    expect(mocks.toast).toHaveBeenCalledWith('解除合作申请已提交，等待对方表态', 'success')
    expect(breach.breachNewRound.value).toBe(false)
    expect(breach.breachCase.value?.case_no).toBe(CASE_NO)
  })

  it('已有在办案件时（existing）提示打开的是那一条', async () => {
    withCase()
    mocks.report.mockResolvedValue({
      requirement_id: RID,
      case_no: CASE_NO,
      status: 'negotiating',
      existing: true,
    })
    const breach = setup()
    breach.breachRequirement.value = requirement()
    breach.breachReason.value = '对方连续两周未交付'

    await breach.submitBreachReport()

    expect(mocks.toast).toHaveBeenCalledWith('该需求已有在办案件，已为你打开那一条', 'success')
  })
})

describe('解除合作 composable：撤回 / 表态', () => {
  it('撤回用案号，成功后收起二次确认并重取案件', async () => {
    withCase(breachCaseItem({ status: 'withdrawn', is_open: false }))
    const breach = setup()
    breach.breachRequirement.value = requirement()
    breach.breachCase.value = breachCaseItem()
    breach.openBreachWithdrawConfirm()
    expect(breach.breachWithdrawConfirm.value).toBe(true)

    await breach.submitBreachWithdraw()

    expect(mocks.withdraw).toHaveBeenCalledWith('token', CASE_NO, '当事人撤回申请')
    expect(breach.breachWithdrawConfirm.value).toBe(false)
    expect(breach.breachCase.value?.status).toBe('withdrawn')
  })

  it('没有在办案件时表态与撤回都不发请求', async () => {
    const breach = setup(RESPONDENT)
    await breach.submitBreachDecision('approve')
    await breach.submitBreachWithdraw()
    expect(mocks.respond).not.toHaveBeenCalled()
    expect(mocks.withdraw).not.toHaveBeenCalled()
  })

  it('表态：没写说明时只带 action，写了才带 note', async () => {
    withCase()
    const breach = setup(RESPONDENT)
    breach.breachCase.value = breachCaseItem()

    await breach.submitBreachDecision('approve')
    expect(mocks.respond).toHaveBeenCalledWith('token', CASE_NO, 'approve')
    expect(mocks.toast).toHaveBeenCalledWith('已同意解除合作，等待平台按协商一致处理', 'success')

    breach.breachDecisionNote.value = '  同意，希望尽快结单  '
    await breach.submitBreachDecision('reject')
    expect(mocks.respond).toHaveBeenLastCalledWith('token', CASE_NO, 'reject', '同意，希望尽快结单')
    expect(mocks.toast).toHaveBeenCalledWith('已表示不同意，案件转平台裁决', 'success')
    expect(breach.breachDecisionNote.value).toBe('')
  })

  it('重新申报：进入新一轮表单、清空理由，上一轮案件留着给说明引用', () => {
    const breach = setup()
    breach.breachCase.value = breachCaseItem({ status: 'rejected', is_open: false })
    breach.breachReason.value = '旧理由'
    breach.breachWithdrawConfirm.value = true

    breach.reopenBreachReport()

    expect(breach.breachNewRound.value).toBe(true)
    expect(breach.breachReason.value).toBe('')
    expect(breach.breachWithdrawConfirm.value).toBe(false)
    expect(breach.breachCase.value?.status).toBe('rejected')
  })
})
