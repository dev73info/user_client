/** 开发者资源列表（`views/DevResourceListView.vue`）的纯函数口径。
 *
 * 从视图里抽出来的都是「不碰请求、不碰 DOM」的判定与文案：关键词 / 状态筛选、顶栏四项读数、
 * 空态文案、状态列的曝光行程、道具卡可用性。取值、文案与判定顺序一字未改——
 * 这里不持有响应式状态，单测直接喂参数，视图与子组件只负责排版。
 */
import type { McResourcePayload } from '@/api/mcResources'
import { isResourceArchiveLocked, resourceTagSummary } from '@/shared/resourcePresentation'

/** 状态筛选的三个档位；空串表示不筛（下拉清空后的取值）。 */
export type DevResourceVisibilityFilter = '' | 'published' | 'review' | 'draft'

/**
 * 本页的筛选条件。
 *
 * 搜索与状态筛选都在前端做：这一页的数据源本身就一次取回全部资源，
 * 与需求大厅（服务端分页查询）不同，所以没有「查询」按钮，输入即过滤。
 */
export type DevResourceListFilters = {
  keyword: string
  visibility: DevResourceVisibilityFilter
}

/** 状态筛选下拉的三项：顺序即下拉里的顺序。 */
export const DEV_RESOURCE_VISIBILITY_OPTIONS = [
  { value: 'published', label: '已公开' },
  { value: 'review', label: '审核中' },
  { value: 'draft', label: '私有' },
] as const

/** 有没有生效的筛选：同时决定空态文案与工具栏里的「筛选出 N / M 个」。 */
export function hasResourceListFilters(filters: DevResourceListFilters): boolean {
  return Boolean(filters.keyword.trim()) || Boolean(filters.visibility)
}

/**
 * 关键词 + 状态筛选。
 *
 * 关键词比标题、作者、描述与标签摘要，去首尾空白、忽略大小写；空关键词视为不筛
 * （也就不用逐行算标签摘要）。
 */
export function filterDevResources(
  resources: McResourcePayload[],
  filters: DevResourceListFilters,
): McResourcePayload[] {
  const keyword = filters.keyword.trim().toLowerCase()

  return resources.filter((item) => {
    if (filters.visibility && item.visibility !== filters.visibility) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [item.title, item.author, item.description, resourceTagSummary(item)].some((value) =>
      (value ?? '').toLowerCase().includes(keyword),
    )
  })
}

/** 顶栏读数：资源总数 / 公开 / 审核中 / 私有，外加 R014 的「已锁定」条数。 */
export type DevResourceListCounts = {
  total: number
  published: number
  review: number
  draft: number
  /** R014：列表里已进入超期锁定 / 已清除的资源数；> 0 时表格上方给一条锁定说明。 */
  archiveLocked: number
}

/** 一次遍历数出全部读数，免得四个 `filter().length` 各扫一遍。 */
export function countDevResources(resources: McResourcePayload[]): DevResourceListCounts {
  const counts: DevResourceListCounts = {
    total: resources.length,
    published: 0,
    review: 0,
    draft: 0,
    archiveLocked: 0,
  }

  for (const item of resources) {
    if (item.visibility === 'published') {
      counts.published += 1
    } else if (item.visibility === 'review') {
      counts.review += 1
    } else {
      counts.draft += 1
    }

    if (isResourceArchiveLocked(item)) {
      counts.archiveLocked += 1
    }
  }

  return counts
}

/** 表格空态文案：加载中优先，其次区分「筛不出来」与「还没有资源」。 */
export function resourceListEmptyText(loading: boolean, hasActiveFilters: boolean): string {
  if (loading) {
    return '资源列表加载中'
  }

  return hasActiveFilters ? '没有符合筛选条件的资源' : '当前还没有资源记录'
}

/** 状态列里的曝光行程（精选 / 置顶的有效期）；都没有时返回空串，模板据此不渲染那一行。 */
export function formatExposureStatus(resource: McResourcePayload): string {
  const parts: string[] = []
  if (resource.is_featured) {
    parts.push(resource.featured_until ? `精选至 ${resource.featured_until}` : '精选（永久）')
  }
  if (resource.is_pinned && resource.pinned_until) {
    parts.push(`置顶至 ${resource.pinned_until}`)
  }
  return parts.join(' · ')
}
