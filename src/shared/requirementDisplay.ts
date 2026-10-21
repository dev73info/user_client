import type {
  PublicRequirementSpotlightItem,
  RequirementOverviewResp,
  RequirementPaymentMode,
} from '@/api/requirements'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import {
  requirementRichTextPreview,
  sanitizeRequirementRichText,
} from '@/utils/requirementRichText'

/**
 * 需求相关页面的展示层纯函数：发布方式文案、金额与时间格式、需求大厅的筛选 / 统计 / 空态口径、
 * 详情弹窗的富文本回退、最近交付的星级与评论预览。
 *
 * 原先散在 `views/RequirementHallView.vue` 里（`filteredRequirements` / `hallStats` /
 * `hallEmptyTitle` / `dealStarClass` / `dealCommentPreview` / 两个 `*Html` computed），
 * 拆分时收进这里：只做「值 → 显示串」的映射，不读 store、不发请求，便于单测。
 */

export function requirementPaymentModeLabel(mode: string): string {
  return mode === 'self_managed' ? '无电签约定' : '电签担保'
}

export function formatCny(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

export function formatCnDateTime(value: string): string {
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

/* ---------- 需求大厅：担保方式筛选 ---------- */

/**
 * 需求大厅「担保方式」筛选的取值。
 *
 * `all` = 不筛；其余两个取值直接透传给后端 `payment_mode` 参数，
 * 语义以后端 `requirement.payment_mode` 为准，前端不做本地假筛。
 */
export type RequirementGuaranteeFilter = 'all' | RequirementPaymentMode

/** 下拉选项（顺序即下拉顺序）：`全部` + 两档担保方式，文案与卡片上的胶囊同一口径。 */
export const REQUIREMENT_GUARANTEE_FILTERS: Array<{
  label: string
  value: RequirementGuaranteeFilter
}> = [
  { label: '全部', value: 'all' },
  { label: requirementPaymentModeLabel('platform_guarantee'), value: 'platform_guarantee' },
  { label: requirementPaymentModeLabel('self_managed'), value: 'self_managed' },
]

/**
 * 下拉回传的值收敛成三档之一。
 *
 * 组件库的事件载荷是宽类型，清空、透传杂值时不能让它落到筛选状态里：
 * 不认识的取值一律按 `all`（不筛）处理，与原来的三元判断等价。
 */
export function normalizeRequirementGuaranteeFilter(value: unknown): RequirementGuaranteeFilter {
  return value === 'platform_guarantee' || value === 'self_managed' ? value : 'all'
}

/** 请求里的 `payment_mode`：`all` 时返回 `undefined`，公开接口据此不带这个参数。 */
export function requirementGuaranteeRequestMode(
  filter: RequirementGuaranteeFilter,
): RequirementPaymentMode | undefined {
  return filter === 'all' ? undefined : filter
}

/* ---------- 需求大厅：列表筛选、读数与空态 ---------- */

/**
 * 关键词是否命中一条需求。
 *
 * 命中的字段是「编号 + 标题 + 说明正文 + 担保方式 + 状态」拼起来的整串（与原来内联的
 * `searchable` 拼法逐字一致）：用户按「待付尾款」「电签担保」也能搜到，不只是标题。
 * 关词为空时一律命中（不筛）。
 */
export function requirementMatchesKeyword(
  item: PublicRequirementSpotlightItem,
  keyword: string,
): boolean {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  const searchable = [
    item.requirement_id,
    item.title,
    requirementRichTextPreview(item.description, ''),
    requirementPaymentModeLabel(item.payment_mode),
    requirementStatusLabel(item.status, item.payment_mode),
  ]
    .join(' ')
    .toLowerCase()

  return searchable.includes(normalized)
}

/** 侧栏「大厅概览」三格读数：可浏览需求取后端 total，其余两格取公开概览。 */
export function requirementHallStats(
  hallTotal: number,
  overview: RequirementOverviewResp | null,
): Array<{ label: string; value: string }> {
  return [
    { label: '可浏览需求', value: `${hallTotal} 条` },
    { label: '已完成需求', value: `${overview?.total_orders ?? 0} 单` },
    { label: '好评率', value: `${(overview?.positive_rate ?? 0).toFixed(1)}%` },
  ]
}

/** 空态标题跟着当前生效的筛选走：关键词优先，其次担保方式，最后才是「大厅本来就没单」。 */
export function requirementHallEmptyTitle(
  keyword: string,
  guaranteeFilter: RequirementGuaranteeFilter,
): string {
  if (keyword.trim()) {
    return '没有匹配的需求'
  }
  if (guaranteeFilter === 'platform_guarantee') {
    return `当前没有${requirementPaymentModeLabel('platform_guarantee')}的需求`
  }
  if (guaranteeFilter === 'self_managed') {
    return `当前没有${requirementPaymentModeLabel('self_managed')}的需求`
  }
  return '当前没有可展示的需求'
}

/** 侧栏「最近交付」只取前几条；概览还没回来时是空列表（模板据此出空态）。 */
export function requirementRecentDeals<T>(deals: T[] | undefined | null, limit = 3): T[] {
  return deals?.slice(0, limit) ?? []
}

/* ---------- 侧栏「最近交付」：星级与评论 ---------- */

/**
 * 只读星级：满星 / 半星 / 空星，与评价弹窗同一套 0.5 步口径。
 *
 * `index` 是第几颗星（从 1 开始）；没有评分（null / 非有限数）时全空。
 */
export function dealStarClass(rating: number | null | undefined, index: number): string {
  if (rating == null || !Number.isFinite(rating)) {
    return ''
  }
  if (rating >= index) {
    return 'is-full'
  }
  if (rating >= index - 0.5) {
    return 'is-half'
  }
  return ''
}

/**
 * 评论预览：去掉「只填了数字」的脏数据（会和星级分数叠成「4.5 1」），
 * 太短也没信息量，宁可不展示。
 */
export function dealCommentPreview(text: string | null | undefined): string {
  const trimmed = text?.trim() ?? ''
  if (!trimmed || /^\d+(\.\d+)?$/.test(trimmed) || trimmed.length < 2) {
    return ''
  }
  return trimmed
}

/* ---------- 需求详情弹窗 ---------- */

/** 详情里的需求描述：先洗一遍富文本，没内容时给占位文案。 */
export function requirementDetailDescriptionHtml(description?: string | null): string {
  return sanitizeRequirementRichText(description ?? '') || '当前需求暂未补充详细描述。'
}

/** 详情里的验收标准：精选列表常常不带这份字段，补详情期间文案要改成「加载中」。 */
export function requirementDetailAcceptanceHtml(
  acceptance?: string | null,
  loading = false,
): string {
  return (
    sanitizeRequirementRichText(acceptance ?? '') ||
    (loading ? '验收标准加载中...' : '当前需求暂未补充验收标准。')
  )
}

/** 这条需求是不是我自己发的：自己的需求不给「前往工作台接取」。 */
export function requirementOwnedByCurrentUser(
  isAuthed: boolean,
  username: string,
  item: PublicRequirementSpotlightItem | null | undefined,
): boolean {
  if (!isAuthed || !item?.creator) {
    return false
  }

  return item.creator === username
}

/** 详情弹窗里「前往工作台接取需求」的可见性：有详情、登录了、且不是自己发的需求。 */
export function canOpenRequirementWorkbench(
  isAuthed: boolean,
  username: string,
  item: PublicRequirementSpotlightItem | null | undefined,
): boolean {
  if (!item) {
    return false
  }

  return isAuthed && !requirementOwnedByCurrentUser(isAuthed, username, item)
}
