import { describe, expect, it } from 'vitest'

import type { RequirementBreachCaseItem } from '@/api/afterSales'
import {
  breachDialogTitle,
  breachRoundHint,
  breachSubmitLabel,
  breachWithdrawnByMe,
  canRespondBreachCase,
  canWithdrawBreachCase,
  isBreachCaseSettled,
} from '@/shared/requirementBreach'

/**
 * 解除合作案件的判定与文案：视图没有挂载测试，这一层就是唯一的回归网。
 * 钉住的是口径（谁是谁、沿用同一条还是新建一条），不是实现。
 *
 * 夹具字段全部照契约 `BreachCaseItemResponse`：`status` / `is_open` / `filed_by` /
 * `respondent` / `turn`。契约里没有「AI 判定」「责任认定」「双方表态列」这些读数，
 * 所以这三类判定连同它们的用例一起删了（原先它们依赖 `customerDecision` 等不存在的字段）。
 */

const FILER = 'alice'
const RESPONDENT = 'bob'

/** 解除合作案件：只给判定用得到的字段。 */
function breachCase(patch: Partial<RequirementBreachCaseItem> = {}): RequirementBreachCaseItem {
  return {
    case_no: 'BC-20261028153000-AB12',
    kind: 'mutual_unbind',
    kind_label: '协商解除',
    status: 'negotiating',
    status_label: '协商中',
    is_open: true,
    filed_by: FILER,
    respondent: RESPONDENT,
    claim_amount_fen: 0,
    claim_amount_cny: 0,
    opened_at: '2026-10-28 15:30:00',
    turn: 'respondent',
    turn_label: `等待 ${RESPONDENT} 表态`,
    ...patch,
  }
}

describe('解除合作：谁能做什么', () => {
  it('表态的是「对方当事人」：立案人自己与无关账号都不行', () => {
    const item = breachCase()
    expect(canRespondBreachCase(item, RESPONDENT)).toBe(true)
    expect(canRespondBreachCase(item, FILER)).toBe(false)
    expect(canRespondBreachCase(item, 'carol')).toBe(false)
  })

  it('表态只在 filed / negotiating 的窗口内（与后端 can_transition 同一口径）', () => {
    expect(canRespondBreachCase(breachCase({ status: 'filed' }), RESPONDENT)).toBe(true)
    expect(canRespondBreachCase(breachCase({ status: 'platform_review' }), RESPONDENT)).toBe(false)
    expect(canRespondBreachCase(breachCase({ status: 'decided' }), RESPONDENT)).toBe(false)
    expect(canRespondBreachCase(breachCase({ status: 'mutual_agreed' }), RESPONDENT)).toBe(false)
    expect(canRespondBreachCase(null, RESPONDENT)).toBe(false)
  })

  it('案件未在办（is_open = false）时不能表态', () => {
    expect(
      canRespondBreachCase(breachCase({ status: 'negotiating', is_open: false }), RESPONDENT),
    ).toBe(false)
  })

  it('只有立案人能在 filed / negotiating / platform_review 撤回', () => {
    expect(canWithdrawBreachCase(breachCase({ status: 'negotiating' }), FILER)).toBe(true)
    expect(canWithdrawBreachCase(breachCase({ status: 'platform_review' }), FILER)).toBe(true)
    expect(canWithdrawBreachCase(breachCase({ status: 'decided' }), FILER)).toBe(false)
    expect(canWithdrawBreachCase(breachCase({ status: 'negotiating' }), RESPONDENT)).toBe(false)
    expect(canWithdrawBreachCase(null, FILER)).toBe(false)
  })

  it('撤回人是不是本人：决定「重新发起」还是「首次申报」', () => {
    expect(breachWithdrawnByMe(breachCase({ status: 'withdrawn' }), FILER)).toBe(true)
    expect(breachWithdrawnByMe(breachCase({ status: 'withdrawn' }), RESPONDENT)).toBe(false)
    expect(breachWithdrawnByMe(breachCase({ status: 'negotiating' }), FILER)).toBe(false)
    expect(breachWithdrawnByMe(null, FILER)).toBe(false)
  })

  it('已收口只有结案与驳回两支（协商一致还在办，撤回不算结论）', () => {
    expect(isBreachCaseSettled(breachCase({ status: 'closed', is_open: false }))).toBe(true)
    expect(isBreachCaseSettled(breachCase({ status: 'rejected', is_open: false }))).toBe(true)
    expect(isBreachCaseSettled(breachCase({ status: 'mutual_agreed' }))).toBe(false)
    expect(isBreachCaseSettled(breachCase({ status: 'withdrawn', is_open: false }))).toBe(false)
    expect(isBreachCaseSettled(null)).toBe(false)
  })
})

describe('解除合作：标题 / 按钮 / 上一轮说明的口径', () => {
  it('有案件在跟踪时标题写「进展」，不再是发起表单', () => {
    expect(breachDialogTitle(breachCase(), false, true)).toBe('解除合作进展')
    expect(breachDialogTitle(breachCase(), true, true)).toBe('发起新的解除合作')
  })

  it('撤回后沿用同一条案件：本人措辞是「重新发起」，对方撤回时是首次申报', () => {
    const withdrawn = breachCase({ status: 'withdrawn', is_open: false })
    // 点「重新发起」之前先看进展（`newRound` 还是 false），点了才切到申报表单。
    expect(breachDialogTitle(withdrawn, false, true)).toBe('解除合作进展')
    expect(breachDialogTitle(withdrawn, true, true)).toBe('重新发起解除合作')
    expect(breachDialogTitle(withdrawn, true, false)).toBe('解除合作')
    expect(breachSubmitLabel(withdrawn, false, true)).toBe('重新发起')
    expect(breachSubmitLabel(withdrawn, true, false)).toBe('提交解除合作申请')
  })

  it('还什么都没有时就是「解除合作」+「提交解除合作申请」', () => {
    expect(breachDialogTitle(null, false, false)).toBe('解除合作')
    expect(breachSubmitLabel(null, false, false)).toBe('提交解除合作申请')
    expect(breachSubmitLabel(null, true, false)).toBe('发起新一轮解除合作')
  })

  it('撤回：说明本次沿用同一条案件（编号不变），发起人不同措辞不同', () => {
    const withdrawn = breachCase({ status: 'withdrawn', is_open: false })
    expect(breachRoundHint(withdrawn, true)).toContain('上一轮由你撤回')
    expect(breachRoundHint(withdrawn, true)).toContain('沿用同一条案件')
    expect(breachRoundHint(withdrawn, false)).toContain('上一轮由对方申请后撤回')
    expect(breachRoundHint(withdrawn, false)).toContain('沿用同一条案件')
  })

  it('结案：合同已作废、需求退回大厅，要说清「重新接单并签约」而不是「新建案件」', () => {
    const hint = breachRoundHint(breachCase({ status: 'closed', is_open: false }), true)
    expect(hint).toContain('原合同已作废')
    expect(hint).toContain('重新接单并签约')
    expect(hint).not.toContain('新建一条案件')
  })

  it('驳回：结论不能翻案，本次新建一条案件', () => {
    expect(breachRoundHint(breachCase({ status: 'rejected', is_open: false }), true)).toContain(
      '新建一条案件',
    )
    expect(breachRoundHint(null, true)).toBe('')
  })
})
