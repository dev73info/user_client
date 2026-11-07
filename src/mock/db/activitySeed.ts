/**
 * 活动中心的种子数据：活动与兑换码。
 *
 * 时间按当前日期相对生成，保证「进行中 / 已结束 / 未开始」三种阶段在任意一天都成立。
 * 名额与参与记录的可变部分在 `activities.ts`，这里只放静态定义与查找。
 */

import type { ActivitySummary } from '@/api/activities'

import { datetime } from './shared'

export type MockActivity = {
  id: string
  code: string
  title: string
  subtitle: string | null
  cover_url: string | null
  activity_type: string
  status: string
  phase: ActivitySummary['phase']
  starts_at: string | null
  ends_at: string | null
  description: string | null
  quota_total: number | null
  quota_used: number
  quota_per_user: number | null
  reward_amount_fen: number
  signup_enabled: boolean
  key_enabled: boolean
  require_realname: boolean
  min_member_age_days: number
  max_single_transfer_fen: number
}

export type MockActivityKey = {
  code: string
  activityCode: string
  status: 'active' | 'used' | 'disabled' | 'expired'
}

export const mockActivities: MockActivity[] = [
  {
    id: '1',
    code: 'invite',
    title: '邀请有礼',
    subtitle: '邀请好友注册，每位得 5 元现金',
    cover_url: null,
    activity_type: 'invite',
    status: 'published',
    phase: 'active',
    starts_at: datetime(-7, 0, 0),
    ends_at: datetime(40, 23, 59),
    description: '邀请好友注册并完成实名认证，奖励自动入账。',
    quota_total: 500,
    quota_used: 128,
    quota_per_user: 1,
    reward_amount_fen: 500,
    signup_enabled: false,
    key_enabled: false,
    require_realname: false,
    min_member_age_days: 0,
    max_single_transfer_fen: 20000,
  },
  {
    id: '2',
    code: 'newbie',
    title: '新人体验官',
    subtitle: '报名领 3 元现金奖励',
    cover_url: null,
    activity_type: 'general',
    status: 'published',
    phase: 'active',
    starts_at: datetime(-3, 0, 0),
    ends_at: datetime(20, 23, 59),
    description: '报名即可获得 3 元现金奖励。',
    quota_total: 100,
    quota_used: 30,
    quota_per_user: 1,
    reward_amount_fen: 300,
    signup_enabled: true,
    key_enabled: true,
    require_realname: false,
    min_member_age_days: 0,
    max_single_transfer_fen: 20000,
  },
  {
    id: '3',
    code: 'keyonly',
    title: '兑换专场',
    subtitle: '凭兑换码领取名额',
    cover_url: null,
    activity_type: 'general',
    status: 'published',
    phase: 'active',
    starts_at: datetime(-1, 0, 0),
    ends_at: null,
    description: null,
    quota_total: 50,
    quota_used: 48,
    quota_per_user: 3,
    reward_amount_fen: 200,
    signup_enabled: false,
    key_enabled: true,
    require_realname: false,
    min_member_age_days: 0,
    max_single_transfer_fen: 20000,
  },
  {
    id: '4',
    code: 'full-house',
    title: '限量福利',
    subtitle: '名额已满',
    cover_url: null,
    activity_type: 'general',
    status: 'published',
    phase: 'active',
    starts_at: datetime(-2, 0, 0),
    ends_at: datetime(10, 23, 59),
    description: null,
    quota_total: 20,
    quota_used: 20,
    quota_per_user: 1,
    reward_amount_fen: 100,
    signup_enabled: true,
    key_enabled: false,
    require_realname: false,
    min_member_age_days: 0,
    max_single_transfer_fen: 20000,
  },
  {
    id: '5',
    code: 'ended',
    title: '国庆活动',
    subtitle: null,
    cover_url: null,
    activity_type: 'general',
    status: 'published',
    phase: 'ended',
    starts_at: datetime(-40, 0, 0),
    ends_at: datetime(-12, 23, 59),
    description: null,
    quota_total: 200,
    quota_used: 156,
    quota_per_user: 1,
    reward_amount_fen: 200,
    signup_enabled: true,
    key_enabled: false,
    require_realname: false,
    min_member_age_days: 0,
    max_single_transfer_fen: 20000,
  },
]

export const mockActivityKeys: MockActivityKey[] = [
  { code: '73INFO-2026', activityCode: 'newbie', status: 'active' },
  { code: 'KEYONLY-8888', activityCode: 'keyonly', status: 'active' },
  { code: 'USED-KEY', activityCode: 'newbie', status: 'used' },
  { code: 'DISABLED-KEY', activityCode: 'newbie', status: 'disabled' },
  { code: 'EXPIRED-KEY', activityCode: 'newbie', status: 'expired' },
]

export function activityByCode(code: string): MockActivity | undefined {
  return mockActivities.find((activity) => activity.code === code)
}

export function activityById(id: string): MockActivity | undefined {
  return mockActivities.find((activity) => activity.id === id)
}
