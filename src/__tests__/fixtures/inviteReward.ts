/** 邀请奖励面板测试数据。 */

export const payout = {
  out_bill_no: 'IR20261107',
  amount_fen: 100,
  state: 'wait_user_confirm',
  package_info: 'mock-package',
  mch_id: '1743365011',
  app_id: 'wxcca827878ec0def8',
}

export function rewardOverview(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    phase: 'active',
    starts_at: null,
    ends_at: null,
    amount_fen: 100,
    require_invitee_realname: true,
    min_invitee_age_days: 0,
    total_invited: 3,
    total_rewarded_fen: 300,
    available_fen: 100,
    pending_fen: 100,
    paid_fen: 100,
    rewards: [
      {
        id: 'r1',
        invitee: 'u***3',
        amount_fen: 100,
        status: 'available',
        reason: '',
        created_at: '2026-11-07 10:00:00',
      },
      {
        id: 'r2',
        invitee: 'z***8',
        amount_fen: 100,
        status: 'pending',
        reason: '待被邀请人完成实名认证',
        created_at: '2026-11-06 10:00:00',
      },
      {
        id: 'r3',
        invitee: 'm***1',
        amount_fen: 100,
        status: 'paid',
        reason: '',
        created_at: '2026-10-30 10:00:00',
      },
    ],
    payouts: [],
    ...overrides,
  }
}
