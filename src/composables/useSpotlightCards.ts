import { computed, ref, type Ref } from 'vue'

import { apiUrl } from '@/api/http'
import type { PublicMcResourceItem } from '@/api/resources'
import { formatTimeLabel } from '@/shared/home/portalDisplay'
import {
  buildResourceCardSummary,
  buildResourceCoverAlt,
  compareSpotlightResources,
  resolveSpotlightCover,
  spotlightAuthorLabel,
  spotlightCategoryBadge,
  spotlightMarkFor,
  spotlightTagChips,
} from '@/shared/home/resourceCardDisplay'

export type SpotlightCard = {
  kind: 'requirement' | 'resource'
  title: string
  summary: string
  /** 卡片标签：与资源详情页同款胶囊，最多 3 个 */
  tags: string[]
  /** 封面左上：平台 / 品类 */
  badge: string
  /** 封面右上：仅精选；空字符串表示不展示 */
  mark: string
  authorLabel?: string
  metaTime?: string
  viewCount: number
  downloadCount: number
  likeCount: number
  likedByMe: boolean
  gradient?: boolean
  userColor?: string
  accent: string
  coverUrl?: string
  coverAlt?: string
  requirementId?: string
  resourceId?: number
  originLabel?: string
  originRepost?: boolean
}

/** 卡片封面的四种色板，按卡片序号轮转；顺序变了首页配色的节奏就会变，别随手调。 */
const SPOTLIGHT_ACCENTS = ['nebula', 'sunset', 'forest', 'frost'] as const

/**
 * 精选资源卡片映射（R047 从 `views/HomeView.vue` 拆出）：资源 → 卡片，纯派生状态。
 *
 * - 候选集：有效精选 / 置顶 / 点赞达到阈值的资源；候选为空时**回退到全部已发布**，
 *   按同一套比较器排序，避免首页区块空白（这两步的顺序与旧实现逐字一致）。
 * - 封面兜底：加载失败过的地址记在 `failedCoverUrls` 里，`coverSrc` 返回空串让模板回落首字。
 *   集合只增不减 —— 翻页 / 定时刷新都会重渲染 <img>，清掉失败的地址会反复碎图闪烁。
 *
 * 入参是两个外部 `ref`（资源、阈值都由 `usePublicResources` 持有），本文件不自己发请求，
 * 也不复制状态，因此点赞回写、定时刷新都能直接反映到卡片上。
 */
export function useSpotlightCards(options: {
  resources: Ref<readonly PublicMcResourceItem[]>
  highLikeThreshold: Ref<number>
  /** 封面相对路径 → 绝对地址，默认过 `apiUrl`；单测可注入假的免得依赖运行时配置 */
  resolveCoverUrl?: (raw?: string | null) => string
}) {
  const toCoverUrl = options.resolveCoverUrl ?? ((raw?: string | null) => (raw ? apiUrl(raw) : ''))

  const failedCoverUrls = ref<Set<string>>(new Set())

  function handleCoverError(url: string | undefined) {
    if (!url) return
    const next = new Set(failedCoverUrls.value)
    next.add(url)
    failedCoverUrls.value = next
  }

  /** 失败过的封面给空串，模板据此回落成首字占位块。 */
  function coverSrc(card: { coverUrl?: string }) {
    return resolveSpotlightCover(card.coverUrl, failedCoverUrls.value)
  }

  const cards = computed<SpotlightCard[]>(() => {
    const published = [...options.resources.value]
    const threshold = options.highLikeThreshold.value
    const hybrid = published.filter(
      (item) => item.is_featured || item.is_pinned || (item.like_count ?? 0) >= threshold,
    )
    // 候选为空时回退到全部已发布，按同一套排序，避免首页区块空白。
    const candidates = (hybrid.length > 0 ? hybrid : published).sort(compareSpotlightResources)

    return candidates.map((item, index) => {
      return {
        kind: 'resource' as const,
        title: item.title,
        summary: buildResourceCardSummary(item),
        tags: spotlightTagChips(item),
        badge: spotlightCategoryBadge(item),
        mark: spotlightMarkFor(item),
        authorLabel: spotlightAuthorLabel(item),
        metaTime: formatTimeLabel(item.updated_at),
        viewCount: item.view_count ?? 0,
        downloadCount: item.download_count ?? 0,
        likeCount: item.like_count ?? 0,
        likedByMe: !!item.liked_by_me,
        gradient: !!item.author_username_gradient,
        userColor: item.author_username_color || '',
        accent: SPOTLIGHT_ACCENTS[index % SPOTLIGHT_ACCENTS.length] ?? 'nebula',
        coverUrl: toCoverUrl(item.cover_url),
        coverAlt: buildResourceCoverAlt(item),
        resourceId: item.id,
        originLabel: item.origin_type === 'repost' ? '转载' : '原创',
        originRepost: item.origin_type === 'repost',
      }
    })
  })

  return { cards, coverSrc, handleCoverError }
}
