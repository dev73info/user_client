/**
 * 活动中心的 mock 状态：按身份保存的参与记录 / 奖励 / 转账单，以及汇总形状。
 *
 * 只放「读当前身份的那一份」与派生字段；增删改动作在 `activities.ts`，
 * 静态种子在 `activitySeed.ts`。
 */

import type {
  ActivityDetail,
  ActivityParticipation,
  ActivityPayoutItem,
  ActivityRewardItem,
  ActivitySummary,
} from '@/api/activities'

import { currentMockProfile } from '../identity'
import { activityByCode, type MockActivity } from './activitySeed'
import { datetime } from './shared'

export type UserState = {
  participations: ActivityParticipation[]
  rewards: ActivityRewardItem[]
  payouts: ActivityPayoutItem[]
}

const userStates = new Map<string, UserState>()
let nextId = 1000
let nextBillNo = 1

export function takeId(): string {
  return String(nextId++)
}

export function takeBillNo(): number {
  return nextBillNo++
}

function seedState(): UserState {
  const invite = activityByCode('invite-reward')!
  const participation: ActivityParticipation = {
    activity_id: invite.id,
    quota_count: 1,
    first_source: 'invite',
    created_at: datetime(-6, 10, 0),
    updated_at: datetime(-6, 10, 0),
  }
  return {
    participations: [participation],
    rewards: [
      {
        id: takeId(),
        activity_id: invite.id,
        activity_code: invite.code,
        activity_title: invite.title,
        amount_fen: 500,
        status: 'paid',
        status_text: '已到账',
        source: 'invite',
        source_ref: null,
        fail_reason: null,
        created_at: datetime(-5, 11, 0),
        paid_at: datetime(-4, 9, 30),
      },
      {
        id: takeId(),
        activity_id: invite.id,
        activity_code: invite.code,
        activity_title: invite.title,
        amount_fen: 300,
        status: 'waiting_wechat',
        status_text: '待绑定微信',
        source: 'invite',
        source_ref: null,
        fail_reason: null,
        created_at: datetime(-1, 15, 0),
        paid_at: null,
      },
    ],
    payouts: [
      {
        out_bill_no: 'ACT20261101001',
        activity_id: invite.id,
        activity_title: invite.title,
        amount_fen: 500,
        reward_count: 1,
        status: 'success',
        package_info: null,
        mch_id: '1743365011',
        app_id: 'wxcca827878ec0def8',
        fail_reason: null,
        created_at: datetime(-4, 9, 20),
      },
    ],
  }
}

export function currentState(): UserState {
  const username = currentMockProfile().username
  let state = userStates.get(username)
  if (!state) {
    state = seedState()
    userStates.set(username, state)
  }
  return state
}

export function rewardsOf(state: UserState, activityId: string): ActivityRewardItem[] {
  return state.rewards.filter((reward) => reward.activity_id === activityId)
}

export function payoutsOf(state: UserState, activityId: string): ActivityPayoutItem[] {
  return state.payouts.filter((payout) => payout.activity_id === activityId)
}

export function participationOf(
  state: UserState,
  activityId: string,
): ActivityParticipation | undefined {
  return state.participations.find((participation) => participation.activity_id === activityId)
}

export function sumFen(rewards: ActivityRewardItem[], statuses: string[]): number {
  return rewards
    .filter((reward) => statuses.includes(reward.status))
    .reduce((total, reward) => total + reward.amount_fen, 0)
}

export function summaryOf(activity: MockActivity): ActivitySummary {
  const state = currentState()
  const participation = participationOf(state, activity.id)
  const rewards = rewardsOf(state, activity.id)
  return {
    id: activity.id,
    code: activity.code,
    title: activity.title,
    subtitle: activity.subtitle ?? '',
    cover_url: activity.cover_url,
    activity_type: activity.activity_type,
    status: activity.status,
    phase: activity.phase,
    starts_at: activity.starts_at,
    ends_at: activity.ends_at,
    quota_total: activity.quota_total,
    quota_used: activity.quota_used,
    quota_remaining:
      activity.quota_total == null ? null : Math.max(0, activity.quota_total - activity.quota_used),
    quota_per_user: activity.quota_per_user,
    reward_amount_fen: activity.reward_amount_fen,
    signup_enabled: activity.signup_enabled,
    key_enabled: activity.key_enabled,
    my_quota: participation?.quota_count ?? 0,
    my_reward_pending_fen: sumFen(rewards, ['pending', 'waiting_wechat', 'transferring']),
    my_reward_paid_fen: sumFen(rewards, ['paid']),
  }
}

export function detailOf(activity: MockActivity): ActivityDetail {
  const state = currentState()
  return {
    ...summaryOf(activity),
    description: activity.description ?? '',
    require_realname: activity.require_realname,
    min_member_age_days: activity.min_member_age_days,
    max_single_transfer_fen: activity.max_single_transfer_fen,
    my_participation: participationOf(state, activity.id) ?? null,
    my_rewards: rewardsOf(state, activity.id),
    my_payouts: payoutsOf(state, activity.id),
    invite_summary:
      activity.activity_type === 'invite'
        ? {
            total_invited: 3,
            total_rewarded_fen: 800,
            available_fen: 0,
            pending_fen: 300,
            paid_fen: 500,
          }
        : null,
  }
}
