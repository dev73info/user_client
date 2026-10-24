import type { TeamMemberResponse, TeamResponse } from '@/api/team'
import { parseBackendDateTime } from '@/shared/datetime'

/**
 * 团队页的展示层纯函数：角色文案、卡头元信息、头像首字、邀请时间与「我的团队」的排序 / 筛选。
 *
 * 详情页那批从 `views/TeamDetailView.vue` 抽出来，列表页那批从 `views/TeamsView.vue` 抽出来；
 * 供页面、资料卡、成员列表与邀请卡共用。只做「值 → 值」的映射，
 * 不读 store、不发请求，便于单测。
 */

/* 角色作为成员行的次级信息（`.dev-stack-item__meta`），配色只走 --dev-muted，
   不给管理员 / 所有者单独上紫与橙——开发者体系里只有蓝（进行中）、青（已完成）、金（金额与提示）
   三支强调色，角色不在其中，多出来的两支色相是这一页与其余菜单页最明显的色差来源。 */
export function teamRoleLabel(role: string): string {
  if (role === 'owner') return '所有者'
  if (role === 'admin') return '管理员'
  return '成员'
}

/** 读数条里的「我的角色」：不在成员表里（或详情还没取回来）时长横线占位。 */
export function teamMyRoleLabel(member: TeamMemberResponse | null | undefined): string {
  return member ? teamRoleLabel(member.role) : '—'
}

/** 资料卡头右下的那行「N 名成员 · 所有者 X」。 */
export function teamMemberMetaLabel(memberCount: number, ownerUsername: string): string {
  return `${memberCount} 名成员 · 所有者 ${ownerUsername}`
}

/** 没有头像图时的占位字：取首字，英文转大写。 */
export function teamAvatarInitial(name: string): string {
  return name.charAt(0).toUpperCase()
}

/** 所有者对成员行给出的角色开关文案（当前是管理员就降，否则升）。 */
export function teamRoleToggleLabel(role: string): string {
  return role === 'admin' ? '降为成员' : '升为管理'
}

/** 头像上的「更换头像」按钮，上传中要改口。 */
export function teamAvatarEditLabel(uploading: boolean): string {
  return uploading ? '上传中...' : '更换头像'
}

/**
 * 「我的团队」列表工具条的筛选条件。
 *
 * 取值用空串表示「不筛选」，与 dev-resource-list / dev-my-requirements 的 filters 写法一致。
 */
export type TeamListFilters = {
  keyword: string
  scope: string
}

/** 列表排序：新到的团队排前面（按 `team_id` 倒序），不改入参。 */
export function sortTeamsByNewest(teams: readonly TeamResponse[]): TeamResponse[] {
  return [...teams].sort((a, b) => b.team_id - a.team_id)
}

/** 顶部信息条的「我创建的」：所有者就是当前账号的团队数。 */
export function countOwnedTeams(
  teams: readonly Pick<TeamResponse, 'owner_username'>[],
  username: string,
): number {
  return teams.filter((team) => team.owner_username === username).length
}

/** 工具条上是否真的要给「筛选出 X / Y 个」这句提示：关键词与归属都没填时不给。 */
export function hasActiveTeamFilters(filters: TeamListFilters): boolean {
  return Boolean(filters.keyword.trim()) || Boolean(filters.scope)
}

/**
 * 工具条筛选（归属 + 关键词），关键词即时生效、不另给「查询」按钮。
 *
 * 归属按「所有者是不是当前账号」切：`owned` 留自己的，`joined` 留别人的；
 * 其它取值（含空串）不按归属筛。关键词同时匹配团队名称与简介，忽略大小写。
 */
export function filterTeamList(
  teams: readonly TeamResponse[],
  filters: TeamListFilters,
  username: string,
): TeamResponse[] {
  const keyword = filters.keyword.trim().toLowerCase()

  return teams.filter((team) => {
    const isOwner = team.owner_username === username

    if (filters.scope === 'owned' && !isOwner) {
      return false
    }

    if (filters.scope === 'joined' && isOwner) {
      return false
    }

    if (!keyword) {
      return true
    }

    return [team.name, team.description].some((value) =>
      (value ?? '').toLowerCase().includes(keyword),
    )
  })
}

/**
 * 邀请卡上的时间（`InvitationResponse.created_at`）。
 *
 * 后端给的是东八区墙钟串（不带偏移），一律走 `parseBackendDateTime` 解析，
 * 不要 `new Date(str)`：那会按浏览器本地时区理解，非 +08:00 的设备整体偏移。
 * 解析不了就原样回显，不编造时间。
 */
export function formatTeamInvitationTime(value: string): string {
  const date = parseBackendDateTime(value)
  if (!date) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
