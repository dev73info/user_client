import type { PublicMcResourceItem } from '@/api/resources'
import { normalizeTagName } from '@/api/resourceTags'

/**
 * 首页「免费精选资源」卡片的展示层纯函数：封面回退、作者名、时间、角标、标签胶囊、
 * 摘要与封面 alt、以及精选排序比较器。
 *
 * 原先全部写死在 `views/HomeView.vue` 的 `<script setup>` 里（该视图零单测覆盖），
 * R047 拆分时收进这里：只做「资源 → 显示串」的映射，不读 store、不发请求、不碰 DOM，
 * 便于单测。行为、文案与视图内联版本逐字一致。
 */

export type ResourceCardSource = PublicMcResourceItem

/** 全角/半角混排的空格压平：卡片里的单行文案统一口径。 */
function normalizeInlineText(value?: string | null): string {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function uniqueTextParts(parts: Array<string | null | undefined>): string[] {
  return Array.from(new Set(parts.map((part) => normalizeInlineText(part)).filter(Boolean)))
}

/** 卡片标签摘要：去重后取前 2 个标签名，用 ` / ` 连接（无标签时为空串）。 */
export function summarizeResourceTags(resource: ResourceCardSource): string {
  const tags = Array.from(
    new Set(
      resource.tag_selections.flatMap((item) =>
        item.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
      ),
    ),
  )
  return tags.slice(0, 2).join(' / ')
}

/** 封面左上角标：优先标签路径二级品类（如 Java 版），否则回落平台名。 */
export function spotlightCategoryBadge(resource: ResourceCardSource): string {
  const platform = normalizeTagName(resource.platform)
  for (const selection of resource.tag_selections) {
    const path = (selection.group_path ?? []).map((part) => normalizeTagName(part)).filter(Boolean)
    if (path.length >= 2 && path[1]) {
      return path[1]
    }
  }
  return platform || '平台资源'
}

/**
 * 卡片 meta：与资源详情页的标签行一致，按分组顺序展示标签名胶囊（如 客户端 / 26.2.X / Forge）。
 * 单卡最多取 3 个，超出部分不展示，避免窄卡片被标签撑高。
 */
export function spotlightTagChips(resource: ResourceCardSource, limit = 3): string[] {
  const names = resource.tag_selections.flatMap((selection) =>
    selection.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
  )
  return Array.from(new Set(names)).slice(0, limit)
}

/** 卡片作者名口径：`author` → `creator` → 「匿名作者」。 */
export function spotlightAuthorLabel(resource: ResourceCardSource): string {
  return resource.author || resource.creator || '匿名作者'
}

/** 卡片摘要：取资源描述的第一行压平；描述为空时用标题兜底成一句引导文案。 */
export function buildResourceCardSummary(resource: ResourceCardSource): string {
  const description = normalizeInlineText(resource.description)
  const title = normalizeInlineText(resource.title) || '73Info 免费资源'

  return description || `${title}，可在 73Info 免费资源区查看详情与下载。`
}

/** 封面 alt：标题 + 平台 / 标签分类，缺分类时只留标题。 */
export function buildResourceCoverAlt(resource: ResourceCardSource): string {
  const title = normalizeInlineText(resource.title) || '73Info 免费资源'
  const context = uniqueTextParts([
    normalizeTagName(resource.platform),
    summarizeResourceTags(resource),
  ])

  if (context.length === 0) {
    return `${title} 的资源封面图`
  }

  return `${title} 的资源封面图，分类为 ${context.join('、')}`
}

/**
 * 封面地址：图片加载失败过的地址返回空串，交给模板回落成首字占位块。
 * `failedUrls` 由调用方（视图）维护，保持函数本身无状态、可单测。
 */
export function resolveSpotlightCover(
  coverUrl: string | null | undefined,
  failedUrls: ReadonlySet<string>,
): string {
  return coverUrl && !failedUrls.has(coverUrl) ? coverUrl : ''
}

/** 封面角标文案：仅有效精选出「精选」，置顶与纯高赞无角标（空串表示不展示）。 */
export function spotlightMarkFor(item: Pick<ResourceCardSource, 'is_featured'>): string {
  return item.is_featured ? '精选' : ''
}

/**
 * 首页精选区排序：有效精选 → 有效置顶 → 点赞 → 更新时间 → id。
 * 比较器必须满足全序，否则 `Array.prototype.sort` 的稳定性会被破坏。
 */
export function compareSpotlightResources(
  left: ResourceCardSource,
  right: ResourceCardSource,
): number {
  const featuredDelta = Number(!!right.is_featured) - Number(!!left.is_featured)
  if (featuredDelta !== 0) {
    return featuredDelta
  }

  const pinnedDelta = Number(!!right.is_pinned) - Number(!!left.is_pinned)
  if (pinnedDelta !== 0) {
    return pinnedDelta
  }

  const likeDelta = (right.like_count ?? 0) - (left.like_count ?? 0)
  if (likeDelta !== 0) {
    return likeDelta
  }

  const leftUpdatedAt = Date.parse(left.updated_at)
  const rightUpdatedAt = Date.parse(right.updated_at)
  const updatedDelta =
    (Number.isNaN(rightUpdatedAt) ? 0 : rightUpdatedAt) -
    (Number.isNaN(leftUpdatedAt) ? 0 : leftUpdatedAt)
  if (updatedDelta !== 0) {
    return updatedDelta
  }

  return right.id - left.id
}
