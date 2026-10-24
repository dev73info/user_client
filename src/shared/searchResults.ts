import { apiUrl } from '@/api/http'
import type { PublicMcResourceItem } from '@/api/resources'
import type { PublicRequirementSpotlightItem, RequirementItem } from '@/api/requirements'
import { normalizeTagName } from '@/api/resourceTags'
import { requirementPaymentModeLabel } from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { requirementRichTextPreview } from '@/utils/requirementRichText'

/**
 * 搜索结果页的纯函数域（拆 `SearchResultsView` 时整块搬出，取值口径一字未改）。
 *
 * 这页的搜索是**前端过滤**：资源与需求都是「接口取回结果集 → 拼一段可搜索文本 → `includes`」
 * 这条路，所以下面两支 `build*SearchText` 的字段清单本身就是搜索口径，加一个字段 = 扩大命中面。
 *
 * 状态与发布方式的文案走全站统一口径（`requirementStatusLabel` / `requirementPaymentModeLabel`）：
 * `deposit_paid` 一码两义（待付首款 / 待付尾款），所以状态文案必须把支付模式一起算进去。
 */

/** 资源卡片的可搜索文本：标题、简介、作者、平台、文件名、版本说明 + 全部标签（含别名与分组路径）。 */
export function buildResourceSearchText(resource: PublicMcResourceItem): string {
  return [
    resource.title,
    resource.description,
    resource.author,
    resource.creator,
    resource.platform,
    resource.file_name,
    resource.release_note ?? '',
    ...resource.tag_selections.flatMap((selection) => [
      selection.group_name,
      selection.group_alias ?? '',
      ...selection.group_path,
      ...(selection.group_path_aliases ?? []),
      ...selection.tag_names,
      ...(selection.tag_aliases ?? []),
    ]),
  ]
    .join(' ')
    .toLowerCase()
}

/** 需求卡片的可搜索文本：编号、标题、描述与验收标准的纯文本预览、发布方式、状态文案。 */
export function buildRequirementSearchText(requirement: PublicRequirementSpotlightItem): string {
  return [
    requirement.requirement_id,
    requirement.title,
    requirementRichTextPreview(requirement.description, ''),
    requirementRichTextPreview(requirement.acceptance_criteria, ''),
    requirementPaymentModeLabel(requirement.payment_mode),
    requirementStatusText(requirement.status, requirement.payment_mode),
  ]
    .join(' ')
    .toLowerCase()
}

/** 卡片上最多挂三枚标签：平台永远占第一枚，其余按出现顺序去重。 */
export function resourceTags(resource: PublicMcResourceItem): string[] {
  const tags = resource.tag_selections.flatMap((selection) =>
    selection.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
  )
  return Array.from(new Set([normalizeTagName(resource.platform), ...tags].filter(Boolean))).slice(
    0,
    3,
  )
}

/** 平台的展示名（标签体系里的规范写法，可能为空串）。 */
export function resourcePlatformLabel(resource: PublicMcResourceItem): string {
  return normalizeTagName(resource.platform)
}

/** 封面缺省时卡片左侧那两个字：平台名前两个字，仍为空就给「资」。 */
export function resourceInitials(resource: PublicMcResourceItem): string {
  return normalizeTagName(resource.platform).slice(0, 2) || '资'
}

export function resourceDescription(resource: PublicMcResourceItem): string {
  const description = resource.description.replace(/\s+/g, ' ').trim()
  return previewText(description || '该资源暂未填写简介，可进入详情查看下载与版本信息。')
}

export function requirementDescription(requirement: PublicRequirementSpotlightItem): string {
  return previewText(
    requirementRichTextPreview(requirement.description, '当前需求暂未补充详细描述。'),
  )
}

export function previewText(value: string, maxLength = 120): string {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength)}...`
}

/** 封面走接口前缀（后端给的是相对路径），空封面交给卡片的文字兜底。 */
export function resourceCoverUrl(resource: PublicMcResourceItem): string {
  return resource.cover_url ? apiUrl(resource.cover_url) : ''
}

/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去（见 `requirementStatusLabel`）。 */
export function requirementStatusText(status: string, paymentMode?: string): string {
  return requirementStatusLabel(status, paymentMode)
}

/**
 * 精选摘要 + 工作台详情的合并口径：详情里有的字段以详情为准，
 * 详情没给的（`??`）保留摘要里的那份，避免弹窗在补详情后反而变空。
 */
export function mergeRequirementDetail(
  current: PublicRequirementSpotlightItem,
  detail: RequirementItem,
): PublicRequirementSpotlightItem {
  return {
    ...current,
    title: detail.title,
    description: detail.description ?? current.description,
    acceptance_criteria: detail.acceptance_criteria ?? current.acceptance_criteria,
    budget: detail.budget ?? current.budget,
    payment_mode: detail.payment_mode,
    status: detail.status,
  }
}
