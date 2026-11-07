/**
 * 徽章与邀请的假数据。
 *
 * 这两块页面（徽章墙、邀请面板）在 mock 下原本整组接口都返回空壳：
 * `/badges/my` 拿到的是 `[]`，页面读 `badges` 时直接抛错，徽章墙永远停在「正在加载」。
 * 这里给最小可用的一份：4 个徽章定义、当前身份已获得其中 2 个、邀请码与 2 条邀请记录。
 * 佩戴状态按身份存在内存里，点「佩戴」会真的变——否则预览时看不出效果。
 */

import type { BadgeDefinition, UserBadge } from '@/api/invite'
import type {
  InviteRewardClaimResponse,
  InviteRewardItem,
  InviteRewardOverview,
  InviteRewardPayout,
  InviteRewardStatus,
} from '@/api/inviteReward'

import { currentMockProfile, type MockIdentity } from '../identity'
import { datetime } from './shared'

export const badgeDefinitions: BadgeDefinition[] = [
  {
    code: 'first_requirement',
    name: '初出茅庐',
    description: '完成第一个需求',
    category: '成就徽章',
    icon: '🌱',
    tier: 1,
  },
  {
    code: 'five_star_dev',
    name: '五星开发者',
    description: '连续 5 次验收一次通过',
    category: '成就徽章',
    icon: '⭐',
    tier: 2,
  },
  {
    code: 'community_helper',
    name: '热心社区',
    description: '社区回答被采纳 10 次',
    category: '成就徽章',
    icon: '💬',
    tier: 1,
  },
  {
    code: 'early_bird',
    name: '早期用户',
    description: '平台上线首月注册',
    category: '特殊徽章',
    icon: '🕊️',
    tier: 1,
  },
]

/** 每个身份获得哪些徽章、戴了哪些（用 code 记录，方便直接改）。 */
const owned: Record<'client' | 'dev', { code: string; equipped: boolean; awardedAt: string }[]> = {
  client: [
    { code: 'early_bird', equipped: true, awardedAt: datetime(-120) },
    { code: 'first_requirement', equipped: false, awardedAt: datetime(-30) },
  ],
  dev: [
    { code: 'five_star_dev', equipped: true, awardedAt: datetime(-40) },
    { code: 'community_helper', equipped: false, awardedAt: datetime(-12) },
  ],
}

export function myBadges(): UserBadge[] {
  const profile = currentMockProfile()

  return (owned[profile.id] ?? []).flatMap((entry) => {
    const definition = badgeDefinitions.find((badge) => badge.code === entry.code)

    return definition
      ? [{ ...definition, equipped: entry.equipped, awarded_at: entry.awardedAt }]
      : []
  })
}

/** 佩戴徽章：传进来的 code 列表即「佩戴中」，其余一律卸下。 */
export function setEquippedBadges(codes: string[]): UserBadge[] {
  const profile = currentMockProfile()
  const wanted = new Set(codes)

  for (const entry of owned[profile.id] ?? []) {
    entry.equipped = wanted.has(entry.code)
  }

  return myBadges()
}

/* ------------------------------------------------------------------ 邀请 */

export function inviteCode() {
  const profile = currentMockProfile()

  return {
    code: profile.id === 'dev' ? 'DEV73MOCK' : 'CLI73MOCK',
    invite_count: profile.id === 'dev' ? 2 : 1,
    invite_url: `https://73info.cn/register?invite=${profile.id === 'dev' ? 'DEV73MOCK' : 'CLI73MOCK'}`,
  }
}

export function inviteStats() {
  const profile = currentMockProfile()
  const invitees =
    profile.id === 'dev'
      ? [
          { username: 'mock_invitee_a', avatar_url: null, joined_at: datetime(-10) },
          { username: 'mock_invitee_b', avatar_url: null, joined_at: datetime(-45) },
        ]
      : [{ username: 'mock_invitee_c', avatar_url: null, joined_at: datetime(-5) }]

  return {
    invite_code: inviteCode().code,
    total_invited: invitees.length,
    invitees,
  }
}

/* -------------------------------------------------------------- 邀请现金奖励 */

const REWARD_AMOUNT_FEN = 100

type RewardState = {
  rewards: InviteRewardItem[]
  payouts: InviteRewardPayout[]
}

/** 被邀请人脱敏展示：首尾字符 + 三星号，与后端口径一致。 */
function maskedInvitee(index: number): string {
  const invitees = inviteStats().invitees
  const source = invitees.length ? (invitees[index % invitees.length]?.username ?? '') : ''
  const chars = Array.from(source || `mock_invitee_${index + 1}`)
  return chars.length > 2 ? `${chars[0]}***${chars[chars.length - 1]}` : `${chars[0] ?? 'u'}***`
}

/** 三种状态各一条：可领取、待满足条件（待实名）、已到账，覆盖页面的主要分支。 */
function seedRewardState(): RewardState {
  return {
    rewards: [
      {
        id: 'invite-reward-1',
        invitee: maskedInvitee(0),
        amount_fen: REWARD_AMOUNT_FEN,
        status: 'available',
        reason: '',
        created_at: datetime(-5),
      },
      {
        id: 'invite-reward-2',
        invitee: maskedInvitee(1),
        amount_fen: REWARD_AMOUNT_FEN,
        status: 'pending',
        reason: '待被邀请人完成实名认证',
        created_at: datetime(-10),
      },
      {
        id: 'invite-reward-3',
        invitee: maskedInvitee(2),
        amount_fen: REWARD_AMOUNT_FEN,
        status: 'paid',
        reason: '',
        created_at: datetime(-45),
      },
    ],
    payouts: [],
  }
}

/** 奖励状态按身份各自保存：领取失败（未绑定微信）只在开发者身份上模拟。 */
const rewardStates: Record<MockIdentity, RewardState> = {
  client: seedRewardState(),
  dev: seedRewardState(),
}

function sumRewards(state: RewardState, status: InviteRewardStatus): number {
  return state.rewards
    .filter((item) => item.status === status)
    .reduce((total, item) => total + item.amount_fen, 0)
}

export function inviteRewardOverview(identity: MockIdentity): InviteRewardOverview {
  const state = rewardStates[identity]

  return {
    enabled: true,
    amount_fen: REWARD_AMOUNT_FEN,
    require_invitee_realname: true,
    min_invitee_age_days: 0,
    total_invited: inviteStats().total_invited,
    total_rewarded_fen: state.rewards.reduce((total, item) => total + item.amount_fen, 0),
    available_fen: sumRewards(state, 'available'),
    pending_fen: sumRewards(state, 'pending'),
    paid_fen: sumRewards(state, 'paid'),
    rewards: [...state.rewards].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    payouts: [...state.payouts].sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}

/** 领取：把可领取奖励并成一张待用户确认的转账单；没有可领取奖励返回 null。 */
export function claimInviteReward(identity: MockIdentity): InviteRewardClaimResponse | null {
  const state = rewardStates[identity]
  const available = state.rewards.filter((item) => item.status === 'available')
  if (!available.length) {
    return null
  }

  const amount = available.reduce((total, item) => total + item.amount_fen, 0)
  const stamp = Date.now()
  const payout: InviteRewardPayout = {
    out_bill_no: `IR${stamp}`,
    amount_fen: amount,
    reward_count: available.length,
    status: 'wait_user_confirm',
    package_info: `mock-package-${stamp}`,
    created_at: datetime(0),
  }

  for (const reward of available) {
    reward.status = 'claimed'
  }
  state.payouts.unshift(payout)

  return {
    payouts: [
      {
        out_bill_no: payout.out_bill_no,
        amount_fen: payout.amount_fen,
        state: payout.status,
        package_info: payout.package_info,
        mch_id: '1743365011',
        app_id: 'wxcca827878ec0def8',
      },
    ],
  }
}

/** 查单：非终态转账单直接按成功处理，并把已并入的奖励标成已到账。 */
export function syncInviteRewardPayouts(identity: MockIdentity): InviteRewardOverview {
  const state = rewardStates[identity]
  let settled = false

  for (const payout of state.payouts) {
    if (['creating', 'wait_user_confirm', 'processing'].includes(payout.status)) {
      payout.status = 'success'
      payout.package_info = null
      settled = true
    }
  }

  if (settled) {
    for (const reward of state.rewards) {
      if (reward.status === 'claimed') {
        reward.status = 'paid'
      }
    }
  }

  return inviteRewardOverview(identity)
}
