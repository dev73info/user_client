import { apiUrl } from '@/api/http'
import type { PublicMcResourceItem } from '@/api/resources'
import { normalizeTagName, type McTagFilterSection } from '@/api/resourceTags'
import { formatResourcePriceLabel } from '@/shared/resourceSale'

/**
 * 桌面资源列表（`ResourceCatalog`）的数据形状与展示换算。
 *
 * 卡片视图、筛选菜单与列表本体共用这里：`McCardItem` 是卡片摊平后的结构，
 * `mapResourceToCard` 一次算好标签、封面地址、价格文案；标题字号档位与更新时间的
 * 拆分也在这里——它们只服务卡片展示，从组件里搬出来免得组件被这些细节占满。
 */
export type McCardItem = {
  id: number
  title: string
  ownerName: string
  author: string
  authorUsernameGradient: boolean
  authorUsernameColor: string
  /** 与作者不是同一人时才有值 */
  developer: string
  developerUsernameGradient: boolean
  developerUsernameColor: string
  description: string
  groupTags: Record<string, string[]>
  tags: string[]
  updatedAt: string
  sourceUrl: string
  coverUrl: string | null
  coverFailed: boolean
  likeCount: number
  likedByMe: boolean
  likeSubmitting: boolean
  originType: 'original' | 'repost'
  originAuthor: string | null
  originOrg: string | null
  originUrl: string | null
  priceFen: number
  pricePoints: number
  priceLabel: string
}

export type FilterSectionView = McTagFilterSection & {
  selected: string[]
}

export function mapResourceToCard(item: PublicMcResourceItem): McCardItem {
  const tags = Array.from(new Set(item.tag_selections.flatMap((entry) => entry.tag_names)))
  const groupTags = Object.fromEntries(
    item.tag_selections.map((entry) => [
      normalizeTagName(entry.group_name),
      entry.tag_names.map((tag) => normalizeTagName(tag)).filter(Boolean),
    ]),
  )

  const priceFen = item.price_fen ?? 0
  const pricePoints = item.price_points ?? 0
  const creator = item.creator.trim()
  return {
    id: item.id,
    title: item.title,
    ownerName: item.creator.trim() || item.author.trim() || item.title,
    author: item.author,
    authorUsernameGradient: !!item.author_username_gradient,
    authorUsernameColor: item.author_username_color || '',
    developer: creator && creator !== item.author.trim() ? creator : '',
    developerUsernameGradient: !!item.creator_username_gradient,
    developerUsernameColor: item.creator_username_color || '',
    description: item.description,
    groupTags,
    tags: tags.length > 0 ? tags : ['未标注'],
    updatedAt: item.updated_at,
    sourceUrl: item.source_url,
    coverUrl: item.cover_url ? apiUrl(item.cover_url) : null,
    coverFailed: false,
    likeCount: item.like_count ?? 0,
    likedByMe: item.liked_by_me ?? false,
    likeSubmitting: false,
    originType: item.origin_type,
    originAuthor: item.origin_author ?? null,
    originOrg: item.origin_org ?? null,
    originUrl: item.origin_url ?? null,
    priceFen,
    pricePoints,
    priceLabel: formatResourcePriceLabel(priceFen, pricePoints),
  }
}

/** 全角字符（中日韩文字与全角符号）：按 1 个字号宽度估算 */
const FULL_WIDTH_CHAR_PATTERN =
  /[\u2e80-\u303f\u3040-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/

/** 标题显示宽度估算（单位 em）：全角按 1，半角（英文 / 数字）按 0.55。 */
function titleEmWidth(title: string): number {
  let width = 0
  for (const char of title.trim()) {
    width += FULL_WIDTH_CHAR_PATTERN.test(char) ? 1 : 0.55
  }
  return width
}

/**
 * 标题字号档位：字少用大字号单行展示（占满标题行预留的两行高度），
 * 字多则缩小字号并压到最多两行，超出部分省略。
 */
export function titleSizeClass(title: string): string {
  return titleEmWidth(title) > 12 ? 'is-long' : ''
}

export function formatUpdatedAt(value: string): string[] {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ['最近更新']
  }

  return [
    date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
  ]
}
