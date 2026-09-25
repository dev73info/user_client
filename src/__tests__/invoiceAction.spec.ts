import { describe, expect, it } from 'vitest'

import {
  canUploadInvoiceDocument,
  invoiceWaitingHint,
  type InvoiceActionFacts,
} from '@/shared/invoiceAction'

/** 判定只用四个字段：票的开票主体、票性、状态与乙方是谁。 */
const CUSTOMER = 'alice'
const DEVELOPER = 'bob'

function facts(overrides: Partial<InvoiceActionFacts> = {}): InvoiceActionFacts {
  return {
    invoiceRole: 'developer',
    documentKind: 'blue',
    status: 'requested',
    developerUsername: DEVELOPER,
    ...overrides,
  }
}

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

  it('需补充材料时乙方仍可重传', () => {
    expect(canUploadInvoiceDocument(facts({ status: 'rejected' }), DEVELOPER, 'developer')).toBe(true)
  })

  it('平台服务费票谁都没有上传入口：它由平台财务在管理端开具', () => {
    for (const viewer of [CUSTOMER, DEVELOPER]) {
      expect(canUploadInvoiceDocument(facts({ invoiceRole: 'platform' }), viewer, 'developer')).toBe(false)
      expect(canUploadInvoiceDocument(facts({ invoiceRole: 'platform' }), viewer, 'customer')).toBe(false)
    }
  })

  it('已通过、已红冲与红票都不再接收文件', () => {
    expect(canUploadInvoiceDocument(facts({ status: 'approved' }), DEVELOPER, 'developer')).toBe(false)
    expect(canUploadInvoiceDocument(facts({ status: 'reversed' }), DEVELOPER, 'developer')).toBe(false)
    expect(canUploadInvoiceDocument(facts({ documentKind: 'red' }), DEVELOPER, 'developer')).toBe(false)
  })
})

describe('等待中的票要说清在等谁', () => {
  it('客户工作台看到开发者票：等乙方开，不是等他自己', () => {
    expect(invoiceWaitingHint(facts(), DEVELOPER, 'customer')).toBe(
      '由乙方开具：乙方上传发票文件、平台审核通过后可在此下载',
    )
    expect(invoiceWaitingHint(facts(), CUSTOMER, 'customer')).toBe(
      '由乙方开具：乙方上传发票文件、平台审核通过后可在此下载',
    )
  })

  it('开发者工作台看到开发者票：等自己上传', () => {
    expect(invoiceWaitingHint(facts(), DEVELOPER, 'developer')).toBe('由你开具：上传发票文件后由平台审核')
  })

  it('开发者工作台里看到的是别人开的票：不写「由你开具」，因为没有上传入口', () => {
    // 一个账号可能在这笔需求里是买方、在另一笔里是乙方，两边看到的是同一份列表；
    // 别家乙方开的票在这页上只能查看与下载，说成「由你开具」就是错误的引导。
    expect(invoiceWaitingHint(facts(), CUSTOMER, 'developer')).toBe(
      '由乙方开具：乙方上传发票文件、平台审核通过后可在此下载',
    )
  })

  it('平台服务费票在哪个工作台都是等平台财务开', () => {
    for (const perspective of ['customer', 'developer'] as const) {
      for (const viewer of [CUSTOMER, DEVELOPER]) {
        expect(invoiceWaitingHint(facts({ invoiceRole: 'platform' }), viewer, perspective)).toBe(
          '由平台开具：平台财务开票并上传后，可在此下载',
        )
      }
    }
  })

  it('需补充材料时同样说明责任方，与「审核说明」一起看', () => {
    expect(invoiceWaitingHint(facts({ status: 'rejected' }), CUSTOMER, 'customer')).toContain('由乙方开具')
  })

  it('已开具、已红冲与红票都没有可等的事', () => {
    expect(invoiceWaitingHint(facts({ status: 'approved' }), CUSTOMER, 'customer')).toBe('')
    expect(invoiceWaitingHint(facts({ status: 'reversed' }), DEVELOPER, 'developer')).toBe('')
    expect(invoiceWaitingHint(facts({ documentKind: 'red' }), CUSTOMER, 'customer')).toBe('')
  })
})
