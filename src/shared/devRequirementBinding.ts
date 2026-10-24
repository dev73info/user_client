import type { CreateMcResourceTagSelection } from '@/api/mcResources'
import type { McPublishTagGroup } from '@/api/resourceTags'
import { requiresDepositGate, type RequirementDetailFacts } from '@/shared/devRequirementDetail'

/**
 * 「接取需求」的资格闸门、资源方案与占位资源字段（全是纯函数）。
 *
 * 这一半回答的是「能不能接、接的时候交什么」：入驻协议一道坎，
 * 加上「关联已有资源」与「先建一个草稿资源」两条路的提交口径。
 * 展示口径（状态文案、预算、富文本）在 `shared/devRequirementDetail`，两边不混。
 *
 * 保证金与信用额度**不在这里判**：那两份读数（1.x 的预付保证金钱包与 `/credit/**`）
 * 在当前后端契约里一条路径都没有。担保单接单时后端按开发者可提现收益冻结保证金，
 * 不够会回 409 中文说明——前端不预判，也不用编出来的读数挡人。
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

/* ------------------------------------------------------------------ 入驻协议闸门 */

export type BindingGateInput = {
  requirement: RequirementDetailFacts | null
  /** 《开发者入驻协议》是否已签署（后端 `developer_agreement_signed`）。 */
  agreementSigned: boolean
}

/** 关联需求前的阻塞原因（空串表示可以继续）。只有入驻协议一道坎。 */
export function bindingBlockReason(input: BindingGateInput): string {
  const currentRequirement = input.requirement
  if (!currentRequirement || !requiresDepositGate(currentRequirement)) {
    return ''
  }

  if (!input.agreementSigned) {
    return '请先签署《开发者入驻协议》后再接取电签担保需求'
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
