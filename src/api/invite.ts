import { authHeader, requestJson } from '@/api/http'

export type InviteCodeResponse = {
  code: string
  invite_url: string
  invite_count: number
}

export type Invitee = {
  username: string
  avatar_url?: string | null
  joined_at: string
}

export type InviteStatsResponse = {
  total_invited: number
  invite_code: string
  invitees: Invitee[]
}

export type InviteLeaderboardEntry = {
  rank: number
  username: string
  avatar_url?: string | null
  count: number
  badges: string[]
}

export type InviteLeaderboardRank = {
  rank: number
  count: number
}

export type InviteLeaderboardResponse = {
  period: 'weekly' | 'alltime'
  leaderboard: InviteLeaderboardEntry[]
  my_rank?: InviteLeaderboardRank | null
}

export type BadgeDefinition = {
  code: string
  name: string
  description: string
  icon: string
  tier: number
  category: 'invite' | 'activity'
}

export type UserBadge = BadgeDefinition & {
  awarded_at: string
}

export type UserBadgesResponse = {
  badges: UserBadge[]
}

export type GenerateShareCardPayload = {
  share_type: 'invite' | 'requirement' | 'portfolio' | 'resource' | 'community_post'
  target_id?: string
}

export type ShareCardData = {
  title: string
  subtitle: string
  tags: string[]
  sharer: string
  qr_url: string
  logo_url: string
}

export type ShareCardResponse = {
  card_data: ShareCardData
}

export type ShareRecord = {
  share_type: 'invite' | 'requirement' | 'portfolio' | 'resource' | 'community_post'
  target_id?: string | null
  visits: number
  registrations: number
}

export type ShareStatsResponse = {
  total_visits: number
  total_registrations: number
  records: ShareRecord[]
}

export function getMyInviteCode(token: string): Promise<InviteCodeResponse> {
  return requestJson<InviteCodeResponse>(
    '/invite/my-code',
    { headers: { ...authHeader(token) } },
    '加载邀请码失败',
  )
}

export function getMyInviteStats(token: string): Promise<InviteStatsResponse> {
  return requestJson<InviteStatsResponse>(
    '/invite/my-stats',
    { headers: { ...authHeader(token) } },
    '加载邀请统计失败',
  )
}

export function getInviteLeaderboard(
  token: string,
  period: 'weekly' | 'alltime',
): Promise<InviteLeaderboardResponse> {
  return requestJson<InviteLeaderboardResponse>(
    `/invite/leaderboard?period=${period}`,
    { headers: { ...authHeader(token) } },
    '加载邀请排行榜失败',
  )
}

export function getBadges(): Promise<BadgeDefinition[]> {
  return requestJson<BadgeDefinition[]>('/badges', {}, '加载徽章失败')
}

export function getMyBadges(token: string): Promise<UserBadgesResponse> {
  return requestJson<UserBadgesResponse>(
    '/badges/my',
    { headers: { ...authHeader(token) } },
    '加载我的徽章失败',
  )
}

export function getUserBadges(username: string): Promise<UserBadgesResponse> {
  return requestJson<UserBadgesResponse>(
    `/badges/user/${encodeURIComponent(username)}`,
    {},
    '加载用户徽章失败',
  )
}

export function generateShareCard(
  token: string,
  payload: GenerateShareCardPayload,
): Promise<ShareCardResponse> {
  return requestJson<ShareCardResponse>(
    '/share/generate-card',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '生成分享卡失败',
  )
}

export function getShareStats(token: string): Promise<ShareStatsResponse> {
  return requestJson<ShareStatsResponse>(
    '/share/stats',
    { headers: { ...authHeader(token) } },
    '加载分享数据失败',
  )
}