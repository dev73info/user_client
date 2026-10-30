/**
 * 积分域的内存数据：商城商品、我的积分、权益、兑换记录、道具卡、打赏与签到。
 *
 * 口径与其它 db 模块一致：够撑住页面，不假装有真实流水。余额、权益、记录按 mock 身份
 * 各存一份，兑换与打赏当场改这份内存状态，所以「兑换后余额减少、多一条记录」也自洽。
 * 刷新页面回到初始值，不做持久化。
 */

import type {
  PointsProduct,
  PointsRedeemOrder,
  PointsTransfer,
  PointsTransferMeta,
  PromoCard,
  UserPerk,
  UserPointsLog,
} from '@/api/points'

import { currentMockProfile } from '../identity'
import { datetime } from './shared'

/* ------------------------------------------------------------------ 商品 */

/**
 * 商城商品。`duration_days: -1` 是后端约定里的「永久」，页面按这个值显示「永久」。
 * 置顶卡故意做成 0 库存，是为了让「已售罄」这个状态在预览里也能看到。
 */
type ProductSeed = [
  name: string,
  kind: string,
  perkCode: string | null,
  days: number,
  cost: number,
  stock: number,
]

const PRODUCT_SEEDS: ProductSeed[] = [
  ['用户名渐变', 'permission', 'username_gradient', -1, 300, 999],
  ['用户名特定颜色', 'permission', 'username_color', -1, 200, 999],
  ['主页静态背景自定义', 'permission', 'home_background_static', -1, 150, 999],
  ['资源精选卡', 'consumable', null, 30, 100, 20],
  ['资源置顶卡', 'consumable', null, 7, 60, 0],
]

const PRODUCTS: PointsProduct[] = PRODUCT_SEEDS.map(
  ([name, kind, perk_code, duration_days, points_cost, stock], index) => ({
    id: index + 1,
    name,
    kind,
    perk_code,
    duration_days,
    points_cost,
    stock,
    enabled: true,
    payload: null,
    created_at: datetime(-60),
    updated_at: datetime(-60),
  }),
)

export function mallProducts(): PointsProduct[] {
  return PRODUCTS.filter((product) => product.enabled)
}

export function findProduct(productId: number): PointsProduct | null {
  return PRODUCTS.find((product) => product.id === productId) ?? null
}

/* ------------------------------------------------------------------ 身份状态 */

export type MockPointsState = {
  balance: number
  checkedIn: boolean
  streak: number
  perks: UserPerk[]
  logs: UserPointsLog[]
  orders: PointsRedeemOrder[]
  promoCards: PromoCard[]
  transfers: PointsTransfer[]
}

function seedState(identity: 'client' | 'dev', username: string): MockPointsState {
  const isDev = identity === 'dev'

  return {
    balance: isDev ? 260 : 420,
    checkedIn: false,
    streak: isDev ? 5 : 2,
    perks: [
      {
        perk_code: 'username_gradient',
        owned: true,
        equipped: !isDev,
        expires_at: null,
        created_at: datetime(-20),
      },
      {
        perk_code: 'home_background_static',
        owned: true,
        equipped: isDev,
        expires_at: null,
        created_at: datetime(-15),
      },
      {
        perk_code: 'username_color:2563eb',
        owned: isDev,
        equipped: false,
        expires_at: null,
        created_at: datetime(-12),
      },
    ],
    logs: [
      {
        id: 3,
        username,
        delta: 50,
        balance_after: isDev ? 260 : 420,
        reason: '发布需求奖励',
        source_type: 'requirement',
        source_id: null,
        operator: null,
        created_at: datetime(-1, 9, 20),
      },
      {
        id: 2,
        username,
        delta: -150,
        balance_after: isDev ? 210 : 370,
        reason: '兑换「主页静态背景自定义」',
        source_type: 'mall',
        source_id: null,
        operator: null,
        created_at: datetime(-15, 14, 5),
      },
      {
        id: 1,
        username,
        delta: 5,
        balance_after: isDev ? 360 : 520,
        reason: '每日签到',

        source_type: 'checkin',
        source_id: null,
        operator: null,
        created_at: datetime(-16, 8, 30),
      },
    ],
    orders: isDev
      ? []
      : [
          {
            id: 1,
            username,
            product_id: 3,
            product_name: '主页静态背景自定义',
            product_kind: 'permission',
            perk_code: 'home_background_static',
            points_cost: 150,
            status: 'fulfilled',
            handle_note: null,
            handled_at: datetime(-15, 14, 6),
            handled_by: 'system',
            created_at: datetime(-15, 14, 5),
          },
        ],
    promoCards: isDev
      ? [
          {
            id: 1,
            card_code: 'resource_featured_card',
            product_id: 4,
            redeem_order_id: 1,
            duration_days: 30,
            status: 'unused',
            created_at: datetime(-8, 11, 0),
            used_at: null,
            used_resource_id: null,
          },
        ]
      : [],
    transfers: isDev
      ? [
          {
            id: 2,
            from_username: username,
            to_username: 'client_flow_03562487',
            amount: 20,
            fee: 1,
            received: 19,
            balance_after: 260,
            note: '示例打赏',
            status: 'completed',
            pending_review: false,
            cycle_flag: false,
            review_note: null,
            review_reason: null,
            reviewed_at: null,
            reviewed_by: null,
            created_at: datetime(-3, 16, 40),
          },
        ]
      : [],
  }
}

const states: Partial<Record<'client' | 'dev', MockPointsState>> = {}

/** 当前 mock 身份的积分状态（首次访问时按种子数据建立）。 */
export function pointsState(): MockPointsState {
  const profile = currentMockProfile()

  const existing = states[profile.id]
  if (existing) {
    return existing
  }

  const created = seedState(profile.id, profile.username)
  states[profile.id] = created
  return created
}

/* ------------------------------------------------------------------ 打赏规则 */

/** 打赏规则：费率按百分比（与 `pointsTransferFee` 的算法一致，5 表示 5%）。 */
export const TRANSFER_META: PointsTransferMeta = {
  fee_rate: 5,
  daily_cap: 1000,
  receive_daily_cap: 2000,
  manual_review_threshold: 500,
  new_user_cap: 100,
  new_user_min_days: 7,
}

/** 今日签到状态：签到页与首页打勾角标共用同一份内存状态。 */
export function checkinStatus() {
  const state = pointsState()

  return {
    username: currentMockProfile().username,
    today_checked_in: state.checkedIn,
    streak_count: state.streak,
    today_potential: 5,
  }
}

/**
 * 写一条积分流水并同步余额。
 *
 * 放在这里而不是 `pointsActions.ts`：所有变更动作（兑换、打赏、签到）都要记流水，
 * 而流水和余额是同一条状态的两个字段，分开两边改就会漂。
 */
export function pushLog(state: MockPointsState, delta: number, reason: string) {
  state.balance = Math.max(0, state.balance + delta)
  state.logs.unshift({
    id: nextId(),
    username: currentMockProfile().username,
    delta,
    balance_after: state.balance,
    reason,
    source_type: null,
    source_id: null,
    operator: null,
    created_at: nowText(),
  })
}

/** 后端时间口径的「现在」，写记录时用。 */
export function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

let idSeed = 100
function nextId(): number {
  idSeed += 1
  return idSeed
}
