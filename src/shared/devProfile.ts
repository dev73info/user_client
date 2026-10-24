/**
 * 开发者公开主页（`/user/:username/profile`）的纯逻辑。
 *
 * 背景焦点换算、视频判定、打赏时间文案、头部读数与资源跳转落点都在这里：
 * 不碰响应式、不碰 DOM、不弹提示，视图与 composable 只做装配。
 */
import type { RouteLocationRaw } from 'vue-router'

import type { PublicMcResourceItem } from '@/api/resources'
import { getResourceDetailSlug, getTagRouteSlug } from '@/api/resourceTags'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'
import { parseBackendDateTime } from '@/shared/datetime'

/** 背景裁剪焦点：scale 是缩放，x / y 是 translate 百分比。 */
export type BgFocus = { scale: number; x: number; y: number }

/** 未调整过的焦点：不缩放、不平移。 */
export const DEFAULT_BG_FOCUS: BgFocus = { scale: 1, x: 0, y: 0 }

/** 把数值夹在 [min, max] 之间。 */
export function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 解析后端存的焦点 JSON；空值或坏 JSON 一律回默认焦点，不抛错。 */
export function parseFocus(json?: string | null): BgFocus {
  if (!json) {
    return { ...DEFAULT_BG_FOCUS }
  }
  try {
    const value = JSON.parse(json) as Partial<BgFocus>
    return {
      scale: typeof value.scale === 'number' ? value.scale : 1,
      x: typeof value.x === 'number' ? value.x : 0,
      y: typeof value.y === 'number' ? value.y : 0,
    }
  } catch {
    return { ...DEFAULT_BG_FOCUS }
  }
}

/** 焦点序列化：提交给后端的 `focus` 字段。 */
export function focusToJson(focus: BgFocus): string {
  return JSON.stringify({ scale: focus.scale, x: focus.x, y: focus.y })
}

/** 当前缩放下的可平移上限（百分比）：放大越多，可拖动的边越宽。 */
export function cropLimit(scale: number): number {
  return ((scale - 1) / scale) * 50
}

/** 背景地址是不是视频；静态图与动图都走 `<img>`。 */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(url)
}

/** 打赏留言时间：能解析就本地化，解析不了原样返回（老数据是自由文本）。 */
export function formatTipTime(value: string): string {
  const date = parseBackendDateTime(value)
  if (!date) {
    return value
  }
  return date.toLocaleString('zh-CN')
}

/** 头部读数里的资源侧三项：资源数、总点赞、涉及平台数。 */
export function computeResourceStats(resources: PublicMcResourceItem[]) {
  return {
    resourceCount: resources.length,
    totalLikes: resources.reduce((sum, resource) => sum + resource.like_count, 0),
    platforms: new Set(resources.map((resource) => resource.platform).filter(Boolean)).size,
  }
}

/**
 * 资源卡片的跳转落点：优先走分类段齐全的页内详情态。
 *
 * 资源没有分类标签时分类段是空字符串，push 带分类的路由会抛
 * `Missing required param "rootSlug"`，这时退回按 `<作者>--<id>` 的轻量重定向。
 */
export function resolveResourceTarget(resource: PublicMcResourceItem): RouteLocationRaw {
  const selections = resource.tag_selections ?? []
  const rootName =
    selections.find((selection) => selection.group_path.length > 0)?.group_path[0] ?? ''
  const entryName =
    selections.find((selection) => selection.group_path.length > 1)?.group_path[1] ??
    (resource.platform || '')
  const rootAlias =
    selections.find((selection) => (selection.group_path_aliases?.length ?? 0) > 0)
      ?.group_path_aliases?.[0] ?? ''
  const entryAlias =
    selections.find((selection) => (selection.group_path_aliases?.length ?? 0) > 1)
      ?.group_path_aliases?.[1] ?? ''
  const rootSlug = rootAlias || getTagRouteSlug(rootName)
  const entrySlug = entryAlias || getTagRouteSlug(entryName)
  const resourceSlug = getResourceDetailSlug(resource.id, resource.creator || resource.author)

  if (!rootSlug || !entrySlug) {
    return { name: 'resource-detail-direct', params: { resourceSlug } }
  }

  return resourceDetailLocation({
    resourceId: resource.id,
    rootSlug,
    entrySlug,
    sale: resourceListingSaleOf(resource.buyout_price_fen, resource.price_points),
  })
}
