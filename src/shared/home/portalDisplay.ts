import type { RouteLocationRaw } from 'vue-router'
import type { CommunityPost } from '@/api/community'
import type {
  PublicRequirementSpotlightItem,
  RequirementPaymentMode,
  RequirementStatus,
} from '@/api/requirements'
import { normalizeTagName } from '@/api/resourceTags'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'

/**
 * 首页侧栏「平台公告」与「内测里程碑」的展示层纯函数：公告取数与截断、状态文案、
 * 金额 / 时间格式化、里程碑进度百分比。
 *
 * 原先写死在 `views/HomeView.vue`（零单测覆盖），R047 拆分时收进来：
 * 只做「值 → 显示串」映射，不读 store、不发请求，便于单测。
 * 公告的取数顺序（公告 3 条 → 最新成交 → 公开资源 → 最新需求，整体截断到 4 条）与视图内联版一致。
 */

export type PortalNotice = {
  title: string
  date: string
  tag?: string
  to?: RouteLocationRaw
}

/** 公告里的公开资源只需要这几个字段，避免把整个资源类型拖进来。 */
export type PortalNoticeResource = {
  id: number
  title: string
  platform: string
  updated_at: string
  price_fen: number
  price_points: number
}

export type PortalNoticeSources = {
  /** 已发布的平台公告（视图已在取数后过滤 status === 'published'） */
  posts: Array<Pick<CommunityPost, 'id' | 'title' | 'published_at'>>
  /** 最近一条成交（`at` 已是格式化后的时间文案） */
  latestDeal?: { title: string; at: string } | null
  /** 最近一条公开资源 */
  resource?: PortalNoticeResource | null
  /** 公开资源的标签路由（拿不到时回落「免费资源」列表页） */
  resourceRoute?: { rootSlug: string; entrySlug: string } | null
  /** 最新一条公开需求 */
  spotlight?: Pick<
    PublicRequirementSpotlightItem,
    'title' | 'updated_at' | 'status' | 'payment_mode'
  > | null
}

/**
 * 平台公告列表：公告最多 3 条，之后依次追加最新成交 / 公开资源 / 最新需求，
 * 最后整体截断到 4 条（侧栏列表高度固定，第 5 条开始不展示）。
 */
export function buildPortalNotices(sources: PortalNoticeSources): PortalNotice[] {
  const notices: PortalNotice[] = []

  for (const post of sources.posts.slice(0, 3)) {
    notices.push({
      title: post.title,
      date: formatTimeLabel(post.published_at),
      tag: '公告',
      to: { name: 'community-post', params: { postId: String(post.id) } },
    })
  }

  if (sources.latestDeal) {
    notices.push({
      title: `最新成交：${sources.latestDeal.title}`,
      date: sources.latestDeal.at,
      tag: 'HOT',
    })
  }

  const resource = sources.resource
  if (resource) {
    notices.push({
      title: `公开资源：${resource.title}`,
      date: formatTimeLabel(resource.updated_at),
      tag: normalizeTagName(resource.platform),
      to: sources.resourceRoute
        ? resourceDetailLocation({
            resourceId: resource.id,
            rootSlug: sources.resourceRoute.rootSlug,
            entrySlug: sources.resourceRoute.entrySlug,
            sale: resourceListingSaleOf(resource.price_fen, resource.price_points),
          })
        : { name: 'resources', query: { sale: 'free' } },
    })
  }

  const spotlight = sources.spotlight
  if (spotlight) {
    notices.push({
      title: `需求：${spotlight.title}`,
      date: formatTimeLabel(spotlight.updated_at),
      tag: statusToLabel(spotlight.status, spotlight.payment_mode),
      to: { name: 'requirement-hall' },
    })
  }

  return notices.slice(0, 4)
}

/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去（见 `requirementStatusLabel`）。 */
export function statusToLabel(
  status: RequirementStatus,
  paymentMode?: RequirementPaymentMode,
): string {
  return requirementStatusLabel(status, paymentMode)
}

/** 预算文案：空值走「待议价」，其余原样加人民币符号（不做千分位，避免与详情页口径打架）。 */
export function formatMoney(budget?: number | null): string {
  if (budget == null) {
    return '待议价'
  }

  return `¥${budget}`
}

/** 时间文案：`3/5 14:30` 口径；无法解析的日期回落「刚刚更新」。 */
export function formatTimeLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 里程碑进度百分比：目标为 0 时按 0% 处理，超出目标夹到 100%。 */
export function progressPercent(progress: { current: number; target: number }): string {
  if (!progress.target) return '0%'
  const ratio = Math.min(100, Math.round((progress.current / progress.target) * 100))
  return `${ratio}%`
}
