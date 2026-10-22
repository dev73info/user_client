import type { AppliedInvoices, InvoiceKind, InvoiceRecord } from '@/api/invoices'

/**
 * 开票弹窗的展示文案与枚举映射（R047 从 `components/InvoiceApplyDialog.vue` 下沉）。
 *
 * 只做「枚举 → 中文」，不读接口、不碰表单状态：两侧共用的抬头 / 税号 / 邮箱说明、票种前缀、
 * 专票要填的四项资料都写在这里，弹窗与进度行读的是同一份。
 */

/** 开票主体：平台服务费票由平台开给需求方，开发者收入票由乙方开给需求方。 */
export type InvoiceSide = 'platform' | 'developer'

/** 两侧共用的抬头 / 税号 / 邮箱分别对应哪种票、由谁开具。 */
export const COPY: Record<
  'customer' | 'developer',
  {
    title: string
    issuer: string
    hint: string
    amountNote: string
    submitText: string
  }
> = {
  customer: {
    title: '获取发票',
    issuer: '平台票 + 开发者票',
    hint: '一次申请把本需求能开的票都开出来：平台服务费票由平台开具，开发者收入票由乙方开具，两张票共用这份抬头。',
    amountNote: '本次申请可开出的合计（平台服务费票 + 开发者收入票）',
    submitText: '提交开票申请',
  },
  developer: {
    title: '获取开发者发票',
    issuer: '开发者发票',
    hint: '开发者收入发票由乙方开具给需求方：抬头与税号按需求方实名主体带出，需求方为企业或个体工商户时税号必填；发票文件上传后需求方可在「我的发票」下载。',
    amountNote: '开发者收入（定金 + 尾款合并开票）',
    submitText: '提交开发者发票申请',
  },
}

export function invoiceSideLabel(side: InvoiceSide) {
  return side === 'platform' ? '平台服务费发票' : '开发者服务收入发票'
}

export function invoiceStatusLabel(status: InvoiceRecord['status']) {
  return {
    requested: '待处理',
    under_review: '审核中',
    approved: '已开具',
    rejected: '需补充材料',
    reversed: '已红冲',
  }[status]
}

/**
 * 进度行里的票种前缀。
 *
 * 只给专票点名：普票是默认票种，每一行都写一遍只是噪音；专票是客户特意申请的，
 * 值得在进度里留个痕，也方便对着票面看清这次申请的是哪一种。
 */
export function kindNoticePrefix(kind: InvoiceKind) {
  return kind === 'special' ? '增值税专用发票 · ' : ''
}

/**
 * 开票信息预填：抬头 / 税号 / 接收邮箱**统一按买方（需求方）的实名主体**来。
 *
 * 两张票都是开给同一个需求方的，所以乙方打开弹窗时带出的也是需求方的资料，而不是乙方自己的
 * 公司名——「发票开给谁」不因为谁来申请而改变。这份主体由后端随汇总一起给出（见
 * `InvoiceBuyerSubject`），前端不再单独去查实名与账户资料，两个视角只有一处口径。


/** 专票需要购买方四项资料；名称与税号已在上面的抬头 / 税号里。 */
export const SPECIAL_FIELDS: {
  key: 'buyerAddress' | 'buyerPhone' | 'buyerBankName' | 'buyerBankAccount'
  label: string
}[] = [
  { key: 'buyerAddress', label: '注册地址' },
  { key: 'buyerPhone', label: '联系电话' },
  { key: 'buyerBankName', label: '开户银行' },
  { key: 'buyerBankAccount', label: '银行账号' },
]

export function createdToastText(sides: InvoiceSide[]) {
  if (sides.length > 1) {
    return '平台发票与开发者发票申请已提交，到「我的发票」可查看进度'
  }
  if (sides[0] === 'platform') {
    return '平台发票申请已提交，到「我的发票」可查看进度'
  }
  if (sides[0] === 'developer') {
    return '开发者发票申请已提交，乙方上传发票文件后可在「我的发票」下载'
  }
  // 两侧都只是回放（并发下来别人刚申请过）：不谎报新建，只提示进度已经在这里了。
  return '本需求的开票申请已提交，到「我的发票」可查看进度'
}

/** 本次申请真正新建了哪几张票：申请前没有、响应里有，才算新建（已开过的原票会被回放）。 */
export function createdInvoiceSides(
  applied: AppliedInvoices,
  previous: { platformInvoice?: unknown; developerInvoice?: unknown } | null,
): InvoiceSide[] {
  const sides: InvoiceSide[] = []
  if (applied.platformInvoice && !previous?.platformInvoice) {
    sides.push('platform')
  }
  if (applied.developerInvoice && !previous?.developerInvoice) {
    sides.push('developer')
  }
  return sides
}
