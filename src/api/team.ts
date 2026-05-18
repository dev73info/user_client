import { authHeader, requestJson } from '@/api/http'

export type TeamResponse = {
  team_id: number
  name: string
  description: string
  avatar_url: string | null
  owner_username: string
  member_count: number
  created_at: string
  updated_at: string
}

export type TeamMemberResponse = {
  username: string
  role: string
  joined_at: string
}

export type TeamDetailResponse = {
  team_id: number
  name: string
  description: string
  avatar_url: string | null
  owner_username: string
  members: TeamMemberResponse[]
  created_at: string
  updated_at: string
}

export type TeamInvitationResponse = {
  id: number
  team_id: number
  team_name: string
  inviter_username: string
  invitee_username: string
  status: string
  created_at: string
}

export type CreateTeamRequest = {
  name: string
  description?: string
}

export type UpdateTeamRequest = {
  name?: string
  description?: string
  avatar_url?: string
}

export type InviteMemberRequest = {
  username: string
}

export type UpdateMemberRoleRequest = {
  role: string
}

export async function createTeam(
  token: string,
  payload: CreateTeamRequest,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    '/team/teams',
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '创建团队失败',
  )
}

export async function getTeamDetail(
  token: string,
  teamId: number,
): Promise<TeamDetailResponse> {
  return requestJson<TeamDetailResponse>(
    `/team/teams/${teamId}`,
    { headers: authHeader(token) },
    '获取团队详情失败',
  )
}

export async function listMyTeams(token: string): Promise<TeamResponse[]> {
  return requestJson<TeamResponse[]>(
    '/team/teams',
    { headers: authHeader(token) },
    '获取团队列表失败',
  )
}

export async function updateTeam(
  token: string,
  teamId: number,
  payload: UpdateTeamRequest,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    `/team/teams/${teamId}`,
    {
      method: 'PATCH',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '更新团队失败',
  )
}

export async function deleteTeam(
  token: string,
  teamId: number,
): Promise<void> {
  return requestJson<void>(
    `/team/teams/${teamId}`,
    { method: 'DELETE', headers: authHeader(token) },
    '解散团队失败',
  )
}

export async function inviteMember(
  token: string,
  teamId: number,
  payload: InviteMemberRequest,
): Promise<TeamInvitationResponse> {
  return requestJson<TeamInvitationResponse>(
    `/team/teams/${teamId}/members`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '邀请成员失败',
  )
}

export async function removeMember(
  token: string,
  teamId: number,
  username: string,
): Promise<void> {
  return requestJson<void>(
    `/team/teams/${teamId}/members/${encodeURIComponent(username)}`,
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
  return requestJson<void>(
    `/team/teams/${teamId}/members/${encodeURIComponent(username)}`,
    {
      method: 'PATCH',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '更新角色失败',
  )
}

export async function leaveTeam(
  token: string,
  teamId: number,
): Promise<void> {
  return requestJson<void>(
    `/team/teams/${teamId}/leave`,
    { method: 'POST', headers: authHeader(token) },
    '退出团队失败',
  )
}

export async function listTeamInvitations(
  token: string,
  teamId: number,
): Promise<TeamInvitationResponse[]> {
  return requestJson<TeamInvitationResponse[]>(
    `/team/teams/${teamId}/invitations`,
    { headers: authHeader(token) },
    '获取邀请列表失败',
  )
}

export async function listUserInvitations(
  token: string,
): Promise<TeamInvitationResponse[]> {
  return requestJson<TeamInvitationResponse[]>(
    '/team/invitations',
    { headers: authHeader(token) },
    '获取邀请列表失败',
  )
}

export async function acceptInvitation(
  token: string,
  invitationId: number,
): Promise<TeamResponse> {
  return requestJson<TeamResponse>(
    `/team/invitations/${invitationId}/accept`,
    { method: 'POST', headers: authHeader(token) },
    '接受邀请失败',
  )
}

export async function rejectInvitation(
  token: string,
  invitationId: number,
): Promise<void> {
  return requestJson<void>(
    `/team/invitations/${invitationId}/reject`,
    { method: 'POST', headers: authHeader(token) },
    '拒绝邀请失败',
  )
}
