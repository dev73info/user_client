import { describe, expect, it } from 'vitest'

import {
  canUploadInvoiceDocument,
  invoiceDisplayStatus,
  invoiceInWorkbench,
  invoiceReviewNote,
  invoiceWaitingHint,
  type InvoiceActionFacts,
} from '@/shared/invoiceAction'

/** 判定只用这几个字段：票的开票主体、票性、状态、文件，以及这笔需求的两方是谁。 */
const CUSTOMER = 'alice'
const DEVELOPER = 'bob'
/** 已上传的发票文件路径，只用来表达「文件在」。 */
const DOCUMENT = '/uploads/invoices/20/document.pdf'

function facts(overrides: Partial<InvoiceActionFacts> = {}): InvoiceActionFacts {
  return {
    invoiceRole: 'developer',
    documentKind: 'blue',
    status: 'requested',
    documentUrl: null,
    reviewNote: null,
    developerUsername: DEVELOPER,
    customerUsername: CUSTOMER,
    ...overrides,
  }
}

describe('每个工作台的发票中心只看自己那一侧的票', () => {
  it('客户工作台留的是我作为买方的票：平台服务费票与乙方开给我的收入票', () => {
    expect(invoiceInWorkbench(facts(), CUSTOMER, 'customer')).toBe(true)
    expect(invoiceInWorkbench(facts({ invoiceRole: 'platform' }), CUSTOMER, 'customer')).toBe(true)
  })

  it('开发者在客户工作台看不到自己要开的票：那是开发者工作台的清单', () => {
    expect(invoiceInWorkbench(facts(), DEVELOPER, 'customer')).toBe(false)
  })

  it('开发者工作台留的是我作为乙方的收入票', () => {
    expect(invoiceInWorkbench(facts(), DEVELOPER, 'developer')).toBe(true)
    expect(invoiceInWorkbench(facts(), CUSTOMER, 'developer')).toBe(false)
  })

  it('平台服务费票不算乙方的票：它的 developer_username 也填需求里的那个乙方', () => {
    // 只按 developerUsername 判会把平台票收进开发者工作台，必须同时判票的开票主体。
    expect(invoiceInWorkbench(facts({ invoiceRole: 'platform' }), DEVELOPER, 'developer')).toBe(false)
  })
})

describe('开发者收入票只有两个真实状态：文件在 = 已开具，文件不在 = 待乙方开具', () => {
  it('乙方还没传文件：待处理', () => {
    expect(invoiceDisplayStatus(facts())).toBe('requested')
  })

  it('文件已上传：已开具，不再等任何人', () => {
    expect(invoiceDisplayStatus(facts({ documentUrl: DOCUMENT }))).toBe('approved')
  })

  it('旧版本留下的「审核中 / 需补充材料」归一到这两个状态，不再挂出平台并不执行的流程', () => {
    // 实测反馈：开发者收入票上那个「审核中」标签没有用——平台不管这张票。
    expect(invoiceDisplayStatus(facts({ status: 'under_review' }))).toBe('requested')
    expect(invoiceDisplayStatus(facts({ status: 'under_review', documentUrl: DOCUMENT }))).toBe('approved')
    expect(invoiceDisplayStatus(facts({ status: 'rejected', documentUrl: DOCUMENT }))).toBe('approved')
  })

  it('平台服务费票照读状态列：那张票的审核流是平台财务自己在走', () => {
    expect(invoiceDisplayStatus(facts({ invoiceRole: 'platform', status: 'under_review' }))).toBe('under_review')
    expect(invoiceDisplayStatus(facts({ invoiceRole: 'platform', status: 'rejected' }))).toBe('rejected')
    expect(invoiceDisplayStatus(facts({ invoiceRole: 'platform', status: 'approved' }))).toBe('approved')
  })

  it('被红冲的原票与红票都照读原状态：红冲是平台侧的账务动作，与谁传了文件无关', () => {
    expect(invoiceDisplayStatus(facts({ status: 'reversed', documentUrl: DOCUMENT }))).toBe('reversed')
    expect(invoiceDisplayStatus(facts({ documentKind: 'red', status: 'approved', documentUrl: DOCUMENT }))).toBe('approved')
  })
})

describe('开发者收入票上没有审核说明这一行', () => {
  it('票上带着旧版本的审核说明也不显示：平台没审过这张票', () => {
    expect(invoiceReviewNote(facts({ reviewNote: '抬头与税号不符' }))).toBe('')
    expect(invoiceReviewNote(facts({ status: 'rejected', reviewNote: '抬头与税号不符' }))).toBe('')
  })

  it('平台服务费票照常显示财务写的说明', () => {
    expect(invoiceReviewNote(facts({ invoiceRole: 'platform', reviewNote: '抬头与税号不符' }))).toBe('抬头与税号不符')
  })

  it('没有说明时返回空串', () => {
    expect(invoiceReviewNote(facts({ invoiceRole: 'platform' }))).toBe('')
  })
})

describe('开发者收入票的上传入口只归乙方', () => {
  it('客户工作台里没有上传入口：这里这张票只是我收到的票，只能查看与下载', () => {
    // 同一个账号可能既是买方又是乙方（在另一笔需求里）；当前这一页的按钮只看工作台那一侧，
    // 所以乙方本人切到客户工作台看这张票时也不该出现上传入口。
    expect(canUploadInvoiceDocument(facts(), DEVELOPER, 'customer')).toBe(false)
    expect(canUploadInvoiceDocument(facts(), CUSTOMER, 'customer')).toBe(false)
  })

  it('开发者工作台里乙方可以上传自己那张', () => {
    expect(canUploadInvoiceDocument(facts(), DEVELOPER, 'developer')).toBe(true)
  })

  it('开发者工作台里买方也传不了：票是乙方开的，后端只收乙方传的', () => {
    expect(canUploadInvoiceDocument(facts(), CUSTOMER, 'developer')).toBe(false)
  })

  it('需补充材料时乙方仍可重传：旧状态按显示状态归一后仍是「等待乙方开」', () => {
    expect(canUploadInvoiceDocument(facts({ status: 'rejected' }), DEVELOPER, 'developer')).toBe(true)
  })

  it('平台服务费票谁都没有上传入口：它由平台财务在管理端开具', () => {
    for (const viewer of [CUSTOMER, DEVELOPER]) {
      expect(canUploadInvoiceDocument(facts({ invoiceRole: 'platform' }), viewer, 'developer')).toBe(false)
      expect(canUploadInvoiceDocument(facts({ invoiceRole: 'platform' }), viewer, 'customer')).toBe(false)
    }
  })

  it('文件已在也能重新上传替换：开发者收入票允许乙方换文件，票号与金额都不变', () => {
    expect(canUploadInvoiceDocument(facts({ status: 'approved', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe(true)
    // 旧版本留下的 `under_review` 同理：这张票真实的两个状态只看文件在不在。
    expect(canUploadInvoiceDocument(facts({ status: 'under_review', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe(true)
  })

  it('客户工作台里文件已在也不给入口：买方只负责索取与下载，换文件是乙方的事', () => {
    expect(canUploadInvoiceDocument(facts({ status: 'approved', documentUrl: DOCUMENT }), DEVELOPER, 'customer')).toBe(false)
    expect(canUploadInvoiceDocument(facts({ status: 'approved', documentUrl: DOCUMENT }), CUSTOMER, 'customer')).toBe(false)
  })

  it('被红冲的原票与红票都不给上传入口：终态票改不了文件，红票由财务端补传', () => {
    expect(canUploadInvoiceDocument(facts({ status: 'reversed', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe(false)
    expect(canUploadInvoiceDocument(facts({ documentKind: 'red', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe(false)
  })
})

describe('等待中的票要说清在等谁', () => {
  it('客户工作台整行都不给这行说明：那里只有查看与下载，票在谁手上不影响买方', () => {
    expect(invoiceWaitingHint(facts(), DEVELOPER, 'customer')).toBe('')
    expect(invoiceWaitingHint(facts(), CUSTOMER, 'customer')).toBe('')
    expect(invoiceWaitingHint(facts({ invoiceRole: 'platform' }), CUSTOMER, 'customer')).toBe('')
    expect(invoiceWaitingHint(facts({ status: 'rejected' }), CUSTOMER, 'customer')).toBe('')
  })

  it('开发者工作台看到开发者票：等自己上传', () => {
    expect(invoiceWaitingHint(facts(), DEVELOPER, 'developer')).toBe(
      '由你开具：上传发票文件后即视为已开具，客户可下载',
    )
  })

  it('开发者工作台里看到的是别人开的票：不写「由你开具」，因为没有上传入口', () => {
    // 一个账号可能在这笔需求里是买方、在另一笔里是乙方，两边看到的是同一份列表；
    // 别家乙方开的票在这页上只能查看与下载，说成「由你开具」就是错误的引导。
    expect(invoiceWaitingHint(facts(), CUSTOMER, 'developer')).toBe('由乙方开具：乙方上传发票文件后可在此下载')
  })

  it('平台服务费票在开发者工作台里是等平台财务开', () => {
    for (const viewer of [CUSTOMER, DEVELOPER]) {
      expect(invoiceWaitingHint(facts({ invoiceRole: 'platform' }), viewer, 'developer')).toBe(
        '由平台开具：平台财务开票并上传后，可在此下载',
      )
    }
  })

  it('需补充材料时在开发者工作台说清责任方，与「审核说明」一起看', () => {
    expect(invoiceWaitingHint(facts({ status: 'rejected' }), DEVELOPER, 'developer')).toContain('由你开具')
  })

  it('已开具、已红冲与红票都没有可等的事', () => {
    expect(invoiceWaitingHint(facts({ status: 'approved', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe('')
    expect(invoiceWaitingHint(facts({ status: 'reversed', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe('')
    expect(invoiceWaitingHint(facts({ documentKind: 'red', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe('')
    // 旧版本的 `under_review` 也不再让行上出现一句「由你开具」——文件已在，没有事要等。
    expect(invoiceWaitingHint(facts({ status: 'under_review', documentUrl: DOCUMENT }), DEVELOPER, 'developer')).toBe('')
  })
})
