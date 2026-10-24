import type { RouteLocationRaw } from 'vue-router'
import type { PublicRequirementSpotlightItem } from '@/api/requirements'
import { normalizeTagName } from '@/api/resourceTags'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { parseBackendDateTime } from '@/shared/datetime'
import { resourceDetailLocation, resourceListingSaleOf } from '@/shared/resourceNavigation'

/**
 * 首页侧栏「平台公告」与「内测里程碑」的展示层纯函数：公告取数与截断、状态文案、
 * 金额 / 时间格式化、里程碑进度百分比。
 *
 * 原先写死在 `views/HomeView.vue`（零单测覆盖），R047 拆分时收进来：
 * 只做「值 → 显示串」映射，不读 store、不发请求，便于单测。
 * 公告的取数顺序（最新成交 → 公开资源 → 最新需求，整体截断到 4 条）与视图内联版一致。
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
  buyout_price_fen: number
  price_fen: number
  price_points: number
}

export type PortalNoticeSources = {
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
 * 平台公告列表：依次是最新成交 / 公开资源 / 最新需求，
 * 最后整体截断到 4 条（侧栏列表高度固定，第 5 条开始不展示）。
 */
export function buildPortalNotices(sources: PortalNoticeSources): PortalNotice[] {
  const notices: PortalNotice[] = []

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
            sale: resourceListingSaleOf(resource.buyout_price_fen, resource.price_points),
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
export function statusToLabel(status: string, paymentMode?: string): string {
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
  const date = parseBackendDateTime(iso)
  if (!date) {
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

/** 冷启动里程碑目标：内测期先写死，后续接配置时只改这里。 */
export const MILESTONE_TARGETS = {
  developers: 1000,
  resources: 50,
} as const

/** 统计卡的图标：纯函数层只给 key，由组件映射到 `ui_73info` 的图标组件（纯函数不拖组件引用）. */
export type MilestoneStatIcon = 'developers' | 'resources' | 'orders' | 'escrow'

export type PortalMilestoneStat = {
  label: string
  value: string
  icon: MilestoneStatIcon
  /** 冷启动里程碑进度：当前值 / 目标值 */
  progress?: { current: number; target: number }
  /** 附加说明文字 */
  note?: string
}

export type MilestoneStatSources = {
  /** 内测开发者总数（`/requirements/public-overview` 的 `developer_count`） */
  developerCount: number
  /** 公开资源条数（与「公开资源」公告、榜单同源，都来自 `publicResources`） */
  resourceCount: number
  /** 首页指标第一条的文案；overview 还没回来时是 undefined */
  completedLabel?: string
}

/**
 * 侧栏「内测里程碑」四张统计卡：前两张带冷启动进度条，第三张在零单时补「首单在路上」，
 * 第四张是担保交易的占位（`开发中`）。
 *
 * 顺序即展示顺序（视图与 CSS 的 `--stat-index` / `--tone-N` 都按索引取值），不要重排。
 */
export function buildMilestoneStats(sources: MilestoneStatSources): PortalMilestoneStat[] {
  const { developerCount, resourceCount, completedLabel } = sources

  return [
    {
      label: '内测开发者',
      value: `${developerCount}/${MILESTONE_TARGETS.developers} 位`,
      icon: 'developers',
      progress: { current: developerCount, target: MILESTONE_TARGETS.developers },
    },
    {
      label: '公开资源',
      value: `${resourceCount}/${MILESTONE_TARGETS.resources} 条`,
      icon: 'resources',
      progress: { current: resourceCount, target: MILESTONE_TARGETS.resources },
    },
    {
      label: '完成记录',
      value: completedLabel ?? '0 单',
      icon: 'orders',
      note: completedLabel === '0 单' ? '首单在路上' : undefined,
    },
    {
      label: '担保交易',
      value: '开发中',
      icon: 'escrow',
      note: '正在开发测试中',
    },
  ]
}
