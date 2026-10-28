/**
 * 开发者工作台总览（`views/DevHomeView.vue`）的展示口径：色调、状态胶囊与各块的行形状。
 *
 * 抽出来的原因和 `devFundDisplay` 一样：视图算行、子组件（`DevProjectList` / `DevFundPanel`）画行，
 * 两边都要用同一份「状态 → 色调 → 胶囊类名」，各写一份必然漂。这里只管展示，不碰接口、路由与弹窗。
 */
import { formatBackendDateTime } from '@/shared/datetime'

/** 页面只用开发者体系的三个强调色，灰色留给终止态，不引入第五种颜色。 */
export type DevHomeTone = 'blue' | 'gold' | 'cyan' | 'muted'

/** 我的需求列表的一行：状态、预算与流程进度都来自同一条接单。 */
export type DevHomeProjectRow = {
  requirementId: string
  title: string
  status: string
  statusLabel: string
  tone: DevHomeTone
  /** 「接单于 09-12 10:00」/「创建于 09-01 09:00」：两句文案在算行时就拼好，组件只画。 */
  timeText: string
  budget: number | null
  progress: number
}

/** 我的资源列表的一行。 */
export type DevHomeResourceRow = {
  id: number
  title: string
  platform: string
  visibilityLabel: string
  tone: DevHomeTone
  timeText: string
}

/** 近期到账的一行：一行一笔分账，金额是实收（毛额减售后收回）。 */
export type DevHomeIncomeRow = {
  key: string
  title: string
  customer: string
  requirementId: string
  amount: number
  timeText: string
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

/** 资源可见性 → 中文标签与色调（`McResourceVisibility` 的四个取值）。 */
export const RESOURCE_VISIBILITY: Record<string, { label: string; tone: DevHomeTone }> = {
  draft: { label: '未发布', tone: 'muted' },
  review: { label: '审核中', tone: 'gold' },
  published: { label: '已发布', tone: 'cyan' },
  rejected: { label: '已驳回', tone: 'gold' },
}

/** 没登记的可见性按「未发布」处理：宁可保守，也不把来路不明的值画成「已发布」。 */
const UNKNOWN_VISIBILITY: { label: string; tone: DevHomeTone } = RESOURCE_VISIBILITY.draft as {
  label: string
  tone: DevHomeTone
}

/** 取资源可见性的展示口径。 */
export function resourceVisibilityView(visibility: string): { label: string; tone: DevHomeTone } {
  return RESOURCE_VISIBILITY[visibility] ?? UNKNOWN_VISIBILITY
}

/** 顶部读数条的一格：口径数字，与其他菜单页的顶条同形（读左、刷新右）。 */
export type DevHomeStatCard = {
  label: string
  value: string
}

/** 接单行的「什么时候」：优先用接单时间（契约字段），没有退到创建时间。 */
export function requirementTimeText(
  boundAt: string | null | undefined,
  createdAt: string | null | undefined,
): string {
  if (boundAt) {
    return `接单于 ${formatBackendDateTime(boundAt)}`
  }

  return `创建于 ${formatBackendDateTime(createdAt)}`
}
