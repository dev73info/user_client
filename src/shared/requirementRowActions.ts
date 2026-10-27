import type { RequirementItem } from '@/api/requirements'
import { invoiceEntryState } from '@/shared/invoiceAvailability'
import {
  canCancel,
  canComment,
  canOpenAcceptance,
  canPay,
  canReportBreach,
  canRequestFinalPayment,
  canResubmit,
  hasBoundResource,
  isSelfManagedRequirement,
  requirementFinalActionLabel,
  type RequirementRowFacts,
} from '@/shared/requirementRowRules'

/**
 * 需求行操作区的分组：开关芯片之外，「行内常用动作 → 更多菜单 → 唯一主操作」这三层放什么。
 *
 * 这里只决定**位置**，能不能做仍由 `requirementRowRules.ts` 的 canXxx / hasXxx 判定，
 * 展示层不重复实现业务规则，避免两处口径漂移。从视图下沉出来的目的同样是能单测。
 */

export type RequirementRowActionKey =
  | 'contract-create'
  | 'contract-sign'
  | 'contract-view'
  | 'resubmit'
  | 'pay'
  | 'acceptance'
  | 'finish'
  | 'comment'
  | 'download'
  | 'conversation'
  | 'after-sales'
  | 'homepage'
  | 'invoice'
  | 'breach'
  | 'cancel'
  | 'claim-resource'

export type RequirementRowAction = {
  key: RequirementRowActionKey
  label: string
  danger?: boolean
  disabled?: boolean
  title?: string
}

/** 能不能发起合同：无担保模式没有合同；有交付资源且停在待接单 / 已缴定金才需要发起。 */
export function canCreateRequirementContract(item: RequirementItem, facts: RequirementRowFacts) {
  const signing = item.status === 'pending_deposit' || item.status === 'deposit_paid'
  return (
    !isSelfManagedRequirement(item) &&
    hasBoundResource(item) &&
    signing &&
    !facts.contract?.has_contract
  )
}

/** 合同签署页的入口：无担保模式不提供，没合同也没有可签的东西。 */
export function canOpenContractSign(item: RequirementItem, facts: RequirementRowFacts) {
  return !isSelfManagedRequirement(item) && Boolean(facts.contract?.has_contract)
}

/** 我方已签时入口只是「查看合同」，未签时是「签署合同」（前者按查看类弱化显示）。 */
export function isContractButtonViewOnly(facts: RequirementRowFacts) {
  return Boolean(facts.contract?.party_a_signed)
}

/** 合同入口全行只有一个：无合同→发起，我方未签→签署，已签→只看（进「更多」）。 */
export function rowContractAction(item: RequirementItem, facts: RequirementRowFacts) {
  if (canCreateRequirementContract(item, facts)) return 'create' as const
  if (!canOpenContractSign(item, facts)) return null
  return isContractButtonViewOnly(facts) ? ('view' as const) : ('sign' as const)
}

/** 唯一主操作（实心按钮），取「当前该做的那一步」；返回 null 表示这行没有待办。 */
export function primaryRowAction(
  item: RequirementItem,
  facts: RequirementRowFacts,
  options: { contractCreating?: boolean } = {},
): RequirementRowAction | null {
  const contractAction = rowContractAction(item, facts)
  if (contractAction === 'create') {
    const creating = Boolean(options.contractCreating)
    return {
      key: 'contract-create',
      label: creating ? '发起中...' : '发起合同',
      disabled: creating,
    }
  }
  if (contractAction === 'sign') return { key: 'contract-sign', label: '签署合同' }
  if (canResubmit(item.status)) return { key: 'resubmit', label: '编辑' }
  // 已交付订单优先验收；其余取消与支付 / 验收 / 评价互斥。
  if (!canCancel(item) || canOpenAcceptance(item, facts)) {
    if (canPay(item, facts)) {
      return { key: 'pay', label: item.status === 'pending_final' ? '支付尾款' : '支付定金' }
    }
    if (canOpenAcceptance(item, facts)) return { key: 'acceptance', label: '验收' }
    if (canRequestFinalPayment(item, facts)) {
      return { key: 'finish', label: requirementFinalActionLabel(item) }
    }
    if (canComment(item.status) && item.comment_rating == null) {
      return { key: 'comment', label: '去评价' }
    }
  }
  return null
}

/**
 * 「更多」菜单项，同时用于决定是否渲染「更多」触发器（空数组时不渲染）。
 *
 * 已评价的行不再把评价做成主操作，但后端是 upsert（`comment_requirement_by_user`），
 * 仍可以改，所以菜单里保留「修改评价」，不能让这个入口消失。
 */
export function moreRowActions(
  item: RequirementItem,
  facts: RequirementRowFacts,
): RequirementRowAction[] {
  const entries: RequirementRowAction[] = []
  if (rowContractAction(item, facts) === 'view') {
    entries.push({ key: 'contract-view', label: '查看合同' })
  }
  if (hasBoundResource(item)) entries.push({ key: 'homepage', label: '资源主页' })
  if (canComment(item.status) && item.comment_rating != null && !canCancel(item)) {
    entries.push({ key: 'comment', label: '修改评价' })
  }
  // 开不出票时不留一个点了才报错的入口：置灰并把原因挂在 title 上（灰项不可点，原因只能靠悬浮）。
  const invoiceEntry = { key: 'invoice' as const, label: '获取发票' }
  const invoiceState = invoiceEntryState(item.payment_mode, facts.invoiceSummary)
  entries.push(
    invoiceState.enabled
      ? invoiceEntry
      : { ...invoiceEntry, disabled: true, title: invoiceState.reason },
  )
  // 「解除合作」是唯一的退出入口（2026-10-06 起两套旧出口合并）：进去先协商，对方不同意再申请平台介入。
  if (canReportBreach(item, facts)) entries.push({ key: 'breach', label: '解除合作', danger: true })
  if (canCancel(item)) entries.push({ key: 'cancel', label: '取消需求', danger: true })
  return entries
}
