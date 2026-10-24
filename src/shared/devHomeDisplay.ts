/**
 * 开发者工作台总览（`views/DevHomeView.vue`）的展示口径：色调、状态胶囊、读数条与各块的行形状。
 *
 * 抽出来的原因和 `devFundDisplay` 一样：总览页拆成 `DevProjectList` / `DevDeliveryList` /
 * `DevFundPanel` / `DevLiveBoard` 之后，视图算行、子组件画行，两边都要用同一份「状态 → 色调 →
 * 胶囊类名」，各写一份必然漂。这里只管展示，不碰接口、路由与弹窗。
 */
import type { Component } from 'vue'
import { ArrowDown, Box, Lock, Money, Promotion, Switch, View, Wallet } from 'ui_73info'

import type {
  DevDashboardFeedItem,
  DevDashboardFeedKind,
  DevDashboardResources,
} from '@/api/devDashboard'
import { money } from '@/shared/devFundDisplay'

/** 页面只用开发者体系的三个强调色，灰色留给终止态，不引入第五种颜色。 */
export type DevHomeTone = 'blue' | 'gold' | 'cyan' | 'muted'

/** 进行中项目列表的一行：状态、预算与流程进度都来自同一条接单。 */
export type DevHomeProjectRow = {
  requirementId: string
  title: string
  status: string
  statusLabel: string
  tone: DevHomeTone
  createdAt: string
  updatedAt: string
  budget: number | null
  progress: number
}

/** 交付行：一条接了资源的需求单 = 一次交付，金额取该单的到账尾款。 */
export type DevHomeDeliveryRow = {
  requirementId: string
  requirementTitle: string
  resourceTitle: string
  versionCount: number
  delivered: boolean
  updatedAt: string
  amount: number | null
}

/** 需求状态 → 色调：进行中蓝、等待付款金、已完成青，终止态灰。 */
export const STATUS_TONES: Record<string, DevHomeTone> = {
  pending_review: 'muted',
  rejected: 'muted',
  cancelled: 'muted',
  pending_deposit: 'gold',
  pending_final: 'gold',
  pending_settlement: 'gold',
  deposit_paid: 'blue',
  in_development: 'blue',
  completed: 'cyan',
}

/** 状态标签沿用统一口径：浅底 + 深字，四档底色全部取统一层的 .dev-chip 系列。 */
export const CHIP_TONES: Record<DevHomeTone, string> = {
  blue: '',
  gold: 'dev-chip--warm',
  cyan: 'dev-chip--cyan',
  muted: 'dev-chip--muted',
}

/** 接单状态 → `.dev-chip` 的色调修饰类（空串是默认的蓝色档）。 */
export function statusChipClass(status: string): string {
  return CHIP_TONES[STATUS_TONES[status] ?? 'blue']
}

/** 顶部读数条的一格：口径数字，与其他菜单页的顶条同形（读左、刷新右）。 */
export type DevHomeStatCard = {
  label: string
  value: string
}

/** 实时动态流的一行：图标、色调与时间文案都定在这里，`DevLiveBoard` 只画。 */
export type DevHomeFeedRow = {
  key: string
  title: string
  requirementId: string | null
  amount: number | null
  time: string
  fullTime: string
  icon: Component
  tone: DevHomeTone
}

/** 资源项目概况的一格：图标 + 标签 + 读数。 */
export type DevHomeResourceCell = {
  key: string
  label: string
  value: number
  icon: Component
}

/** 动态流按 kind 配图标与颜色：到账金、交付青、状态蓝，提现 / 保证金走中性灰。 */
export const FEED_KINDS: Record<DevDashboardFeedKind, { icon: Component; tone: DevHomeTone }> = {
  income: { icon: Money, tone: 'gold' },
  delivery: { icon: Promotion, tone: 'cyan' },
  status: { icon: Switch, tone: 'blue' },
  withdrawal: { icon: Wallet, tone: 'muted' },
  deposit: { icon: Lock, tone: 'muted' },
}

/** 动态流时间：今天只写时分，更早的带上月日。 */
function feedTime(at: string, todayKey: string): string {
  const time = at.slice(11, 16)
  return at.slice(0, 10) === todayKey ? time : `${at.slice(5, 10)} ${time}`
}

/**
 * 动态流条目 → 行。「今天」按调用方自己的时钟算成日期键传进来：看板时钟每秒推进，
 * 跨零点时这一格要跟着它从「10:00:00」翻成「09-30 10:00:00」。
 *
 * 条目没有 id：用内容拼键，同一秒的同类事件再加序号，保证新条目插入时旧条目不重绘
 * （`TransitionGroup` 的 key 一变就会重播入场动画）。
 */
export function buildFeedRows(
  items: readonly DevDashboardFeedItem[],
  todayKey: string,
): DevHomeFeedRow[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const base = `${item.kind}|${item.at}|${item.title}|${item.requirement_id ?? ''}|${item.amount_cny ?? ''}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const kind = FEED_KINDS[item.kind] ?? FEED_KINDS.status

    return {
      key: `${base}#${count}`,
      title: item.title,
      requirementId: item.requirement_id,
      amount: item.amount_cny,
      time: feedTime(item.at, todayKey),
      fullTime: item.at,
      icon: kind.icon,
      tone: kind.tone,
    }
  })
}

/** 资源项目概况：资源数 / 总下载 / 总浏览，三格顺序固定。 */
export function buildResourceCells(resources: DevDashboardResources): DevHomeResourceCell[] {
  return [
    { key: 'count', label: '资源数', value: resources.resource_count, icon: Box },
    { key: 'downloads', label: '总下载', value: resources.total_downloads, icon: ArrowDown },
    { key: 'views', label: '总浏览', value: resources.total_views, icon: View },
  ]
}

/** 动态流里的冲回、扣减是负数：符号写在货币符号前面（-¥0.01），不写成 ¥-0.01。 */
export function signedMoney(value: number): string {
  return value < 0 ? `-${money(-value)}` : money(value)
}

/** 读数隔千分位：下载与浏览这类六位数读起来才不费劲。 */
export function formatCount(value: number): string {
  return value.toLocaleString('zh-CN')
}
