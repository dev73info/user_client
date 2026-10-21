import type { TeamMemberResponse } from '@/api/team'

/**
 * 团队详情页的展示层纯函数：角色文案、卡头元信息、头像首字。
 *
 * 从 `views/TeamDetailView.vue` 抽出来，供页面、资料卡与成员列表共用；只做「值 → 显示串」的映射，
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
