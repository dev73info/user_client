import { describe, expect, it } from 'vitest'

import type { TeamMemberResponse, TeamResponse } from '@/api/team'
import {
  countOwnedTeams,
  filterTeamList,
  formatTeamInvitationTime,
  hasActiveTeamFilters,
  sortTeamsByNewest,
  teamAvatarEditLabel,
  teamAvatarInitial,
  teamMemberMetaLabel,
  teamMyRoleLabel,
  teamRoleLabel,
  teamRoleToggleLabel,
} from '@/shared/teamDisplay'

/** 只填展示层用得到的字段；其余字段与这些函数无关。 */
function memberOf(overrides: Partial<TeamMemberResponse> = {}): TeamMemberResponse {
  return {
    username: 'lin',
    role: 'member',
    joined_at: '2026-10-01T00:00:00Z',
    ...overrides,
  } as TeamMemberResponse
}

/** 「我的团队」列表项：只填排序 / 筛选 / 读数用得到的字段。 */
function teamOf(overrides: Partial<TeamResponse> = {}): TeamResponse {
  return {
    team_id: 1,
    name: '七星团队',
    description: '做资源整合',
    avatar_url: null,
    owner_username: 'alice',
    member_count: 3,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

describe('团队展示层', () => {
  it('三种角色各自的文案，未知角色归到成员', () => {
    expect(teamRoleLabel('owner')).toBe('所有者')
    expect(teamRoleLabel('admin')).toBe('管理员')
    expect(teamRoleLabel('member')).toBe('成员')
    expect(teamRoleLabel('something-else')).toBe('成员')
  })

  it('读数条的「我的角色」：不在成员表里时长横线占位', () => {
    expect(teamMyRoleLabel(null)).toBe('—')
    expect(teamMyRoleLabel(undefined)).toBe('—')
    expect(teamMyRoleLabel(memberOf({ role: 'admin' }))).toBe('管理员')
  })

  it('资料卡头的「N 名成员 · 所有者 X」', () => {
    expect(teamMemberMetaLabel(3, 'lin')).toBe('3 名成员 · 所有者 lin')
    expect(teamMemberMetaLabel(0, '—')).toBe('0 名成员 · 所有者 —')
  })

  it('头像占位字取首字，英文转大写、中文原样', () => {
    expect(teamAvatarInitial('lin')).toBe('L')
    expect(teamAvatarInitial('彝良团队')).toBe('彝')
  })

  it('角色开关按当前角色反向给文案', () => {
    expect(teamRoleToggleLabel('admin')).toBe('降为成员')
    expect(teamRoleToggleLabel('member')).toBe('升为管理')
  })

  it('更换头像按钮在上传中改口', () => {
    expect(teamAvatarEditLabel(false)).toBe('更换头像')
    expect(teamAvatarEditLabel(true)).toBe('上传中...')
  })
})

describe('我的团队列表的排序与筛选', () => {
  it('列表按 team_id 倒序，且不改入参顺序', () => {
    const teams = [
      teamOf({ team_id: 2, name: '旧团队' }),
      teamOf({ team_id: 9, name: '新团队' }),
      teamOf({ team_id: 5, name: '中间团队' }),
    ]

    expect(sortTeamsByNewest(teams).map((team) => team.team_id)).toEqual([9, 5, 2])
    // 原数组保持取回来的顺序
    expect(teams.map((team) => team.team_id)).toEqual([2, 9, 5])
  })

  it('读数条的「我创建的」只数所有者是自己的团队', () => {
    const teams = [
      teamOf({ team_id: 1, owner_username: 'alice' }),
      teamOf({ team_id: 2, owner_username: 'bob' }),
      teamOf({ team_id: 3, owner_username: 'alice' }),
    ]

    expect(countOwnedTeams(teams, 'alice')).toBe(2)
    expect(countOwnedTeams(teams, 'carol')).toBe(0)
    expect(countOwnedTeams([], 'alice')).toBe(0)
  })

  it('工具条提示：只有空白关键词或没选归属时不提示', () => {
    expect(hasActiveTeamFilters({ keyword: '', scope: '' })).toBe(false)
    // 只敲了空格不算筛选
    expect(hasActiveTeamFilters({ keyword: '   ', scope: '' })).toBe(false)
    expect(hasActiveTeamFilters({ keyword: '七星', scope: '' })).toBe(true)
    expect(hasActiveTeamFilters({ keyword: '', scope: 'owned' })).toBe(true)
  })

  it('归属筛选：owned 留自己的、joined 留别人的，空串不筛', () => {
    const teams = [
      teamOf({ team_id: 1, name: '我建的', owner_username: 'alice' }),
      teamOf({ team_id: 2, name: '别人建的', owner_username: 'bob' }),
    ]
    const none = { keyword: '', scope: '' }

    expect(filterTeamList(teams, none, 'alice').map((team) => team.team_id)).toEqual([1, 2])
    expect(
      filterTeamList(teams, { ...none, scope: 'owned' }, 'alice').map((team) => team.team_id),
    ).toEqual([1])
    expect(
      filterTeamList(teams, { ...none, scope: 'joined' }, 'alice').map((team) => team.team_id),
    ).toEqual([2])
    // 归属与当前账号无关的取值（含 clearable 清空后的空串）一律不按归属筛
    expect(filterTeamList(teams, { ...none, scope: 'whatever' }, 'alice')).toHaveLength(2)
  })

  it('关键词同时匹配团队名称与简介，忽略大小写与首尾空白', () => {
    const teams = [
      teamOf({ team_id: 1, name: 'Seven Stars', description: '做资源整合' }),
      teamOf({ team_id: 2, name: '彝良团队', description: 'SEO 与外链' }),
      teamOf({ team_id: 3, name: '空简介', description: '' }),
    ]

    expect(filterTeamList(teams, { keyword: ' seven ', scope: '' }, 'alice')).toHaveLength(1)
    expect(filterTeamList(teams, { keyword: '资源', scope: '' }, 'alice')).toHaveLength(1)
    expect(filterTeamList(teams, { keyword: 'seo', scope: '' }, 'alice')).toHaveLength(1)
    expect(filterTeamList(teams, { keyword: '没有这条', scope: '' }, 'alice')).toHaveLength(0)
    // 归属与关键词是「与」的关系：筛完归属再按关键词收窄
    expect(
      filterTeamList(
        [teamOf({ team_id: 4, name: '我的七星', owner_username: 'alice' })],
        { keyword: '七星', scope: 'joined' },
        'alice',
      ),
    ).toHaveLength(0)
  })

  it('邀请时间按 zh-CN 拼成年月日 + 时分，解析不了就原样回显', () => {
    expect(formatTeamInvitationTime('2026-10-21T12:00:00Z')).toMatch(
      /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
    )
    // 非法时间不抛错、不显示 Invalid Date
    expect(formatTeamInvitationTime('不是时间')).toBe('不是时间')
    expect(formatTeamInvitationTime('')).toBe('')
  })
})
