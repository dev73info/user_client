import { describe, expect, it } from 'vitest'
import {
  afterSalesBadgeText,
  countAwaitingCasesByRequirement,
  isAwaitingViewerAction,
  type AfterSalesActionSubject,
} from '@/shared/afterSalesStatus'

/** 构造一条案件：只写与待办判定相关的字段，其余给默认值（默认视角是开发者）。 */
function caseOf(overrides: Partial<AfterSalesActionSubject> = {}): AfterSalesActionSubject {
  return {
    status: 'submitted',
    openerRole: 'customer',
    viewerRole: 'developer',
    customerDecision: 'opened',
    developerDecision: null,
    ...overrides,
  }
}

describe('解除合作待办判定 isAwaitingViewerAction', () => {
  it('开发者在「待对方表态」且自己未表态时是待办', () => {
    expect(isAwaitingViewerAction(caseOf())).toBe(true)
    expect(isAwaitingViewerAction(caseOf({ status: 'support_reviewing' }))).toBe(true)
  })

  it('开发者表态之后不再是待办（每方只能表态一次）', () => {
    expect(isAwaitingViewerAction(caseOf({ developerDecision: 'accept' }))).toBe(false)
    expect(isAwaitingViewerAction(caseOf({ developerDecision: 'reject' }))).toBe(false)
  })

  it('发起人在「待表态」阶段只能撤回（可选动作），不算待办', () => {
    expect(isAwaitingViewerAction(caseOf({ viewerRole: 'customer' }))).toBe(false)
  })

  it('「待确认落实」与「返工中」只有发起人是待办', () => {
    for (const status of ['agreed', 'rework_pending']) {
      expect(isAwaitingViewerAction(caseOf({ status, viewerRole: 'customer' }))).toBe(true)
      expect(isAwaitingViewerAction(caseOf({ status, viewerRole: 'developer' }))).toBe(false)
    }
  })

  it('在等渠道回调或客服裁决的状态，对双方都不是待办', () => {
    for (const status of ['processing', 'manual_required', 'succeeded', 'rejected', 'withdrawn']) {
      expect(isAwaitingViewerAction(caseOf({ status, viewerRole: 'developer' }))).toBe(false)
      expect(isAwaitingViewerAction(caseOf({ status, viewerRole: 'customer' }))).toBe(false)
    }
  })

  it('无关方（viewerRole 为空）永远不是待办', () => {
    expect(isAwaitingViewerAction(caseOf({ viewerRole: null }))).toBe(false)
  })

  it('存量由开发者发起的案件按同一口径反向判定', () => {
    // 发起人是开发者时，要表态的一方变成需求方。
    const legacy = caseOf({
      openerRole: 'developer',
      viewerRole: 'customer',
      customerDecision: null,
    })
    expect(isAwaitingViewerAction(legacy)).toBe(true)
    expect(isAwaitingViewerAction({ ...legacy, viewerRole: 'developer' })).toBe(false)
  })
})

describe('解除合作待办角标读数 afterSalesBadgeText', () => {
  it('超过 99 收成 99+，与工作台菜单角标同口径', () => {
    expect(afterSalesBadgeText(1)).toBe('1')
    expect(afterSalesBadgeText(99)).toBe('99')
    expect(afterSalesBadgeText(100)).toBe('99+')
  })
})

describe('解除合作待办按需求计数 countAwaitingCasesByRequirement', () => {
  it('只数在等我动作的案件，同一需求多案累加、不产生空键', () => {
    const counts = countAwaitingCasesByRequirement([
      { ...caseOf(), requirementId: 'R1' },
      { ...caseOf({ status: 'support_reviewing' }), requirementId: 'R1' },
      // 已表态：不算待办，这条需求的计数不该被它拉高。
      { ...caseOf({ developerDecision: 'accept' }), requirementId: 'R1' },
      // 别的需求的案件不该混进来。
      { ...caseOf({ developerDecision: 'reject' }), requirementId: 'R2' },
    ])
    expect(counts).toEqual({ R1: 2 })
  })

  it('一件待办都没有时返回空对象，角标据此不渲染', () => {
    expect(countAwaitingCasesByRequirement([])).toEqual({})
    expect(
      countAwaitingCasesByRequirement([{ ...caseOf({ viewerRole: null }), requirementId: 'R1' }]),
    ).toEqual({})
  })
})
