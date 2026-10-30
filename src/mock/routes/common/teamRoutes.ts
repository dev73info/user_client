/**
 * 团队域（`/api/teams/**`）的假路由。
 *
 * 这一族原来只有两条、而且其中一条是死路由（声明成 `/teams/teams`，归一化后匹配不上）：
 * 团队页恒为「还没有团队」，工作台总览的「资源项目」卡也跟着恒为「还没有资源」
 * ——那卡读的是**团队资源**（`GET /api/resource/resources/team`），
 * 与「资源列表」页的个人资源不是同一份数据。
 *
 * 路径一律照契约 `/teams/...`；建团队、邀请、移除、改角色、退出都会真的动内存表。
 */

import type { components } from '@/api/generated/schema'

import type { MockRoute } from '../../router'
import {
  createTeamRecord,
  findTeam,
  mockTeamMembers,
  mockTeams,
} from '../../db/teams'
import { DEV_USERNAME, datetime } from '../../db/shared'
import { errorResponse, jsonResponse, noContentResponse } from '../../response'

type Invitation = components['schemas']['InvitationResponse']

const invitations: Invitation[] = []

let nextInvitationId = 1

export const teamRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/teams',
    note: '我所在的团队（契约是裸数组）',
    handler: () => jsonResponse(mockTeams),
  },
  {
    method: 'POST',
    path: '/teams',
    note: '建团队：调用人自动成为 owner',
    handler: (request) => {
      const body = (request.body ?? {}) as { name?: string; description?: string }
      const name = (body.name ?? '').trim()
      if (!name) {
        return errorResponse(400, '团队名不能为空')
      }
      if (mockTeams.some((item) => item.name === name)) {
        return errorResponse(409, '团队名已被占用')
      }

      return jsonResponse(createTeamRecord(name, (body.description ?? '').trim()), 201)
    },
  },
  {
    method: 'GET',
    path: '/teams/:teamId',
    note: '团队详情：契约是 `{team, members}`，不是把成员摊平进团队',
    handler: (_request, params) => {
      const team = findTeam(Number(params.teamId))
      if (!team) {
        return errorResponse(404, '团队不存在')
      }

      return jsonResponse({ team, members: mockTeamMembers })
    },
  },
  {
    method: 'PATCH',
    path: '/teams/:teamId',
    note: '改团队名与简介',
    handler: (request, params) => {
      const team = findTeam(Number(params.teamId))
      if (!team) {
        return errorResponse(404, '团队不存在')
      }
      const body = (request.body ?? {}) as { name?: string; description?: string }
      if (typeof body.name === 'string' && body.name.trim()) team.name = body.name.trim()
      if (typeof body.description === 'string') team.description = body.description
      team.updated_at = datetime(0, 12, 0)

      return jsonResponse(team)
    },
  },
  {
    method: 'DELETE',
    path: '/teams/:teamId',
    note: '解散团队',
    handler: (_request, params) => {
      const index = mockTeams.findIndex((item) => item.team_id === Number(params.teamId))
      if (index >= 0) {
        mockTeams.splice(index, 1)
      }

      return noContentResponse()
    },
  },
  {
    method: 'GET',
    path: '/teams/:teamId/members',
    note: '团队成员',
    handler: () => jsonResponse(mockTeamMembers),
  },
  {
    method: 'POST',
    path: '/teams/:teamId/members',
    note: '邀请成员：契约回的是这条邀请，不是直接把成员加进团队',
    handler: (request, params) => {
      const username = (
        (request.body as { username?: string } | null)?.username ?? ''
      ).trim()
      if (!username) {
        return errorResponse(400, '请填写用户名')
      }
      const invitation: Invitation = {
        id: nextInvitationId,
        team_id: Number(params.teamId),
        team_name: findTeam(Number(params.teamId))?.name ?? '',
        inviter_username: DEV_USERNAME,
        invitee_username: username,
        status: 'pending',
        created_at: datetime(0, 12, 0),
      }
      nextInvitationId += 1
      invitations.unshift(invitation)

      return jsonResponse(invitation, 201)
    },
  },
  {
    method: 'DELETE',
    path: '/teams/:teamId/members/:username',
    note: '移除成员',
    handler: (_request, params) => {
      const index = mockTeamMembers.findIndex((item) => item.username === params.username)
      if (index >= 0) {
        mockTeamMembers.splice(index, 1)
      }

      return noContentResponse()
    },
  },
  {
    method: 'PATCH',
    path: '/teams/:teamId/members/:username',
    note: '调整成员角色（admin / member）',
    handler: (request, params) => {
      const member = mockTeamMembers.find((item) => item.username === params.username)
      if (member) {
        const role = (request.body as { role?: string } | null)?.role
        if (role) {
          member.role = role
        }
      }

      return noContentResponse()
    },
  },
  {
    method: 'POST',
    path: '/teams/:teamId/leave',
    note: '退出团队',
    handler: () => noContentResponse(),
  },
  {
    method: 'POST',
    path: '/teams/:teamId/transfer-owner',
    note: '转移所有权',
    handler: (request, params) => {
      const team = findTeam(Number(params.teamId))
      if (!team) {
        return errorResponse(404, '团队不存在')
      }
      const username = ((request.body as { username?: string } | null)?.username ?? '').trim()
      if (username) {
        team.owner_username = username
      }
      team.updated_at = datetime(0, 12, 0)

      return jsonResponse(team)
    },
  },
  {
    method: 'GET',
    path: '/teams/invitations',
    note: '发给我的团队邀请',
    handler: () => jsonResponse(invitations.filter((item) => item.invitee_username === DEV_USERNAME)),
  },
  {
    method: 'GET',
    path: '/teams/:teamId/invitations',
    note: '某个团队发出的邀请',
    handler: (_request, params) =>
      jsonResponse(invitations.filter((item) => item.team_id === Number(params.teamId))),
  },
  {
    method: 'POST',
    path: '/teams/invitations/:invitationId/accept',
    note: '接受邀请',
    handler: (_request, params) => {
      const invitation = invitations.find((item) => String(item.id) === params.invitationId)
      const team = invitation ? findTeam(invitation.team_id) : undefined
      if (!invitation || !team) {
        return errorResponse(404, '邀请不存在')
      }
      invitation.status = 'accepted'

      return jsonResponse(team)
    },
  },
  {
    method: 'POST',
    path: '/teams/invitations/:invitationId/reject',
    note: '拒绝邀请',
    handler: (_request, params) => {
      const invitation = invitations.find((item) => String(item.id) === params.invitationId)
      if (!invitation) {
        return errorResponse(404, '邀请不存在')
      }
      invitation.status = 'rejected'

      return noContentResponse()
    },
  },
  {
    method: 'GET',
    path: '/team/public/:teamId',
    note: '团队名片（免登录）',
    handler: (_request, params) => {
      const team = findTeam(Number(params.teamId))

      return team ? jsonResponse(team) : errorResponse(404, '团队不存在')
    },
  },
]
