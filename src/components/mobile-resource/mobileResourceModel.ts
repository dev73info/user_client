import { apiUrl } from '@/api/http'
import type { PublicMcResourceItem } from '@/api/resources'
import type { McTagFilterSection } from '@/api/resourceTags'
import { formatResourcePriceLabel } from '@/shared/resourceSale'
import { parseBackendDateTime } from '@/shared/datetime'

/**
 * 移动端资源列表的数据形状与映射。
 *
 * 卡片视图（`MobileResourceCardItem`）、筛选抽屉（`MobileResourceFilterDrawer`）与列表本身
 * 共用这几个类型，从 `MobileResourceList.vue` 收拢到这里，免得三处各写一份。
 * `mapResourceToCard` 把接口资源压成卡片要用的扁平结构（价格文案、封面地址、标签文本一次算好），
 * `formatUpdatedAt` 把更新时间压成「月/日」，解析失败按「最近」显示。
 */
export type MobileCard = {
  id: number
  title: string
  desc: string
  likeCount: number
  author: string
  ownerName: string
  updatedAt: string
  img: string | null
  groupTags: Record<string, string[]>
  tagsText: string
  originType: 'original' | 'repost'
  priceFen: number
  pricePoints: number
  priceLabel: string
}

export type SectionView = McTagFilterSection & {
  selected: string[]
}

export type RootOption = {
  key: string
  label: string
  firstEntryKey: string | null
}

export type EntryOption = {
  key: string
  label: string
}

export function mapResourceToCard(item: PublicMcResourceItem): MobileCard {
  const groupTags = Object.fromEntries(
    item.tag_selections.map((entry) => [entry.group_name, entry.tag_names]),
  )

  const priceFen = item.price_fen ?? 0
  const pricePoints = item.price_points ?? 0
  return {
    id: item.id,
    title: item.title,
    desc: item.description || '暂无描述',
    likeCount: item.like_count ?? 0,
    author: item.author || item.creator,
    ownerName: item.creator.trim() || item.author.trim() || item.title,
    updatedAt: item.updated_at,
    img: item.cover_url ? apiUrl(item.cover_url) : null,
    groupTags,
    tagsText: item.tag_selections.flatMap((entry) => entry.tag_names).join(' '),
    originType: item.origin_type,
    priceFen,
    pricePoints,
    priceLabel: formatResourcePriceLabel(priceFen, pricePoints),
  }
}

export function formatUpdatedAt(value: string): string {
  // 后端时间是东八区墙钟串、不带偏移，解析口径见 shared/datetime.ts。
  const date = parseBackendDateTime(value)
  if (!date) {
    return '最近'
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}
