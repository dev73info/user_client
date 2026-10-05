import { describe, expect, it } from 'vitest'

import {
  groupInvoicesByRequirement,
  invoiceGroupHasPending,
  invoiceGroupMatchesKeyword,
  invoiceGroupMatchesStatus,
  invoiceGroupTotalFen,
  type InvoiceGroup,
  type InvoiceGroupFacts,
} from '@/shared/invoiceGroups'

/** 判定只用这几个字段：需求号、抬头、票号、票面，加上 `invoiceAction` 那套票性事实。 */
const CUSTOMER = 'alice'
const DEVELOPER = 'bob'
const REQUIREMENT = '2026-1791189285015'
const BUYER_TITLE = '彝良柒参信息有限责任公司'
/** 已上传的发票文件路径，只用来表达「文件在」。 */
const DOCUMENT = '/uploads/invoices/20/document.pdf'

function ticket(overrides: Partial<InvoiceGroupFacts> = {}): InvoiceGroupFacts {
  return {
    id: 1,
    invoiceNo: 'INV-DEVELOPER-a1',
    requirementId: REQUIREMENT,
    invoiceTitle: BUYER_TITLE,
    invoiceRole: 'developer',
    documentKind: 'blue',
    status: 'requested',
    documentUrl: null,
    reviewNote: null,
    developerUsername: DEVELOPER,
    customerUsername: CUSTOMER,
    amountFen: 8000,
    ...overrides,
  }
}

/** 把几张票收成卡：单张卡的用例只关心那一张卡，这里直接取第一张。 */
function firstGroup(tickets: InvoiceGroupFacts[]): InvoiceGroup<InvoiceGroupFacts> {
  return groupInvoicesByRequirement(tickets)[0]!
}

describe('同一需求的两张票合并成一张卡', () => {
  it('平台服务费票与开发者收入票收成一组，接口给的顺序原样保留', () => {
    // 一次开票申请开出两张票，接口按 created_at DESC 返回：后建的开发者票在前，与合并前逐票平铺时
    // 的阅读顺序一致。
    const groups = groupInvoicesByRequirement([
      ticket({ id: 2, invoiceNo: 'INV-DEVELOPER-a1' }),
      ticket({ id: 1, invoiceNo: 'INV-PLATFORM-b2', invoiceRole: 'platform', amountFen: 2000 }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.requirementId).toBe(REQUIREMENT)
    expect(groups[0]!.invoices.map((invoice) => invoice.id)).toEqual([2, 1])
  })

  it('不同需求各自成卡，卡与卡之间按最新一张票所属的需求在前', () => {
    const groups = groupInvoicesByRequirement([
      ticket({ id: 5, requirementId: 'req-b' }),
      ticket({ id: 3, requirementId: 'req-a' }),
      ticket({ id: 4, requirementId: 'req-b', invoiceRole: 'platform', amountFen: 2000 }),
    ])

    expect(groups.map((group) => group.requirementId)).toEqual(['req-b', 'req-a'])
    expect(groups[0]!.invoices.map((invoice) => invoice.id)).toEqual([5, 4])
  })

  it('卡头抬头取组内最新一张票的抬头：红冲后换了抬头重开，以新的为准', () => {
    const groups = groupInvoicesByRequirement([
      ticket({ id: 3, invoiceTitle: '新抬头' }),
      ticket({ id: 1, invoiceTitle: '旧抬头', status: 'reversed' }),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]!.invoiceTitle).toBe('新抬头')
  })

  it('没有票时没有卡', () => {
    expect(groupInvoicesByRequirement([])).toEqual([])
  })
})

describe('状态筛选与顶部读数按需求计：卡内任一票命中，这张卡就留下', () => {
  it('平台票还等着开、乙方已把文件传上来：两张票的状态都算这张卡的', () => {
    const group = firstGroup([
      ticket({ id: 2, documentUrl: DOCUMENT }),
      ticket({ id: 1, invoiceRole: 'platform', amountFen: 2000 }),
    ])

    expect(invoiceGroupMatchesStatus(group, 'approved')).toBe(true)
    expect(invoiceGroupMatchesStatus(group, 'requested')).toBe(true)
    expect(invoiceGroupHasPending(group)).toBe(true)
  })

  it('平台服务费票照读状态列：审核中 / 需补充材料都算这一组的状态', () => {
    const group = firstGroup([
      ticket({ id: 1, invoiceRole: 'platform', amountFen: 2000, status: 'under_review' }),
    ])

    expect(invoiceGroupMatchesStatus(group, 'under_review')).toBe(true)
    expect(invoiceGroupHasPending(group)).toBe(true)

    const rejected = firstGroup([
      ticket({ id: 1, invoiceRole: 'platform', amountFen: 2000, status: 'rejected' }),
    ])
    expect(invoiceGroupMatchesStatus(rejected, 'rejected')).toBe(true)
    // 「处理中」这一档仍只算待处理与审核中（与合并前逐票计数时同一口径）：需补充材料自己是一档，
    // 这里不重复计入，免得两档读数看起来对不上。
    expect(invoiceGroupHasPending(rejected)).toBe(false)
  })

  it('开发者收入票没有平台审核这一步：文件在 = 已开具，文件不在 = 待处理', () => {
    const pending = firstGroup([ticket({ id: 1 })])
    expect(invoiceGroupMatchesStatus(pending, 'requested')).toBe(true)
    expect(invoiceGroupHasPending(pending)).toBe(true)

    const approved = firstGroup([ticket({ id: 1, documentUrl: DOCUMENT })])
    expect(invoiceGroupMatchesStatus(approved, 'approved')).toBe(true)
    expect(invoiceGroupHasPending(approved)).toBe(false)
  })

  it('「已红冲」既认被红冲的原票，也认红票本身', () => {
    const reversedBlue = firstGroup([ticket({ id: 1, status: 'reversed', documentUrl: DOCUMENT })])
    expect(invoiceGroupMatchesStatus(reversedBlue, 'reversed')).toBe(true)

    // 红票是红冲那一刻生成的冲销凭证，它的状态列不会写成 reversed——只按状态判会把它错记成已开具。
    const redOnly = firstGroup([
      ticket({ id: 9, documentKind: 'red', status: 'approved', documentUrl: DOCUMENT }),
    ])
    expect(invoiceGroupMatchesStatus(redOnly, 'reversed')).toBe(true)
  })
})

describe('关键词搜需求号、抬头与任一票号', () => {
  const group = firstGroup([
    ticket({ id: 2, invoiceNo: 'INV-DEVELOPER-da02a3c0' }),
    ticket({ id: 1, invoiceNo: 'INV-PLATFORM-eaa9a6b5', invoiceRole: 'platform', amountFen: 2000 }),
  ])

  it('搜需求号或抬头命中', () => {
    expect(invoiceGroupMatchesKeyword(group, REQUIREMENT)).toBe(true)
    expect(invoiceGroupMatchesKeyword(group, '彝良柒参')).toBe(true)
  })

  it('拿着其中一张票的票号也能定位到这张卡', () => {
    expect(invoiceGroupMatchesKeyword(group, 'INV-PLATFORM-eaa9a6b5')).toBe(true)
    expect(invoiceGroupMatchesKeyword(group, 'inv-developer')).toBe(true)
  })

  it('空关键词视为命中，都对不上就不留', () => {
    expect(invoiceGroupMatchesKeyword(group, '   ')).toBe(true)
    expect(invoiceGroupMatchesKeyword(group, 'INV-NOTHING')).toBe(false)
  })
})

describe('卡头的金额合计', () => {
  it('平台服务费票 + 开发者收入票 = 客户为这笔需求实付的合计', () => {
    const group = firstGroup([
      ticket({ id: 2, amountFen: 8000 }),
      ticket({ id: 1, invoiceRole: 'platform', amountFen: 2000 }),
    ])

    expect(invoiceGroupTotalFen(group)).toBe(10000)
  })

  it('红票按负数冲减原票票面：红冲后这一组的净额归零', () => {
    const group = firstGroup([
      ticket({ id: 9, documentKind: 'red', status: 'approved', documentUrl: DOCUMENT, amountFen: 8000 }),
      ticket({ id: 1, status: 'reversed', documentUrl: DOCUMENT, amountFen: 8000 }),
    ])

    expect(invoiceGroupTotalFen(group)).toBe(0)
  })
})
