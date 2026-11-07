/**
 * 活动中心的假数据变更：报名 / key 兑换 / 我的活动 / 我的奖励 / 查单。
 *
 * 与真实后端同口径：报名 / 兑换会真的占名额、生成参与记录，并在奖励生成时立即
 * 发起一笔待确认的微信转账单（带 `package_info`）；查单只推进已有非终态单，
 * 不会凭空建单。所以页面上的「名额减少」「奖励出现」「确认收款」都能真的走一遍。
 *
 * 状态与派生字段在 `activityState.ts`，静态种子在 `activitySeed.ts`。
 */

import type {
  ActivityListResponse,
  ActivityParticipation,
  ActivityRewardItem,
  ActivitySignupResponse,
  MyActivityRewardsResponse,
} from '@/api/activities'
import {
  ACTIVITY_ALREADY_JOINED,
  ACTIVITY_KEY_DISABLED,
  ACTIVITY_KEY_EXPIRED,
  ACTIVITY_KEY_INVALID,
  ACTIVITY_KEY_USED,
  ACTIVITY_NOT_ACTIVE,
  ACTIVITY_PER_USER_LIMIT,
  ACTIVITY_QUOTA_FULL,
  ACTIVITY_SIGNUP_DISABLED,
} from '@/shared/api/errorCodes'

import { activityByCode, mockActivities, mockActivityKeys, type MockActivity } from './activitySeed'
import {
  currentState,
  detailOf,
  participationOf,
  payoutsOf,
  sumFen,
  summaryOf,
  takeBillNo,
  takeId,
  type UserState,
} from './activityState'
import { datetime } from './shared'

export type ActivityError = { status: number; code: string; message: string }
export type ActivityActionResult =
  | { ok: true; value: ActivitySignupResponse }
  | { ok: false; error: ActivityError }

function fail(status: number, code: string, message: string): ActivityActionResult {
  return { ok: false, error: { status, code, message } }
}

/** 活动列表：与后端一致，按标题 / 标识搜索 + 按类型筛选，不分页。 */
export function listActivities(keyword = '', activityType = ''): ActivityListResponse {
  const needle = keyword.trim().toLowerCase()
  const items = mockActivities
    .filter((activity) => activity.status === 'published')
    .filter((activity) => !activityType || activity.activity_type === activityType)
    .filter(
      (activity) =>
        !needle ||
        activity.title.toLowerCase().includes(needle) ||
        activity.code.toLowerCase().includes(needle),
    )
    .map(summaryOf)
  return { items }
}

export function getActivityDetailByCode(code: string) {
  const activity = activityByCode(code)
  return activity ? detailOf(activity) : null
}

export function myActivities(): ActivityListResponse {
  const state = currentState()
  const ids = new Set(state.participations.map((item) => item.activity_id))
  return { items: mockActivities.filter((activity) => ids.has(activity.id)).map(summaryOf) }
}

function createParticipation(
  state: UserState,
  activity: MockActivity,
  quota: number,
  source: string,
): ActivityParticipation {
  const existing = participationOf(state, activity.id)
  if (existing) {
    existing.quota_count += quota
    existing.updated_at = datetime(0, 12, 0)
    return existing
  }
  const participation: ActivityParticipation = {
    activity_id: activity.id,
    quota_count: quota,
    first_source: source,
    created_at: datetime(0, 12, 0),
    updated_at: datetime(0, 12, 0),
  }
  state.participations.push(participation)
  return participation
}

function createReward(
  state: UserState,
  activity: MockActivity,
  source: string,
): ActivityRewardItem | null {
  if (activity.reward_amount_fen <= 0) return null
  const reward: ActivityRewardItem = {
    id: takeId(),
    activity_id: activity.id,
    activity_code: activity.code,
    activity_title: activity.title,
    amount_fen: activity.reward_amount_fen,
    status: 'pending',
    status_text: '待发放',
    source,
    source_ref: null,
    fail_reason: null,
    created_at: datetime(0, 12, 0),
    paid_at: null,
  }
  state.rewards.push(reward)
  return reward
}

/**
 * 与后端一致：奖励生成后立即尝试发起微信商家转账（有 openid 时）。
 * mock 一律视为已绑定微信，直接生成待用户确认的转账单。
 */
function attemptTransfer(
  state: UserState,
  activity: MockActivity,
  reward: ActivityRewardItem | null,
): void {
  if (!reward) return
  state.payouts.push({
    out_bill_no: `ACT${String(takeBillNo()).padStart(8, '0')}`,
    activity_id: activity.id,
    activity_title: activity.title,
    amount_fen: reward.amount_fen,
    reward_count: 1,
    status: 'wait_user_confirm',
    package_info: 'mock-activity-package',
    mch_id: '1743365011',
    app_id: 'wxcca827878ec0def8',
    fail_reason: null,
    created_at: datetime(0, 12, 1),
  })
  reward.status = 'transferring'
  reward.status_text = '发放中'
}

function resultOf(
  state: UserState,
  activity: MockActivity,
  participation: ActivityParticipation,
  reward: ActivityRewardItem | null,
): ActivityActionResult {
  return {
    ok: true,
    value: {
      activity: detailOf(activity),
      participation,
      rewards: reward ? [reward] : [],
      payouts: payoutsOf(state, activity.id),
    },
  }
}

export function signup(code: string): ActivityActionResult {
  const activity = activityByCode(code)
  if (!activity) return fail(404, 'ACTIVITY_NOT_FOUND', '活动不存在')
  if (activity.phase !== 'active') return fail(409, ACTIVITY_NOT_ACTIVE, '活动当前不可报名')
  if (!activity.signup_enabled) return fail(409, ACTIVITY_SIGNUP_DISABLED, '活动未开放报名')
  if (activity.quota_total != null && activity.quota_used >= activity.quota_total) {
    return fail(409, ACTIVITY_QUOTA_FULL, '名额已满')
  }
  const state = currentState()
  if (participationOf(state, activity.id)) {
    return fail(409, ACTIVITY_ALREADY_JOINED, '已经报名过了')
  }

  activity.quota_used += 1
  const participation = createParticipation(state, activity, 1, 'signup')
  const reward = createReward(state, activity, 'signup')
  attemptTransfer(state, activity, reward)
  return resultOf(state, activity, participation, reward)
}

export function redeemKey(keyCode: string): ActivityActionResult {
  const key = mockActivityKeys.find((item) => item.code === keyCode)
  if (!key) return fail(404, ACTIVITY_KEY_INVALID, '兑换码不存在')
  if (key.status === 'used') return fail(409, ACTIVITY_KEY_USED, '兑换码已被使用')
  if (key.status === 'disabled') return fail(409, ACTIVITY_KEY_DISABLED, '兑换码已停用')
  if (key.status === 'expired') return fail(409, ACTIVITY_KEY_EXPIRED, '兑换码已过期')

  const activity = activityByCode(key.activityCode)
  if (!activity) return fail(404, 'ACTIVITY_NOT_FOUND', '活动不存在')
  if (activity.phase !== 'active' || !activity.key_enabled) {
    return fail(409, ACTIVITY_NOT_ACTIVE, '活动当前不可兑换')
  }
  if (activity.quota_total != null && activity.quota_used >= activity.quota_total) {
    return fail(409, ACTIVITY_QUOTA_FULL, '名额已满')
  }
  const state = currentState()
  const existing = participationOf(state, activity.id)
  if (activity.quota_per_user != null && (existing?.quota_count ?? 0) >= activity.quota_per_user) {
    return fail(409, ACTIVITY_PER_USER_LIMIT, '已达参与上限')
  }

  key.status = 'used'
  activity.quota_used += 1
  const participation = createParticipation(state, activity, 1, 'key')
  const reward = createReward(state, activity, 'key')
  attemptTransfer(state, activity, reward)
  return resultOf(state, activity, participation, reward)
}

export function myActivityRewards(): MyActivityRewardsResponse {
  const state = currentState()
  return {
    items: [...state.rewards].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    payouts: [...state.payouts].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    summary: {
      pending_fen: sumFen(state.rewards, ['pending', 'waiting_wechat']),
      transferring_fen: sumFen(state.rewards, ['transferring']),
      paid_fen: sumFen(state.rewards, ['paid']),
    },
  }
}

/**
 * 查单：与后端 `POST /activities/rewards/sync` 一致，只推进**已有**非终态转账单，
 * 不会新建转账单（新建由奖励生成时的自动发放 / 后台扫描负责）。
 */
export function syncActivityRewards(): MyActivityRewardsResponse {
  const state = currentState()
  for (const payout of state.payouts) {
    if (payout.status === 'creating' || payout.status === 'processing') {
      payout.status = 'wait_user_confirm'
      payout.package_info = 'mock-activity-package'
    }
  }
  return myActivityRewards()
}
