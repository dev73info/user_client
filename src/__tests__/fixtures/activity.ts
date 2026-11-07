/** 活动中心测试数据。 */

import type {
  ActivityDetail,
  ActivityParticipation,
  ActivityPayoutItem,
  ActivityRewardItem,
  ActivitySummary,
} from '@/api/activities'

export function activitySummary(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: '1',
    code: 'invite',
    title: '邀请有礼',
    subtitle: '邀请好友注册，每位得 5 元现金',
    cover_url: null,
    activity_type: 'invite',
    status: 'published',
    phase: 'active',
    starts_at: '2026-11-01 00:00:00',
    ends_at: '2026-12-31 23:59:59',
    quota_total: 500,
    quota_used: 128,
    quota_remaining: 372,
    quota_per_user: 1,
    reward_amount_fen: 500,
    signup_enabled: false,
    key_enabled: false,
    my_quota: 1,
    my_reward_pending_fen: 300,
    my_reward_paid_fen: 500,
    ...overrides,
  }
}

export function activityParticipation(
  overrides: Partial<ActivityParticipation> = {},
): ActivityParticipation {
  return {
    activity_id: '1',
    quota_count: 1,
    first_source: 'invite',
    created_at: '2026-11-01 10:00:00',
    updated_at: '2026-11-01 10:00:00',
    ...overrides,
  }
}

export function activityReward(overrides: Partial<ActivityRewardItem> = {}): ActivityRewardItem {
  return {
    id: '101',
    activity_id: '1',
    activity_code: 'invite',
    activity_title: '邀请有礼',
    amount_fen: 300,
    status: 'pending',
    status_text: '待发放',
    source: 'invite',
    source_ref: null,
    fail_reason: null,
    created_at: '2026-11-06 15:00:00',
    paid_at: null,
    ...overrides,
  }
}

export function activityPayout(overrides: Partial<ActivityPayoutItem> = {}): ActivityPayoutItem {
  return {
    out_bill_no: 'ACT20261107001',
    activity_id: '1',
    activity_title: '邀请有礼',
    amount_fen: 300,
    reward_count: 1,
    status: 'wait_user_confirm',
    package_info: 'mock-activity-package',
    mch_id: '1743365011',
    app_id: 'wxcca827878ec0def8',
    fail_reason: null,
    created_at: '2026-11-07 12:30:00',
    ...overrides,
  }
}

export function activityDetail(overrides: Partial<ActivityDetail> = {}): ActivityDetail {
  return {
    ...activitySummary(),
    description: '邀请好友注册并完成实名认证，奖励自动入账。',
    require_realname: false,
    min_member_age_days: 0,
    max_single_transfer_fen: 20000,
    my_participation: activityParticipation(),
    my_rewards: [activityReward()],
    my_payouts: [],
    invite_summary: {
      total_invited: 3,
      total_rewarded_fen: 800,
      available_fen: 0,
      pending_fen: 300,
      paid_fen: 500,
    },
    ...overrides,
  }
}
