import { describe, expect, it } from 'vitest'

import type { TeamMemberResponse } from '@/api/team'
import {
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
