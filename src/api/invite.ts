import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

export type InviteCodeResponse = Schemas['InviteCodeResponse']
export type InviteStatsResponse = Schemas['InviteStatsResponse']
export type InviteLeaderboardResponse = Schemas['InviteLeaderboardResponse']
export type InviteLeaderboardEntry = Schemas['InviteLeaderboardEntry']
export type InviteLeaderboardRank = Schemas['InviteLeaderboardRank']
export type BadgeDefinition = Schemas['BadgeDefinitionResponse']
export type UserBadge = Schemas['UserBadgeResponse']
export type UserBadgesResponse = Schemas['UserBadgesResponse']
export type GenerateShareCardPayload = Schemas['GenerateShareCardRequest']
export type ShareCardData = Schemas['ShareCardData']
export type ShareCardResponse = Schemas['ShareCardResponse']
export type ShareRecord = Schemas['ShareRecordResponse']
export type ShareStatsResponse = Schemas['ShareStatsResponse']
export type InvitePeriod = 'weekly' | 'alltime'

function jsonHeaders(token: string): Headers {
  return authHeaders(token, { 'Content-Type': 'application/json' })
}

export function getMyInviteCode(token: string): Promise<InviteCodeResponse> {
  return requestJson('/invite/my-code', { headers: authHeaders(token) }, '加载邀请码失败')
}

export function getMyInviteStats(token: string): Promise<InviteStatsResponse> {
  return requestJson('/invite/my-stats', { headers: authHeaders(token) }, '加载邀请统计失败')
}

export function getInviteLeaderboard(
  token: string,
  period: InvitePeriod,
): Promise<InviteLeaderboardResponse> {
  return requestJson(
    `/invite/leaderboard?period=${period}`,
    { headers: authHeaders(token) },
    '加载邀请排行榜失败',
  )
}

export function getBadges(): Promise<BadgeDefinition[]> {
  return requestJson('/badges', {}, '加载徽章失败')
}

export function getMyBadges(token: string): Promise<UserBadgesResponse> {
  return requestJson('/badges/my', { headers: authHeaders(token) }, '加载我的徽章失败')
}

export function setMyEquippedBadges(token: string, codes: string[]): Promise<UserBadgesResponse> {
  return requestJson(
    '/badges/my/equipped',
    { method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify({ codes }) },
    '更新佩戴徽章失败',
  )
}

export function getUserBadges(username: string): Promise<UserBadgesResponse> {
  return requestJson(`/badges/user/${encodeURIComponent(username)}`, {}, '加载用户徽章失败')
}

export function generateShareCard(
  token: string,
  payload: GenerateShareCardPayload,
): Promise<ShareCardResponse> {
  return requestJson(
    '/share/generate-card',
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '生成分享卡失败',
  )
}

export function getShareStats(token: string): Promise<ShareStatsResponse> {
  return requestJson('/share/stats', { headers: authHeaders(token) }, '加载分享数据失败')
}
