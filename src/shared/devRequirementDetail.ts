import type { RequirementPaymentMode, RequirementStatus } from '@/api/devRequirements'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import {
  developmentCycleLabel,
  isRequirementArchived,
  requirementArchiveBanner,
  type RequirementArchiveState,
} from '@/shared/requirementArchive'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'

/**
 * 开发者「需求详情」页的展示口径（纯函数）：状态文案、预算、更新时间、富文本兜底、归档横幅。
 *
 * 「能不能接、接的时候交什么」在 `shared/devRequirementBinding`：那一半要算保证金、信用、
 * 入驻协议与标签树，和「这一单长什么样」是两回事，分开写才好各自单测。
 * 放在 shared 里的另一个原因：视图与区块组件都只做接线，谁也不该再写一遍文案。
 */

/** 详情页读需求单时用到的字段（只挑展示要用的，避免组件反向依赖整份类型）。 */
export type RequirementDetailFacts = {
  requirement_id: string
  title: string
  creator: string
  updated_at: string
  budget?: number | null
  description?: string | null
  acceptance_criteria?: string | null
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  development_cycle_days?: number | null
  archive_locked_at?: string | null
  archive_lock_expires_at?: string | null
  archive_cleared_at?: string | null
  archive_can_claim_resource?: boolean | null
}

/** 归档横幅的展示数据（`title` 为空串即正常态，页面不渲染）。 */
export type RequirementArchiveBannerView = {
  state: RequirementArchiveState
  title: string
  description: string
}

/**
 * 标签树的三个视图（只挑这一页要显示的字段）。
 *
 * 区块组件要渲染「一级分类 / 二级分类 / 标签组」三级，但不该为了几个字段去 import api 模块：
 * 这里用窄类型接住，调用方传 `McTagCatalogRoot` 等完整类型照样可赋值。
 */
export type TagRootView = {
  key: string
  label: string
  first_entry_key: string | null
}

export type TagEntryView = {
  key: string
  group_name: string
}

export type TagGroupView = {
  key: string
  group_id: number
  group_name: string
  label: string
  items: { id: number; name: string }[]
}

/* ------------------------------------------------------------------ 需求字段展示 */

/**
 * 状态文案。
 *
 * `deposit_paid` 一码两义，写死在表里会读错，所以走 `shared/requirementStatus` 的消歧口径；
 * 其余状态用本页自己的简表——`pending_deposit` 在这里写「待接单/签约」，因为这一页是开发者视角，
 * 开发者看到的是「等自己去接单 / 签约」，不是需求方视角的「待付定金」。
 */
export function requirementStatusText(
  status: RequirementStatus,
  paymentMode?: RequirementPaymentMode,
): string {
  if (status === 'deposit_paid') {
    return requirementStatusLabel(status, paymentMode)
  }

  const mapping: Record<Exclude<RequirementStatus, 'deposit_paid'>, string> = {
    pending_review: '待审核',
    rejected: '已拒绝',
    pending_deposit: '待接单/签约',
    in_development: '开发中',
    pending_final: '待付尾款',
    pending_settlement: '待分账',
    completed: '已完成',
    cancelled: '已取消',
  }

  return mapping[status]
}

/** 预算：未填（含议价需求）写「待议价」。 */
export function requirementBudgetText(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return `¥${value}`
}

/** 最近更新时间：只要「月-日 时:分」，解析不出来写「时间未知」。 */
export function requirementTimeText(value?: string | null): string {
  if (!value) {
    return '时间未知'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** R014：开发周期（天）文案；未填返回空串，页面据此不渲染该格。 */
export function requirementDevelopmentCycleText(
  item: RequirementDetailFacts | null | undefined,
): string {
  return developmentCycleLabel(item?.development_cycle_days)
}

/** 无电签约定（`self_managed`）的需求没有合同与定金，审核通过即待接单。 */
export function isSelfManagedRequirement(
  item: Pick<RequirementDetailFacts, 'payment_mode'>,
): boolean {
  return item.payment_mode === 'self_managed'
}

/** 是否需要过「保证金 + 入驻协议」这道闸门：只有电签担保需求需要。 */
export function requiresDepositGate(item: Pick<RequirementDetailFacts, 'payment_mode'>): boolean {
  return !isSelfManagedRequirement(item)
}

export function requirementPaymentModeText(mode: RequirementPaymentMode): string {
  return mode === 'self_managed' ? '无电签约定' : '电签担保'
}

export function requirementPaymentText(item: Pick<RequirementDetailFacts, 'payment_mode'>): string {
  return requirementPaymentModeText(item.payment_mode)
}

/**
 * 富文本字段（需求描述 / 验收标准）的渲染 HTML。
 *
 * 先清洗再判空：清洗后为空（只有空白 / 被过滤的标签）时给兜底文案，不要留一片空白。
 */
export function requirementRichTextHtml(value?: string | null, fallback = '未填写'): string {
  return sanitizeRequirementRichText(value ?? '') || fallback
}

/** R014：合同有效期届满进入锁定 / 已清除后的横幅；未归档时 title 为空串（页面不渲染）。 */
export function requirementArchiveBannerView(
  item: RequirementDetailFacts | null | undefined,
): RequirementArchiveBannerView {
  if (!item || !isRequirementArchived(item)) {
    return { state: 'active', title: '', description: '' }
  }

  return requirementArchiveBanner(item)
}
