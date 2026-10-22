import type { CreateMcResourceTagSelection } from '@/api/mcResources'
import type { McPublishTagGroup } from '@/api/resourceTags'
import { requiresDepositGate, type RequirementDetailFacts } from '@/shared/devRequirementDetail'

/**
 * 「接取需求」的资格闸门、资源方案与占位资源字段（全是纯函数）。
 *
 * 这一半回答的是「能不能接、接的时候交什么」：保证金 / 信用 / 入驻协议三道坎，
 * 加上「关联已有资源」与「先建一个草稿资源」两条路的提交口径。
 * 展示口径（状态文案、预算、富文本）在 `shared/devRequirementDetail`，两边不混。
 */

/** 可绑定的开发项目只用到这五个字段（下拉文案与可用性判定）。 */
export type BindableResourceFacts = {
  id: number
  title: string
  author: string
  requirement_id: string | null
  visibility: string
}

/** 资源初始化表单（新资源项目那一支）。 */
export type ResourceInitForm = {
  title: string
  author: string
  originType: 'original' | 'repost'
  originAuthor: string
  originUrl: string
  originOrg: string
  originNote: string
}

/* ------------------------------------------------------------------ 可绑定资源 */

export function bindableResourceLabel(resource: BindableResourceFacts): string {
  return `${resource.title} · ${resource.author}`
}

/** 只有「未绑定需求 + 私有（草稿）」的资源能直接关联；已提审 / 已公开的不行。 */
export function isBindableResource(resource: BindableResourceFacts): boolean {
  return !resource.requirement_id && resource.visibility === 'draft'
}

/** 有「已提审 / 已公开」的未绑定资源时，页面要说明它们为什么不能在这里绑。 */
export function hasPendingBindableResources(
  resources: ReadonlyArray<BindableResourceFacts>,
): boolean {
  return resources.some((item) => !item.requirement_id && item.visibility !== 'draft')
}

/* ------------------------------------------------------------------ 保证金 / 信用闸门 */

/** 可用保证金读数：固定两位小数，避免 ¥1200 与 ¥1200.00 两处写法。 */
export function availableDepositText(availableCny?: number | null): string {
  return `¥${(availableCny ?? 0).toFixed(2)}`
}

/**
 * 接单信用上限：未开启「订单额度限制」时视为不限（`Infinity`），
 * 这样比较式不用处处判空。
 */
export function orderCreditCap(
  credit: { enforce_order_limit: boolean; max_order_amount_cny: number } | null,
): number {
  if (!credit || !credit.enforce_order_limit) {
    return Number.POSITIVE_INFINITY
  }

  return credit.max_order_amount_cny
}

/** 预算是否在信用上限内（留 0.0001 的浮点余量，避免 999.99 vs 1000 这类误判）。 */
export function isBudgetWithinCap(budget: number | null | undefined, creditCap: number): boolean {
  return (budget ?? 0) <= creditCap + 0.0001
}

export type BindingGateInput = {
  requirement: RequirementDetailFacts | null
  /** 《开发者入驻协议》是否已签署（后端 `developer_agreement_signed`）。 */
  agreementSigned: boolean
  /** 后端 `can_bind_requirement`：保证金余额是否够接单。 */
  canBindRequirement: boolean
  availableCny?: number | null
  creditCap: number
}

/**
 * 关联需求前的阻塞原因（空串表示可以继续）。
 *
 * 顺序就是给用户看的顺序：先「没签协议」这种一步能补齐的，再「保证金不够」，
 * 最后才是信用额度——前一条没过时后面几条都是废话。
 */
export function bindingBlockReason(input: BindingGateInput): string {
  const currentRequirement = input.requirement
  if (!currentRequirement || !requiresDepositGate(currentRequirement)) {
    return ''
  }

  if (!input.agreementSigned) {
    return '请先签署《开发者入驻协议》后再接取电签担保需求'
  }

  if (!input.canBindRequirement) {
    return `当前可用保证金不足，当前可用：${availableDepositText(input.availableCny)}`
  }

  if ((currentRequirement.budget ?? 0) > (input.availableCny ?? 0)) {
    return '当前需求预算高于可用保证金，请先补充保证金'
  }

  if (!isBudgetWithinCap(currentRequirement.budget, input.creditCap)) {
    return `当前信用最高可接 ¥${input.creditCap.toFixed(2)} 的需求，无法绑定此预算`
  }

  return ''
}

export type SubmitBindingGateInput = BindingGateInput & {
  reviewConfirmed: boolean
  finalConfirmed: boolean
  mode: 'existing' | 'new'
  /** 已选中的开发项目（existing 模式必须选到一个仍然可用的）。 */
  selectedResource: BindableResourceFacts | null
  canCreateResource: boolean
}

/** 「确认关联」按钮能不能点：闸门 + 两次确认 + 对应的资源方案都齐了才放行。 */
export function canSubmitBinding(input: SubmitBindingGateInput): boolean {
  if (
    !input.requirement ||
    Boolean(bindingBlockReason(input)) ||
    !input.reviewConfirmed ||
    !input.finalConfirmed
  ) {
    return false
  }

  if (input.mode === 'existing') {
    return Boolean(input.selectedResource)
  }

  return input.canCreateResource
}

/* ------------------------------------------------------------------ 资源初始化（新资源项目） */

/**
 * 资源标题 → 文件名 / URL 里的 slug。
 *
 * 与后端无关，纯粹为了「先建一个占位资源」时字段不空：标题全中文时落到 `resource`。
 */
export function resourceSlug(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'resource'
}

/** 待上传资源包的占位文件名（`*.package`）。 */
export function derivedResourceFileName(title: string): string {
  return `${resourceSlug(title)}.package`
}

/**
 * 占位来源地址：真正的下载地址要在开发者上传资源包后才有，
 * 这里用 `pending://` 占位，同时把平台 / 分区 / slug 记进去，便于后台认领。
 */
export function derivedResourceSourceUrl(input: {
  title: string
  platform: string
  entryKey: string
}): string {
  const entry = input.entryKey || 'catalog'

  return `pending://resource/${input.platform}/${entry}/${resourceSlug(input.title)}`
}

/**
 * 新资源必填校验（空串表示可以提交）。
 *
 * 顺序与表单从上到下一致：标题 → 作者 → 标签可用性 → 至少一个标签。
 * 标签一项先判「当前分类有没有标签组」再判「勾没勾」，否则空分类会提示用户去勾一个不存在的标签。
 */
export function resourceInitBlockReason(input: {
  form: ResourceInitForm
  tagGroupCount: number
  selectedTagCount: number
}): string {
  if (!input.form.title.trim()) {
    return '请填写资源标题'
  }

  if (!input.form.author.trim()) {
    return '请填写作者名称'
  }

  if (input.tagGroupCount === 0) {
    return '当前分类下暂无可用标签，请切换分类或刷新标签'
  }

  if (input.selectedTagCount === 0) {
    return '请至少选择一个标签'
  }

  return ''
}

/** 二次确认里显示的「即将关联到哪个资源」。 */
export function confirmResourceLabel(input: {
  mode: 'existing' | 'new'
  selectedTitle?: string
  initTitle: string
}): string {
  if (input.mode === 'existing') {
    return input.selectedTitle ?? '未选择资源'
  }

  return input.initTitle.trim() || '待初始化的新资源项目'
}

/** 新资源初始化摘要（喂给占位资源的 `description`）。 */
export function resourceInitSummary(input: {
  title: string
  entryLabel: string
  platformLabel: string
  selectedTagCount: number
}): string {
  if (!input.title.trim()) {
    return ''
  }

  return `${input.entryLabel} · ${input.platformLabel} 资源项目，已选 ${input.selectedTagCount} 个标签。`
}

/** 归类提交口径：只提交「有勾选」的组。 */
export function buildBindingTagSelections(
  groups: ReadonlyArray<McPublishTagGroup>,
  selectedTagIdsByGroup: Record<number, number[]>,
): CreateMcResourceTagSelection[] {
  return groups
    .map((group) => ({
      group_id: group.group_id,
      tag_ids: [...(selectedTagIdsByGroup[group.group_id] ?? [])],
    }))
    .filter((selection) => selection.tag_ids.length > 0)
}
