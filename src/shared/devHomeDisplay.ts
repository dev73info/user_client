/**
 * 开发者工作台总览（`views/DevHomeView.vue`）的展示口径：色调、状态胶囊与两条列表的行形状。
 *
 * 抽出来的原因和 `devFundDisplay` 一样：总览页拆成 `DevProjectList` / `DevDeliveryList` /
 * `DevFundPanel` 之后，视图算行、子组件画行，两边都要用同一份「状态 → 色调 → 胶囊类名」，
 * 各写一份必然漂。这里只管展示，不碰接口、路由与弹窗。
 */

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
