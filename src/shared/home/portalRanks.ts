/**
 * 首页侧栏两张榜单（开发者贡献榜 / 活跃团队）的聚合纯函数。
 *
 * 两者都从**同一份** `publicResources` 派生：资源列表由视图统一请求（7 个消费方共用一份），
 * 这里只做「资源数组 → 榜单数组」的聚合，绝不再发请求，否则会出现第二份数据源，
 * 列表与榜单可能对不上。头像 URL 的拼装也以参数注入，纯函数层不碰 `apiUrl`，方便单测。
 */

/** 榜单只吃资源里的这几个字段，避免把整个 `PublicMcResourceItem` 拖进纯函数层。 */
export type PortalRankResource = {
  creator: string
  author: string
  creator_avatar_url?: string | null
  creator_credit_score?: number | null
  creator_username_gradient?: boolean
  creator_username_color?: string | null
  updated_at: string
  team_id: number | null
  team_name: string | null
  team_avatar_url?: string | null
}

export type DeveloperRank = {
  /** 展示名：优先 `creator`，回落 `author`，都没有给「匿名开发者」 */
  name: string
  /** 开发者用户名（空串表示匿名资源，点进去的路径也用这个） */
  username: string
  avatarUrl: string
  creditScore: number | null
  /** 名下公开资源数：既是排序依据，也是页脚「本周 N 个资源」的来源 */
  resourceCount: number
  gradient?: boolean
  userColor?: string
}

export type TeamRank = {
  teamId: number
  teamName: string
  avatarUrl: string
  resourceCount: number
}

/** 徽章只需要这几个字段（`UserBadge` 结构上兼容），组件层因此不必 import `@/api/invite`。 */
export type PortalDeveloperBadge = {
  code: string
  name: string
  description: string
  icon: string
}

/** 侧栏高度固定，两张榜单都只留前 4 名。 */
export const RANK_LIMIT = 4

export type RankBuildOptions = {
  /** 头像相对路径 → 可访问 URL；缺省原样返回（单测里不必构造后端地址） */
  resolveAvatarUrl?: (raw?: string | null) => string
}

const identityAvatar = (raw?: string | null) => raw ?? ''

/**
 * 开发者贡献榜：按 `creator`（用户名）聚合资源，先按资源数降序，
 * 再按最近更新时间降序，最后按用户名中文序兜底，取前 4。
 *
 * 同一开发者的多个资源里，信息按「先到先得」合并：头像 / 信用分取第一个非空值，
 * 渐变与自定义用户名色只要有一个资源带上就算带上（与原视图内联实现一致）。
 */
export function buildDeveloperRanks(
  resources: readonly PortalRankResource[],
  options: RankBuildOptions = {},
): DeveloperRank[] {
  const resolveAvatarUrl = options.resolveAvatarUrl ?? identityAvatar
  const grouped = new Map<
    string,
    {
      name: string
      username: string
      avatarUrl: string
      creditScore: number | null
      resourceCount: number
      latestAt: number
      gradient: boolean
      userColor?: string
    }
  >()

  for (const resource of resources) {
    const name = resource.creator.trim() || resource.author.trim() || '匿名开发者'
    const username = resource.creator.trim() || ''
    const current = grouped.get(username)
    const latestAt = Date.parse(resource.updated_at)
    const avatarUrl = resolveAvatarUrl(resource.creator_avatar_url)
    const creditScore =
      typeof resource.creator_credit_score === 'number' ? resource.creator_credit_score : null
    const gradient = !!resource.creator_username_gradient
    const userColor = resource.creator_username_color || ''

    if (current) {
      current.resourceCount += 1
      current.latestAt = Math.max(
        current.latestAt,
        Number.isNaN(latestAt) ? current.latestAt : latestAt,
      )
      if (!current.avatarUrl && avatarUrl) {
        current.avatarUrl = avatarUrl
      }
      if (current.creditScore == null && creditScore != null) {
        current.creditScore = creditScore
      }
      if (!current.gradient) {
        current.gradient = gradient
      }
      if (!current.userColor) {
        current.userColor = userColor
      }
      continue
    }

    grouped.set(username, {
      name,
      username,
      avatarUrl,
      creditScore,
      resourceCount: 1,
      latestAt: Number.isNaN(latestAt) ? 0 : latestAt,
      gradient,
      userColor,
    })
  }

  if (grouped.size === 0) return []

  return [...grouped.values()]
    .sort(
      (left, right) =>
        right.resourceCount - left.resourceCount ||
        right.latestAt - left.latestAt ||
        left.username.localeCompare(right.username, 'zh-CN'),
    )
    .slice(0, RANK_LIMIT)
    .map((item) => ({
      name: item.name,
      username: item.username,
      avatarUrl: item.avatarUrl,
      creditScore: item.creditScore,
      resourceCount: item.resourceCount,
      gradient: item.gradient,
      userColor: item.userColor,
    }))
}

/** 贡献榜页脚「本周 N 个资源」：入榜开发者名下资源数之和。 */
export function countContribResources(ranks: readonly DeveloperRank[]): number {
  return ranks.reduce((sum, developer) => sum + developer.resourceCount, 0)
}

/**
 * 活跃团队：按 `team_id` 聚合，没有团队归属的资源直接跳过；
 * 按资源数降序取前 4，并列时保持资源的原始先后（`Array.sort` 稳定）。
 */
export function buildTeamRanks(
  resources: readonly PortalRankResource[],
  options: RankBuildOptions = {},
): TeamRank[] {
  const resolveAvatarUrl = options.resolveAvatarUrl ?? identityAvatar
  const grouped = new Map<number, { teamName: string; avatarUrl: string; resourceCount: number }>()

  for (const resource of resources) {
    if (!resource.team_id || !resource.team_name) continue
    const avatarUrl = resolveAvatarUrl(resource.team_avatar_url)
    const existing = grouped.get(resource.team_id)
    if (existing) {
      existing.resourceCount += 1
      if (!existing.avatarUrl && avatarUrl) {
        existing.avatarUrl = avatarUrl
      }
    } else {
      grouped.set(resource.team_id, {
        teamName: resource.team_name,
        avatarUrl,
        resourceCount: 1,
      })
    }
  }

  if (grouped.size === 0) return []

  return [...grouped.entries()]
    .sort(([, a], [, b]) => b.resourceCount - a.resourceCount)
    .slice(0, RANK_LIMIT)
    .map(([teamId, info]) => ({
      teamId,
      teamName: info.teamName,
      avatarUrl: info.avatarUrl,
      resourceCount: info.resourceCount,
    }))
}
