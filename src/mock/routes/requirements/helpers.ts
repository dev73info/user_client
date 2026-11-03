import type { RequirementItem, RequirementOverviewResp } from '@/api/requirements'
import type { MockRequirementRow } from '@/mock/db/requirements'
import { CLIENT_USERNAME, DEV_USERNAME, requirements } from '../../db'
import { datetime } from '../../db/shared'
import { readString } from '../../response'

/** 未接单、已过审核（待付定金）的需求才会出现在开发者需求大厅。 */
export function hallRequirements(): MockRequirementRow[] {
  return requirements.filter((item) => !item.developer && item.status === 'pending_deposit')
}

export function clientRequirements(): MockRequirementRow[] {
  return requirements.filter((item) => item.creator === CLIENT_USERNAME)
}

export function devRequirements(): MockRequirementRow[] {
  return requirements.filter((item) => item.developer === DEV_USERNAME)
}

export function applyHallQuery(
  items: MockRequirementRow[],
  query: URLSearchParams,
): MockRequirementRow[] {
  const keyword = readString(query, 'keyword').toLowerCase()
  const creator = readString(query, 'creator')
  const sortBy = readString(query, 'sort_by') || 'created_time'
  const sortOrder = readString(query, 'sort_order') || 'desc'

  let list = items

  if (keyword) {
    list = list.filter(
      (item) =>
        item.requirement_id.toLowerCase().includes(keyword) ||
        item.title.toLowerCase().includes(keyword) ||
        (item.description ?? '').toLowerCase().includes(keyword),
    )
  }

  if (creator) {
    list = list.filter((item) => item.creator === creator)
  }

  const direction = sortOrder === 'asc' ? 1 : -1
  const valueOf = (item: MockRequirementRow): number | string => {
    if (sortBy === 'budget') {
      return item.budget ?? 0
    }
    if (sortBy === 'created_time') {
      return item.created_time ?? ''
    }
    return item.updated_at
  }

  return [...list].sort((left, right) => {
    const leftValue = valueOf(left)
    const rightValue = valueOf(right)
    if (leftValue === rightValue) {
      return 0
    }
    return leftValue > rightValue ? direction : -direction
  })
}

export function toSpotlightItem(item: MockRequirementRow) {
  return {
    requirement_id: item.requirement_id,
    creator: item.creator,
    title: item.title,
    description: item.description ?? null,
    acceptance_criteria: item.acceptance_criteria ?? null,
    budget: item.budget ?? null,
    payment_mode: item.payment_mode,
    status: item.status,
    created_at: item.created_time ?? '',
    updated_at: item.updated_at,
  }
}

/** 大厅侧栏固定展示 10 条 mock 交付记录，保证分页与右侧栏在同一屏内可验收。 */
const MOCK_RECENT_DEAL_LIMIT = 10
const MOCK_RECENT_DEAL_AMOUNTS = [128, 86, 320, 45, 168, 72, 240, 36, 98, 54]

function buildRecentDeals() {
  return requirements.slice(0, MOCK_RECENT_DEAL_LIMIT).map((item, index) => {
    const paidAt = datetime(-index, 9 + ((index * 3) % 9), (index * 7) % 60)
    const rated = index % 4 !== 3

    return {
      payment_id: `PAY-MOCK-RECENT-${index + 1}`,
      requirement_id: item.requirement_id,
      title: item.title,
      amount_cny: MOCK_RECENT_DEAL_AMOUNTS[index] ?? 0,
      paid_at: paidAt,
      comment_rating: rated ? [5, 4.5, 4][index % 3] : null,
      comment_text: rated ? '交付准时，沟通顺畅。' : null,
      commented_at: rated ? paidAt : null,
    }
  })
}

/** 概览口径：需求方看到的是「我发过多少单、成交多少」，与门户公开口径分开算。 */
export function buildOverview(items: MockRequirementRow[]): RequirementOverviewResp {
  const turnOver = items.reduce((total, item) => {
    if (item.status !== 'completed') {
      return total
    }
    return total + (item.budget ?? 0)
  }, 0)

  return {
    developer_count: new Set(items.map((item) => item.developer).filter(Boolean)).size,
    total_orders: items.length,
    total_orders_change_rate: 12.5,
    positive_rate: 98.2,
    positive_rate_change_rate: 1.2,
    total_turnover_cny: turnOver,
    total_turnover_change_rate: 8.4,
    recent_deals: buildRecentDeals(),
  }
}
