/**
 * 团队的假数据。
 *
 * 之前 `/teams` 是一条死路由（声明写成了 `/teams/teams`），团队页恒为「还没有团队」，
 * 连带工作台总览的「资源项目」卡也永远是「还没有资源」——而「资源列表」页明明有 4 个资源。
 * 两块读数说的是两件事（前者是团队资源，后者是个人资源），但演示数据里没有团队，
 * 这个差别看起来就像页面坏了。
 *
 * 这里给一个团队、两个成员与两个团队资源。团队资源单独一批，不改动个人资源：
 * 「我的资源」与「团队资源」本来就是两个端点、两份口径。
 */

import type { components } from '@/api/generated/schema'
import type { McResourcePayload } from '@/api/mcResources'

import { CLIENT_NICKNAME, CLIENT_USERNAME, DEV_NICKNAME, DEV_USERNAME, iso } from './shared'

type TeamResponse = components['schemas']['TeamResponse']
type MemberResponse = components['schemas']['MemberResponse']

export const mockTeams: TeamResponse[] = [
  {
    team_id: 1,
    name: '柒叁工作室',
    description: '接单与资源维护的共用团队。',
    avatar_url: null,
    owner_username: DEV_USERNAME,
    member_count: 2,
    created_at: iso(-120, 10, 0),
    updated_at: iso(-3, 16, 20),
  },
]

export const mockTeamMembers: MemberResponse[] = [
  { username: DEV_USERNAME, role: 'owner', joined_at: iso(-120, 10, 0) },
  { username: CLIENT_USERNAME, role: 'member', joined_at: iso(-40, 14, 30) },
]

/** 团队名下的资源：与个人资源分开，`team_id` 为 1。 */
export const mockTeamResources: McResourcePayload[] = [
  {
    id: 9101,
    creator: DEV_USERNAME,
    ownership_type: 'team',
    team_id: 1,
    requirement_id: null,
    platform: '自研工具',
    title: '柒叁工作室通用登录组件',
    author: DEV_NICKNAME,
    description: '团队内部复用的登录表单与鉴权封装。',
    tag_selections: [],
    file_name: 'team-login-kit.zip',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'published',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    buyout_price_fen: 0,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    copyright_declared_at: null,
    purchased_by_me: false,
    created_at: iso(-80, 9, 0),
    updated_at: iso(-5, 15, 20),
    promo_share_bps: 0,
  },
  {
    id: 9102,
    creator: CLIENT_USERNAME,
    ownership_type: 'team',
    team_id: 1,
    requirement_id: null,
    platform: '自研工具',
    title: '验收清单模板',
    author: CLIENT_NICKNAME,
    description: '交付前逐项对照的验收清单，团队共用。',
    tag_selections: [],
    file_name: 'acceptance-checklist.zip',
    source_url: '',
    cover_url: null,
    docs_url: null,
    visibility: 'review',
    release_note: null,
    origin_type: 'original',
    origin_author: null,
    origin_url: null,
    origin_org: null,
    origin_note: null,
    buyout_price_fen: 0,
    price_fen: 0,
    price_points: 0,
    copyright_declared: false,
    copyright_declared_at: null,
    purchased_by_me: false,
    created_at: iso(-30, 11, 0),
    updated_at: iso(-2, 10, 0),
    promo_share_bps: 0,
  },
]

let nextTeamId = 2

export function findTeam(teamId: number): TeamResponse | undefined {
  return mockTeams.find((item) => item.team_id === teamId)
}

/** 建团队：调用人自动成为 owner（与后端行为一致）。 */
export function createTeamRecord(name: string, description: string): TeamResponse {
  const team: TeamResponse = {
    team_id: nextTeamId,
    name,
    description,
    avatar_url: null,
    owner_username: DEV_USERNAME,
    member_count: 1,
    created_at: iso(0, 10, 0),
    updated_at: iso(0, 10, 0),
  }
  nextTeamId += 1
  mockTeams.unshift(team)

  return team
}
