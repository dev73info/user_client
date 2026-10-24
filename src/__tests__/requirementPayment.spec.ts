import { describe, expect, it } from 'vitest'

import {
  calculateFinalDepositAmount,
  calculateFinalPaymentAmount,
  isRequirementFinalPayment,
  requirementPayAmount,
  requirementPayStageLabel,
} from '@/shared/requirementPayment'

/**
 * 支付金额与阶段标签的唯一口径。
 *
 * 这个视图没有挂载测试，纯函数层是拆分后唯一的回归网：比例是**注入**的（`useMyRequirementsData`
 * 从 settings 接口取），所以这里只验「给定比例算出什么」，不验比例从哪来。
 */

describe('定金 / 尾款金额', () => {
  it('有比例时定金按比例、尾款按差额，两者相加等于总额', () => {
    const item = { budget: 10000 }
    expect(calculateFinalDepositAmount(item, 20)).toBe(2000)
    expect(calculateFinalPaymentAmount(item, 20)).toBe(8000)
    expect(calculateFinalDepositAmount(item, 20) + calculateFinalPaymentAmount(item, 20)).toBe(
      10000,
    )
  })

  it('比例为 0 / 非法 / 缺失时定金按全额（老口径，别在这里改成报错）', () => {
    const item = { budget: 500 }
    expect(calculateFinalDepositAmount(item, 0)).toBe(500)
    expect(calculateFinalDepositAmount(item, Number.NaN)).toBe(500)
    expect(calculateFinalPaymentAmount(item, 0)).toBe(0.01)
  })

  it('预算缺失时按 1 元兜底，预算为 0 或过小时地到 0.01 下限，不会算出 0 元订单', () => {
    // 缺 budget 走 `requirementBudgetAmount` 的 1 元兜底（老口径），不是 0.01。
    expect(calculateFinalDepositAmount({}, 20)).toBe(0.2)
    expect(calculateFinalDepositAmount({ budget: 0 }, 20)).toBe(0.01)
    expect(calculateFinalPaymentAmount({ budget: 0.01 }, 20)).toBe(0.01)
  })

  it('金额保留两位小数（预算带小数时不会出现长小数）', () => {
    expect(calculateFinalDepositAmount({ budget: 333.33 }, 33)).toBe(110)
    expect(calculateFinalPaymentAmount({ budget: 333.33 }, 33)).toBe(223.33)
  })
})

describe('支付阶段与本次应付', () => {
  it('只有待付尾款是尾款，其余状态都算定金', () => {
    expect(isRequirementFinalPayment({ status: 'pending_final' })).toBe(true)
    expect(isRequirementFinalPayment({ status: 'pending_deposit' })).toBe(false)
    expect(isRequirementFinalPayment({ status: 'in_development' })).toBe(false)
    expect(isRequirementFinalPayment(null)).toBe(false)
    expect(isRequirementFinalPayment(undefined)).toBe(false)
  })

  it('阶段标签进标题与按钮文案', () => {
    expect(requirementPayStageLabel({ status: 'pending_final' })).toBe('尾款')
    expect(requirementPayStageLabel({ status: 'pending_deposit' })).toBe('定金')
  })

  it('本次应付按阶段取金额：定金取比例、尾款取差额', () => {
    expect(requirementPayAmount({ status: 'pending_deposit', budget: 10000 }, 20)).toBe(2000)
    expect(requirementPayAmount({ status: 'pending_final', budget: 10000 }, 20)).toBe(8000)
  })
})
