import {
  PLATFORM_DEPOSIT_PERCENT,
  depositAmountOf,
  finalAmountOf,
  findRequirement,
} from './requirements'
import { REQUIREMENT_SEEDS } from './requirementSeeds'
import { CLIENT_USERNAME, datetime } from './shared'

/* ------------------------------------------------------------------ 支付单 */

export type MockPayment = {
  payment_id: string
  requirement_id: string
  kind: 'deposit' | 'final'
  channel: 'alipay' | 'wechat'
  amount_cny: number
  /** 后端支付单状态：待支付 / 已支付 */
  status: 'pending' | 'paid' | 'closed'
  description: string
  created_at: string
  paid_at: string | null
}

function buildPayments(): MockPayment[] {
  const list: MockPayment[] = []

  for (const seed of REQUIREMENT_SEEDS) {
    if (seed.mode !== 'platform_guarantee' || seed.status === 'rejected') {
      continue
    }

    const requirement = findRequirement(seed.code)
    if (!requirement) {
      continue
    }

    const deposit = depositAmountOf(requirement)
    const final = finalAmountOf(requirement)

    list.push({
      payment_id: `PAY-${seed.code}-DEPOSIT`,
      requirement_id: seed.code,
      kind: 'deposit',
      channel: 'alipay',
      amount_cny: deposit,
      status: seed.depositPaid ? 'paid' : 'pending',
      description: `${seed.title} · 定金（${PLATFORM_DEPOSIT_PERCENT}%）`,
      created_at: datetime(-seed.createdDaysAgo + 1, 12, 10),
      paid_at: seed.depositPaid ? datetime(-seed.createdDaysAgo + 1, 12, 20) : null,
    })

    if (seed.depositPaid) {
      list.push({
        payment_id: `PAY-${seed.code}-FINAL`,
        requirement_id: seed.code,
        kind: 'final',
        channel: 'wechat',
        amount_cny: final,
        status: seed.finalPaid ? 'paid' : 'pending',
        description: `${seed.title} · 尾款`,
        created_at: datetime(-seed.updatedDaysAgo, 16, 0),
        paid_at: seed.finalPaid ? datetime(-seed.updatedDaysAgo, 16, 10) : null,
      })
    }
  }

  return list
}

export const payments: MockPayment[] = buildPayments()

export function paymentOf(code: string, kind: 'deposit' | 'final'): MockPayment | undefined {
  return payments.find((item) => item.requirement_id === code && item.kind === kind)
}

/** 已结单产生的分账收入，钱包「最近收入」与开发者的交付回执都用它。 */
export const settledIncome = REQUIREMENT_SEEDS.filter((seed) => seed.finalPaid).map((seed) => {
  const requirement = findRequirement(seed.code)
  const amount = requirement ? finalAmountOf(requirement) : 0

  return {
    payment_id: `PAY-${seed.code}-FINAL`,
    requirement_id: seed.code,
    title: seed.title,
    customer: CLIENT_USERNAME,
    gross_amount_cny: amount,
    refund_developer_cny: 0,
    amount_cny: amount,
    paid_at: datetime(-seed.updatedDaysAgo, 16, 10),
    payment_stage: 'final',
    requirement_status: seed.status,
    refunded_at: null,
    requirement_refund_cny: 0,
  }
})
