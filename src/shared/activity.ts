/**
 * 活动中心的展示口径（纯函数）：阶段 / 状态文案、时间窗、名额、报名与兑换的阻塞原因、错误码翻译。
 *
 * 页面与组件只消费这里的结果，不在模板里各写一套 switch。
 */

import type {
  ActivityPayoutItem,
  ActivityPayoutStatus,
  ActivityRewardItem,
  ActivityRewardStatus,
  ActivitySummary,
} from '@/api/activities'
import { HttpError } from '@/api/http'
import {
  ACTIVITY_ACCOUNT_INACTIVE,
  ACTIVITY_ALREADY_JOINED,
  ACTIVITY_KEY_DISABLED,
  ACTIVITY_KEY_EXPIRED,
  ACTIVITY_KEY_INVALID,
  ACTIVITY_KEY_USED,
  ACTIVITY_NOT_ACTIVE,
  ACTIVITY_NOT_FOUND,
  ACTIVITY_PER_USER_LIMIT,
  ACTIVITY_QUOTA_FULL,
  ACTIVITY_REALNAME_REQUIRED,
  ACTIVITY_REWARD_TOO_LARGE,
  ACTIVITY_SIGNUP_DISABLED,
  WECHAT_NOT_BOUND,
} from '@/shared/api/errorCodes'
import { formatBackendDateTime } from '@/shared/datetime'
import type { Tone } from 'ui_73info'

/** 邀请奖励对应的活动 code：后端内置活动固定为 `invite-reward`（见 activity 迁移与 service）。 */
export const INVITE_ACTIVITY_CODE = 'invite-reward'

export function activityPhaseLabel(phase: string | null | undefined): string {
  switch (phase) {
    case 'active':
      return '进行中'
    case 'not_started':
      return '未开始'
    case 'paused':
      return '已暂停'
    case 'ended':
      return '已结束'
    case 'disabled':
      return '未开启'
    default:
      return '未知'
  }
}

export function activityPhaseTone(phase: string | null | undefined): Tone {
  switch (phase) {
    case 'active':
      return 'success'
    case 'not_started':
      return 'warning'
    case 'paused':
      return 'warning'
    case 'ended':
      return 'neutral'
    default:
      return 'info'
  }
}

/** 活动时间窗：起止 / 截止 / 起 / 长期有效。 */
export function activityWindowLabel(activity: ActivitySummary): string {
  const start = activity.starts_at
  const end = activity.ends_at
  if (start && end) {
    return `${formatBackendDateTime(start)} ~ ${formatBackendDateTime(end)}`
  }
  if (end) return `截止 ${formatBackendDateTime(end)}`
  if (start) return `${formatBackendDateTime(start)} 起`
  return '长期有效'
}

/** 名额：`null` 表示不限。 */
export function activityQuotaLabel(activity: ActivitySummary): string {
  if (activity.quota_total == null) return '不限名额'
  return `剩余 ${activity.quota_remaining ?? 0} / ${activity.quota_total}`
}

/** 每人名额：`null` 表示不限。 */
export function activityPerUserQuotaLabel(activity: ActivitySummary): string {
  return activity.quota_per_user == null ? '不限' : String(activity.quota_per_user)
}

function phaseBlockedReason(activity: ActivitySummary): string {
  if (activity.phase === 'disabled') return '活动未开启'
  if (activity.phase === 'not_started') return '活动未开始'
  if (activity.phase === 'paused') return '活动已暂停'
  if (activity.phase === 'ended') return '活动已结束'
  return ''
}

function quotaBlockedReason(activity: ActivitySummary): string {
  if (activity.quota_remaining != null && activity.quota_remaining <= 0) return '名额已满'
  if (activity.quota_per_user != null && activity.my_quota >= activity.quota_per_user) {
    return '已达参与上限'
  }
  return ''
}

/** 报名按钮的禁用原因；空串表示可以报名。报名每人一次，已有名额即视为已报名。 */
export function activitySignupBlockedReason(activity: ActivitySummary): string {
  const phase = phaseBlockedReason(activity)
  if (phase) return phase
  if (!activity.signup_enabled) return '未开放报名'
  if (activity.my_quota > 0) return '已报名'
  return quotaBlockedReason(activity)
}

/** key 兑换的禁用原因；空串表示可以兑换。 */
export function activityKeyBlockedReason(activity: ActivitySummary): string {
  const phase = phaseBlockedReason(activity)
  if (phase) return phase
  if (!activity.key_enabled) return '未开放兑换'
  return quotaBlockedReason(activity)
}

/** 奖励状态：优先用后端给的中文 `status_text`，缺省时按状态码兜底。 */
export function activityRewardStatusLabel(reward: ActivityRewardItem): string {
  if (reward.status_text.trim()) return reward.status_text
  return activityRewardStatusFallback(reward.status)
}

function activityRewardStatusFallback(status: string): string {
  switch (status) {
    case 'pending':
      return '待发放'
    case 'waiting_wechat':
      return '待绑定微信'
    case 'transferring':
      return '发放中'
    case 'paid':
      return '已到账'
    case 'cancelled':
      return '已取消'
    default:
      return '未知'
  }
}

export function activityRewardStatusTone(status: ActivityRewardStatus | string): Tone {
  switch (status) {
    case 'paid':
      return 'success'
    case 'waiting_wechat':
    case 'transferring':
      return 'warning'
    case 'cancelled':
      return 'neutral'
    default:
      return 'info'
  }
}

export function activityPayoutStatusLabel(status: ActivityPayoutStatus | string): string {
  switch (status) {
    case 'creating':
      return '建单中'
    case 'wait_user_confirm':
      return '待确认收款'
    case 'processing':
      return '转账中'
    case 'success':
      return '已到账'
    case 'failed':
      return '转账失败'
    case 'cancelled':
      return '已取消'
    default:
      return '未知'
  }
}

/** 奖励条件已满足但没绑微信：需要引导微信登录，不能直接拉起收款页。 */
export function hasWaitingWechatReward(rewards: readonly ActivityRewardItem[]): boolean {
  return rewards.some((reward) => reward.status === 'waiting_wechat')
}

/** 仍在渠道处理中的转账单：页面挂载后要主动查单，按钮也要允许点一次刷新。 */
export function hasActiveActivityPayout(payouts: readonly ActivityPayoutItem[]): boolean {
  return payouts.some((payout) => payout.status === 'creating' || payout.status === 'processing')
}

/** 有确认页可拉起的转账单（`wait_user_confirm` 且带 `package_info`）。 */
export function hasConfirmableActivityPayout(payouts: readonly ActivityPayoutItem[]): boolean {
  return payouts.some(
    (payout) => payout.status === 'wait_user_confirm' && Boolean(payout.package_info),
  )
}

/** 报名 / 兑换 / 查单失败时按错误码给文案；错误码清单见 `@/shared/api/errorCodes`。 */
export function activityActionError(error: unknown, fallback = '操作失败'): string {
  if (!(error instanceof HttpError)) {
    return error instanceof Error ? error.message : fallback
  }

  switch (error.code) {
    case ACTIVITY_NOT_FOUND:
      return '活动不存在'
    case ACTIVITY_NOT_ACTIVE:
      return '活动当前不可参与'
    case ACTIVITY_SIGNUP_DISABLED:
      return '活动未开放报名'
    case ACTIVITY_ALREADY_JOINED:
      return '已经报名过了'
    case ACTIVITY_QUOTA_FULL:
      return '名额已满'
    case ACTIVITY_PER_USER_LIMIT:
      return '已达参与上限'
    case ACTIVITY_KEY_INVALID:
      return '兑换码不存在'
    case ACTIVITY_KEY_USED:
      return '兑换码已被使用'
    case ACTIVITY_KEY_DISABLED:
      return '兑换码已停用'
    case ACTIVITY_KEY_EXPIRED:
      return '兑换码已过期'
    case ACTIVITY_REWARD_TOO_LARGE:
      return '奖励金额超过单笔转账上限'
    case ACTIVITY_REALNAME_REQUIRED:
      return '请先完成实名认证'
    case ACTIVITY_ACCOUNT_INACTIVE:
      return '账号当前不可参与活动'
    case WECHAT_NOT_BOUND:
      return '请先微信登录并绑定'
    default:
      return error.message || fallback
  }
}
