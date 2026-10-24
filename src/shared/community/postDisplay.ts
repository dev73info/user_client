import type { CommunityPost } from '@/api/community'
import { parseBackendDateTime } from '@/shared/datetime'

/** 后端时间是东八区墙钟串；到期判断统一走这里，now 由调用方传入便于测试。 */
function isFuture(value: string | null | undefined, now: number): boolean {
  const at = parseBackendDateTime(value)?.getTime()
  return at !== undefined && at > now
}

/**
 * 社区帖子「怎么显示」的纯函数：状态徽标文案、转载标记、推广标识。
 *
 * 从 `views/CommunityView.vue` 抽出来，因为 R047 第三轮之后有**两个**消费者：
 * 帖子列表卡（`CommunityPostList.vue`，组件层不引 `@/api/*`，只从这里取类型）
 * 与详情头（`CommunityPostDetail.vue` 的转载行）。放 `shared/` 而不是 composable 里，
 * 是因为它们不持有任何状态、也不碰接口。
 *
 * 类型统一从这里转发一次（`export type`），组件就不必为了一个类型去引 `@/api/community`——
 * 组件层「一个 api 都不碰」这条口径与 `CommunityBountyBar.vue` 的注释一致。
 */
export type { CommunityPost, CommunityTag, PostBoostKind } from '@/api/community'

/** 状态徽标文案。三档状态与后端枚举一一对应，`Record` 少一档会直接类型报错。 */
export function postStatusText(status: CommunityPost['status']): string {
  const map: Record<CommunityPost['status'], string> = {
    pending_review: '审核中',
    published: '公开中',
    rejected: '已驳回',
  }
  return map[status]
}

/** 是不是转载帖（决定徽标文案与配色档）。 */
export function isRepostPost(post: CommunityPost): boolean {
  return post.origin_type === 'repost'
}

/** 转载出处那一行的文案：机构与原作者各自可能缺，缺哪个就少哪半句。 */
export function repostLabel(post: CommunityPost): string {
  const parts: string[] = []
  if (post.origin_org) {
    parts.push(`转载自 ${post.origin_org}`)
  }
  if (post.origin_author) {
    parts.push(`原作者 ${post.origin_author}`)
  }
  return parts.join(' · ')
}

/**
 * 列表卡上的推广标识串：只报还在有效期内的档位。
 *
 * 注意与详情头那一串（`useCommunityBoost` 的 `activeBoostLabels`）口径不同——
 * 详情头不报「上浮」，列表卡报（上浮只影响列表排序）。这处差异是改造前的原样，
 * 不是抽组件时引入的。
 */
export function postBoostLabel(post: CommunityPost): string {
  const now = Date.now()
  const labels: string[] = []
  // 「2 天内顶过」要按东八区解析后的真实瞬时判断：直接 new Date(墙钟串) 在非 +08:00 的设备上
  // 会把窗口算成 2 天 8 小时，这是误判而不只是显示偏差。
  const bumpedAt = parseBackendDateTime(post.bumped_at)?.getTime()
  if (bumpedAt !== undefined && bumpedAt > now - 2 * 24 * 60 * 60 * 1000) {
    labels.push('上浮')
  }
  if (isFuture(post.highlight_until, now)) {
    labels.push('高亮')
  }
  if (isFuture(post.homepage_until, now)) {
    labels.push('首页推荐')
  }
  if (isFuture(post.section_until, now)) {
    labels.push('板块推荐')
  }
  if (isFuture(post.hot_until, now)) {
    labels.push('热门展示')
  }
  return labels.join(' · ')
}
