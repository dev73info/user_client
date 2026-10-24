import { describe, expect, it } from 'vitest'
import { afterSalesBadgeText, countOpenCasesByRequirement } from '@/shared/afterSalesStatus'

/**
 * 列表角标这一层只做两件事：读数怎么收、按需求数什么。
 *
 * 原来那张 `isAwaitingViewerAction` 的用例随函数一起删掉了——它靠
 * `viewerRole` / `customerDecision` / `developerDecision` 判「在等我表态」，
 * 这三个字段契约里都没有（`CaseSummaryResponse` 只有 `open` 与 `filed_by` / `respondent`），
 * 角标因此只表达「这条需求有争议在办」。
 */

describe('解除合作角标读数 afterSalesBadgeText', () => {
  it('超过 99 收成 99+，与工作台菜单角标同口径', () => {
    expect(afterSalesBadgeText(1)).toBe('1')
    expect(afterSalesBadgeText(99)).toBe('99')
    expect(afterSalesBadgeText(100)).toBe('99+')
  })
})

describe('按需求数在办案件 countOpenCasesByRequirement', () => {
  it('只数在办且已有对方当事人的案件，同一需求多案累加、不产生空键', () => {
    const counts = countOpenCasesByRequirement([
      { requirement_id: 'R1', open: true, respondent: 'developer' },
      { requirement_id: 'R1', open: true, respondent: 'customer' },
      { requirement_id: 'R1', open: false, respondent: 'developer' },
      { requirement_id: 'R1', open: true, respondent: null },
      { requirement_id: 'R2', open: true, respondent: 'developer' },
    ])
    expect(counts).toEqual({ R1: 2, R2: 1 })
  })

  it('一件在办都没有时返回空对象，角标据此不渲染', () => {
    expect(countOpenCasesByRequirement([])).toEqual({})
    expect(
      countOpenCasesByRequirement([{ requirement_id: 'R1', open: false, respondent: null }]),
    ).toEqual({})
  })
})
