/**
 * 团队域接口（契约：`/api/teams/**` 与免登录的 `/api/team/public/{team_id}`）。
 *
 * 响应类型一律取 `components['schemas'][...]`；**团队详情是 `{team, members}`**，
 * 不是把成员摊平进团队对象——形状照契约来，消费方自己挑要用的那一层。
 */
import type { components } from '@/api/generated/schema'
import { authHeader, requestJson, requestVoid } from '@/api/http'

type Schemas = components['schemas']

/** 团队概要。 */
export type TeamResponse = Schemas['TeamResponse']

/** 团队成员。 */
export type TeamMemberResponse = Schemas['MemberResponse']

/** 团队详情：`{team, members}`。 */
export type TeamDetailResponse = Schemas['TeamDetailResponse']

/** 团队邀请。 */
export type TeamInvitationResponse = Schemas['InvitationResponse']

/** 建团队请求体。 */
export type CreateTeamRequest = Schemas['CreateTeamRequest']

/** 改团队信息请求体；缺省字段表示不改。 */
export type UpdateTeamRequest = Schemas['UpdateTeamRequest']

/** 邀请成员 / 转移所有权：都只需要一个用户名。 */
export type InviteMemberRequest = Schemas['UsernameRequest']

/** 调整成员角色（`admin` / `member`）。 */
export type UpdateMemberRoleRequest = Schemas['UpdateRoleRequest']

const jsonHeaders = (token: string) => ({
  ...authHeader(token),
  'Content-Type': 'application/json',
})

export async function createTeam(
  token: string,
  payload: CreateTeamRequest,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    '/teams',
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '创建团队失败',
  )
}

/** 团队详情：契约回 `{team, members}`。 */
export async function getTeamDetail(
  token: string,
  teamId: number,
): Promise<TeamDetailResponse> {
  return requestJson<TeamDetailResponse>(
    `/teams/${teamId}`,
    { headers: authHeader(token) },
    '获取团队详情失败',
  )
}

/** 团队名片：免登录，任何人都能读团队的名字、简介与头像。 */
export async function getPublicTeam(teamId: number): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    `/team/public/${teamId}`,
    { headers: {} },
    '获取团队名片失败',
  )
}

export async function listMyTeams(token: string): Promise<TeamResponse[]> {
  return requestJson<TeamResponse[]>('/teams', { headers: authHeader(token) }, '获取团队列表失败')
}

export async function updateTeam(
  token: string,
  teamId: number,
  payload: UpdateTeamRequest,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    `/teams/${teamId}`,
    { method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '更新团队失败',
  )
}

export async function uploadTeamAvatar(
  token: string,
  teamId: number,
  file: File,
): Promise<TeamResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<TeamResponse>(
    `/teams/${teamId}/avatar`,
    { method: 'POST', headers: authHeader(token), body: formData },
    '上传头像失败',
  )
}

export async function deleteTeam(token: string, teamId: number): Promise<void> {
  return requestVoid(`/teams/${teamId}`, { method: 'DELETE', headers: authHeader(token) }, '解散团队失败')
}

/** 邀请成员：后端落一条邀请，返回的就是这条邀请（**不是**直接把成员加进团队）。 */
export async function inviteMember(
  token: string,
  teamId: number,
  payload: InviteMemberRequest,
): Promise<TeamInvitationResponse> {
  return requestJson<TeamInvitationResponse>(
    `/teams/${teamId}/members`,
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '邀请成员失败',
  )
}

export async function removeMember(
  token: string,
  teamId: number,
  username: string,
): Promise<void> {
  return requestVoid(
    `/teams/${teamId}/members/${encodeURIComponent(username)}`,
    { method: 'DELETE', headers: authHeader(token) },
    '移除成员失败',
  )
}

export async function updateMemberRole(
  token: string,
  teamId: number,
  username: string,
  payload: UpdateMemberRoleRequest,
): Promise<void> {
  return requestVoid(
    `/teams/${teamId}/members/${encodeURIComponent(username)}`,
    { method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '更新角色失败',
  )
}

export async function leaveTeam(token: string, teamId: number): Promise<void> {
  return requestVoid(
    `/teams/${teamId}/leave`,
    { method: 'POST', headers: authHeader(token) },
    '退出团队失败',
  )
}

export async function transferTeamOwner(
  token: string,
  teamId: number,
  username: string,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    `/teams/${teamId}/transfer-owner`,
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ username }) },
    '转移所有权失败',
  )
}

export async function listTeamInvitations(
  token: string,
  teamId: number,
): Promise<TeamInvitationResponse[]> {
  return requestJson<TeamInvitationResponse[]>(
    `/teams/${teamId}/invitations`,
    { headers: authHeader(token) },
    '获取邀请列表失败',
  )
}

export async function listUserInvitations(token: string): Promise<TeamInvitationResponse[]> {
  return requestJson<TeamInvitationResponse[]>(
    '/teams/invitations',
    { headers: authHeader(token) },
    '获取邀请列表失败',
  )
}

export async function acceptInvitation(
  token: string,
  invitationId: number,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    `/teams/invitations/${invitationId}/accept`,
    { method: 'POST', headers: authHeader(token) },
    '接受邀请失败',
  )
}

export async function rejectInvitation(token: string, invitationId: number): Promise<void> {
  return requestVoid(
    `/teams/invitations/${invitationId}/reject`,
    { method: 'POST', headers: authHeader(token) },
    '拒绝邀请失败',
  )
}
