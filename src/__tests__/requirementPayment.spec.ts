import { describe, expect, it } from 'vitest'

import {
  calculateDepositFen,
  calculateFinalPaymentFen,
  isRequirementFinalPayment,
  requirementPayFen,
  requirementPayStageLabel,
} from '@/shared/requirementPayment'

/**
 * 支付金额与阶段标签的唯一口径。
 *
 * 这个视图没有挂载测试，纯函数层是拆分后唯一的回归网：比例是**注入**的（`useMyRequirementsData`
 * 从 settings 接口取），所以这里只验「给定比例算出什么」，不验比例从哪来。
 *
 * 金额一律**整数分**：契约里 `budget` 是元，进函数时换成整数分，出函数也是分，
 * 元只在渲染那一步用 `formatFenAsCny`。
 */

describe('定金 / 尾款金额（整数分）', () => {
  it('有比例时定金按比例、尾款按差额，两者相加等于总额', () => {
    const item = { budget: 10000 }
    expect(calculateDepositFen(item, 20)).toBe(200000)
    expect(calculateFinalPaymentFen(item, 20)).toBe(800000)
    expect(calculateDepositFen(item, 20) + calculateFinalPaymentFen(item, 20)).toBe(1000000)
  })

  it('比例为 0 / 非法时定金按全额（老口径，别在这里改成报错）', () => {
    const item = { budget: 500 }
    expect(calculateDepositFen(item, 0)).toBe(50000)
    expect(calculateDepositFen(item, Number.NaN)).toBe(50000)
    expect(calculateFinalPaymentFen(item, 0)).toBe(1)
  })

  it('预算缺失时按 1 元兜底，预算为 0 或过小时落到 1 分下限，不会算出 0 元订单', () => {
    // 缺 budget 走 1 元兜底（老口径），显式的 0 就是 0
    expect(calculateDepositFen({}, 20)).toBe(20)
    expect(calculateDepositFen({ budget: 0 }, 20)).toBe(1)
    expect(calculateFinalPaymentFen({ budget: 0.01 }, 20)).toBe(1)
  })

  it('结果天然是整数分（预算带小数时不会出现长小数）', () => {
    expect(calculateDepositFen({ budget: 333.33 }, 33)).toBe(11000)
    expect(calculateFinalPaymentFen({ budget: 333.33 }, 33)).toBe(22333)
    expect(Number.isInteger(calculateDepositFen({ budget: 333.33 }, 33))).toBe(true)
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
    expect(requirementPayFen({ status: 'pending_deposit', budget: 10000 }, 20)).toBe(200000)
    expect(requirementPayFen({ status: 'pending_final', budget: 10000 }, 20)).toBe(800000)
  })
})
