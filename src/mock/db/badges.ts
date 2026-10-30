/**
 * 徽章与邀请的假数据。
 *
 * 这两块页面（徽章墙、邀请面板）在 mock 下原本整组接口都返回空壳：
 * `/badges/my` 拿到的是 `[]`，页面读 `badges` 时直接抛错，徽章墙永远停在「正在加载」。
 * 这里给最小可用的一份：4 个徽章定义、当前身份已获得其中 2 个、邀请码与 2 条邀请记录。
 * 佩戴状态按身份存在内存里，点「佩戴」会真的变——否则预览时看不出效果。
 */

import type { BadgeDefinition, UserBadge } from '@/api/invite'

import { currentMockProfile } from '../identity'
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
