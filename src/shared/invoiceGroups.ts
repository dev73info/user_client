import type { InvoiceRecord } from '@/api/invoices'
import { invoiceDisplayStatus, type InvoiceActionFacts } from '@/shared/invoiceAction'

/**
 * 分组与「这张卡要不要留下」的判定只用这几个字段。
 *
 * 收窄成结构类型，调用方与测试都不必造一份完整发票记录（与 `invoiceAction` 同一做法）：真正的
 * `InvoiceRecord` 天然满足它，测试里几个字段就能表达一张票。
 */
export type InvoiceGroupFacts = InvoiceActionFacts & {
  id: number
  requirementId: string
  invoiceTitle: string
  invoiceNo: string
  amountFen: number
}

/**
 * 同一需求的一组票——「我的发票」按需求合并后的列表项。
 *
 * 一次开票申请会把该需求能开的票一起开出来：需求方拿「平台服务费票 + 开发者收入票」两张，乙方只拿
 * 自己那张开发者收入票（见 `InvoiceApplyDialog` 与后端 `apply_invoices`）。这两张票的需求号、抬头、
 * 买方都是同一份，按票平铺时同一个需求在列表里会出现两行几乎一样的记录——用户看到的是「同一笔需求
 * 的两张票」，列表就该按需求收成一张卡。
 *
 * 卡头只写两票共用的抬头与金额合计，卡内逐票成行：票种、金额、状态徽标与「查看 / 下载 / 上传」都
 * 还是每张票自己的。合并的是**行**，不是票；需求号与票号不在界面上展示，只挂在 title 上（见
 * `InvoiceCenterView`），列表里一眼看到的都是人话而不是长串编号。
 */
export type InvoiceGroup<T extends InvoiceGroupFacts = InvoiceGroupFacts> = {
  /** 这一组票共用的需求编号，也是列表项的身份：合并按它做，卡与卡之间也按它去重。 */
  requirementId: string
  /**
   * 卡头显示的抬头：取组内**最新**一张票的抬头。
   *
   * 依赖接口给的顺序（`created_at DESC, id DESC`，最新的在前）——正常路径上两张票共用一份抬头
   * （一次申请一起开出来的），只有「红冲后换了抬头重开」才会不一致；那时卡头显示最新的那份，
   * 与它不同的票在行内自己标出抬头（见 `InvoiceCenterView`）。
   */
  invoiceTitle: string
  /** 组内的票，接口给的顺序原样保留（最新的在最前），不在这里重排。 */
  invoices: T[]
}

/**
 * 按需求把票收成组。
 *
 * 组的顺序取「组内第一张票（＝最新那张）在列表里的位置」：接口是倒序返回的，所以最近开过票的需求
 * 排在前面，与合并前逐票平铺时的阅读顺序一致。
 */
export function groupInvoicesByRequirement<T extends InvoiceGroupFacts>(
  invoices: T[],
): InvoiceGroup<T>[] {
  const groups = new Map<string, InvoiceGroup<T>>()
  for (const invoice of invoices) {
    const existing = groups.get(invoice.requirementId)
    if (existing) {
      existing.invoices.push(invoice)
      continue
    }
    groups.set(invoice.requirementId, {
      requirementId: invoice.requirementId,
      invoiceTitle: invoice.invoiceTitle,
      invoices: [invoice],
    })
  }
  return [...groups.values()]
}

/**
 * 这一组里有没有票处在这一档——状态筛选与顶部读数条共用这一处判定。
 *
 * **一张卡 = 一个需求 = 一条记录**：卡内任一张票命中这一档，这张卡就显示（卡内的票一起显示，好让
 * 用户看到这个需求的开票全貌，而不是「筛完之后这张卡只剩半张票」）。同一需求的票可以处在不同状态
 * （平台票已开具、开发者票还等着上传），因此各档读数之和可能大于「全部记录」——这是「按需求计」的
 * 必然结果，不是重复计算。
 *
 * 「已红冲」这一档两处都认：既认状态为 `reversed` 的原票，也认红票本身（`document_kind = red`）。
 * 红票是红冲那一刻生成的冲销凭证，它的状态不会写成 `reversed`，只按状态列判会让「有红票的需求」
 * 落到「已开具」里。
 */
export function invoiceGroupMatchesStatus(
  group: InvoiceGroup,
  status: InvoiceRecord['status'],
): boolean {
  return group.invoices.some((invoice) => (
    status === 'reversed'
      ? invoiceDisplayStatus(invoice) === 'reversed' || invoice.documentKind === 'red'
      : invoiceDisplayStatus(invoice) === status
  ))
}

/**
 * 这一组还有票没走完：顶部读数条「处理中」按它计。
 *
 * 这一档只算**待处理（requested）与审核中（under_review）**——与合并前逐票计数时同一口径。
 * 「需补充材料」自己就是筛选里的一档（等用户补资料），不重复计入「处理中」，否则两档读数对不上。
 */
export function invoiceGroupHasPending(group: InvoiceGroup): boolean {
  return invoiceGroupMatchesStatus(group, 'requested') || invoiceGroupMatchesStatus(group, 'under_review')
}

/**
 * 这一组命不命中关键词。
 *
 * 合并后需求号与抬头成了卡头的东西，票号仍属各张票，所以三处都要搜：搜需求号 / 抬头是「找这个客户
 * 或这笔需求」，搜票号是「手里拿着一串票号来对账」，任一命中这张卡就留下。
 */
export function invoiceGroupMatchesKeyword(group: InvoiceGroup, keyword: string): boolean {
  const search = keyword.trim().toLocaleLowerCase()
  if (!search) {
    return true
  }
  if (group.requirementId.toLocaleLowerCase().includes(search)) {
    return true
  }
  if (group.invoiceTitle.toLocaleLowerCase().includes(search)) {
    return true
  }
  return group.invoices.some((invoice) => invoice.invoiceNo.toLocaleLowerCase().includes(search))
}

/**
 * 这一组的金额合计（分）：蓝票为正、红票为负。
 *
 * 红票是冲销凭证，它把原票的票面冲掉，所以同组里「蓝票 + 红票」加总就是这个需求实际开出去的净额。
 * 平台服务费票与开发者收入票加在一起，正好是客户为这笔需求实付的总额（平台服务费 + 开发者收入）。
 */
export function invoiceGroupTotalFen(group: InvoiceGroup): number {
  return group.invoices.reduce(
    (sum, invoice) => sum + (invoice.documentKind === 'red' ? -invoice.amountFen : invoice.amountFen),
    0,
  )
}
