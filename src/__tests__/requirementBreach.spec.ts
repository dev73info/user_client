import { describe, expect, it } from 'vitest'

import type { AdapayBreachCase } from '@/api/adapay'
import {
  breachDecisionText,
  breachDialogTitle,
  breachLiablePartyLabel,
  breachRoundHint,
  breachSubmitLabel,
  breachVerdictSourceText,
  breachWithdrawnByMe,
  canDecideBreachCase,
  canRequestPlatformReview,
  canRespondTermination,
  canWithdrawBreachCase,
  isTerminationNegotiating,
  showBreachDecisions,
} from '@/shared/requirementBreach'

/**
 * 解除合作案件的判定与文案：视图没有挂载测试，这一层就是唯一的回归网。
 * 钉住的是口径（谁是谁、沿用同一条还是新建一条），不是实现。
 */

const ME = 'client_view'

/** 解除合作案件：只给判定用得到的字段。 */
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

describe('解除合作：责任方与表态文案', () => {
  it('责任方三档 + 协商一致', () => {
    expect(breachLiablePartyLabel('customer')).toBe('客户（需求方）违约')
    expect(breachLiablePartyLabel('mutual')).toBe('双方协商一致（无责退出）')
    expect(breachLiablePartyLabel('developer')).toBe('开发者违约')
  })

  it('未表态与两种表态', () => {
    expect(breachDecisionText(null)).toBe('未表态')
    expect(breachDecisionText(undefined)).toBe('未表态')
    expect(breachDecisionText('accepted')).toBe('已接受 AI 判定')
    expect(breachDecisionText('rejected')).toBe('不接受 AI 判定')
  })

  it('判定来源：协商一致不能被说成客服人工判定', () => {
    expect(breachVerdictSourceText('ai')).toBe('双方接受 AI 判定')
    expect(breachVerdictSourceText('mutual')).toBe('双方协商一致')
    expect(breachVerdictSourceText('support')).toBe('客服人工判定')
    expect(breachVerdictSourceText(null)).toBe('客服人工判定')
  })

  it('双方表态只在 AI 判定后展示', () => {
    expect(showBreachDecisions(breachCase({ status: 'submitted' }))).toBe(false)
    expect(showBreachDecisions(breachCase({ status: 'ai_judged' }))).toBe(true)
    expect(showBreachDecisions(breachCase({ status: 'support_reviewing' }))).toBe(false)
    expect(
      showBreachDecisions(
        breachCase({ status: 'support_reviewing', customerDecision: 'accepted' }),
      ),
    ).toBe(true)
  })
})

describe('解除合作：谁能做什么', () => {
  it('AI 判定后本人还没表态才需要选接受 / 不接受', () => {
    expect(canDecideBreachCase(breachCase({ status: 'ai_judged' }))).toBe(true)
    expect(
      canDecideBreachCase(breachCase({ status: 'ai_judged', customerDecision: 'accepted' })),
    ).toBe(false)
    expect(canDecideBreachCase(breachCase({ status: 'support_reviewing' }))).toBe(false)
    expect(canDecideBreachCase(null)).toBe(false)
  })

  it('表态视角按调用侧切换：需求方看 customerDecision，开发者看 developerDecision', () => {
    const judged = breachCase({ status: 'ai_judged' })
    // 需求方已表态、开发者还没表态：两侧结论必须相反，否则一侧会替另一侧表态
    const peerDecided = breachCase({ status: 'ai_judged', customerDecision: 'accepted' })
    expect(canDecideBreachCase(peerDecided)).toBe(false)
    expect(canDecideBreachCase(peerDecided, 'creator')).toBe(false)
    expect(canDecideBreachCase(peerDecided, 'dev')).toBe(true)

    const mineDecided = breachCase({ status: 'ai_judged', developerDecision: 'rejected' })
    expect(canDecideBreachCase(mineDecided, 'dev')).toBe(false)
    expect(canDecideBreachCase(mineDecided, 'creator')).toBe(true)
    // 两边都没表态 / 还没出 AI 判定
    expect(canDecideBreachCase(judged, 'dev')).toBe(true)
    expect(canDecideBreachCase(breachCase({ status: 'support_reviewing' }), 'dev')).toBe(false)
    expect(canDecideBreachCase(null, 'dev')).toBe(false)
  })

  it('只有协商中（submitted）能申请平台介入', () => {
    expect(canRequestPlatformReview(breachCase({ status: 'submitted' }))).toBe(true)
    expect(canRequestPlatformReview(breachCase({ status: 'ai_reviewing' }))).toBe(false)
    expect(canRequestPlatformReview(null)).toBe(false)
  })

  it('协商阶段 = submitted 且双方都还没表态', () => {
    expect(isTerminationNegotiating(breachCase())).toBe(true)
    expect(isTerminationNegotiating(breachCase({ mutualAgreedAt: '2026-10-02T10:00:00Z' }))).toBe(
      false,
    )
    expect(isTerminationNegotiating(breachCase({ mutualRejectedAt: '2026-10-02T10:00:00Z' }))).toBe(
      false,
    )
    expect(isTerminationNegotiating(breachCase({ status: 'ai_judged' }))).toBe(false)
  })

  it('表态的是「非发起人」，发起人自己只能等对方回应', () => {
    const mine = breachCase({ reportedBy: ME })
    expect(canRespondTermination(mine, ME)).toBe(false)
    expect(canRespondTermination(mine, 'developer_side')).toBe(true)
    expect(canRespondTermination(breachCase({ status: 'ai_judged' }), 'developer_side')).toBe(false)
  })

  it('只有本人能在判定 / 客服介入之前撤回，判完就不给撤了', () => {
    expect(canWithdrawBreachCase(breachCase({ status: 'submitted' }), ME)).toBe(true)
    expect(canWithdrawBreachCase(breachCase({ status: 'ai_reviewing' }), ME)).toBe(true)
    expect(canWithdrawBreachCase(breachCase({ status: 'ai_judged' }), ME)).toBe(false)
    expect(canWithdrawBreachCase(breachCase({ status: 'submitted' }), 'developer_side')).toBe(false)
    expect(canWithdrawBreachCase(null, ME)).toBe(false)
  })

  it('撤回人是不是本人：决定「重新发起」还是「首次申报」', () => {
    expect(breachWithdrawnByMe(breachCase({ status: 'withdrawn' }), ME)).toBe(true)
    expect(breachWithdrawnByMe(breachCase({ status: 'withdrawn' }), 'developer_side')).toBe(false)
    expect(breachWithdrawnByMe(breachCase({ status: 'submitted' }), ME)).toBe(false)
    expect(breachWithdrawnByMe(null, ME)).toBe(false)
  })
})

describe('解除合作：标题 / 按钮 / 上一轮说明的口径', () => {
  it('有案件在跟踪时标题写「进展」，不再是发起表单', () => {
    expect(breachDialogTitle(breachCase(), false, true)).toBe('解除合作进展')
    expect(breachDialogTitle(breachCase(), true, true)).toBe('发起新的解除合作')
  })

  it('撤回后沿用同一条案件：本人措辞是「重新发起」，对方撤回时是首次申报', () => {
    const withdrawn = breachCase({ status: 'withdrawn' })
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
    const withdrawn = breachCase({ status: 'withdrawn' })
    expect(breachRoundHint(withdrawn, true)).toContain('上一轮由你撤回')
    expect(breachRoundHint(withdrawn, true)).toContain('沿用同一条案件')
    expect(breachRoundHint(withdrawn, false)).toContain('上一轮由对方申请后撤回')
    expect(breachRoundHint(withdrawn, false)).toContain('沿用同一条案件')
  })

  it('结案：合同已作废、需求退回大厅，要说清「重新接单并签约」而不是「新建案件」', () => {
    const hint = breachRoundHint(breachCase({ status: 'succeeded' }), true)
    expect(hint).toContain('原合同已作废')
    expect(hint).toContain('重新接单并签约')
    expect(hint).not.toContain('新建一条案件')
  })

  it('驳回：结论不能翻案，本次新建一条案件', () => {
    expect(breachRoundHint(breachCase({ status: 'rejected' }), true)).toContain('新建一条案件')
    expect(breachRoundHint(null, true)).toBe('')
  })
})
