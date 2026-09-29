/**
 * 需求单：客户侧（我的需求、发布、取消、评论）与开发者侧（需求大厅、接单、我的接单）。
 *
 * 两侧读的是 `db.ts` 里的同一份数据，只是过滤条件不同：
 * 客户按 `creator` 过滤，开发者按 `developer` 过滤，需求大厅则是「还没人接的公开需求」。
 */

import type { RequirementItem, RequirementOverviewResp } from '@/api/requirements'

import {
  CLIENT_USERNAME,
  DEV_USERNAME,
  bindRequirementRecord,
  createRequirementRecord,
  devWallet,
  findRequirement,
  requirements,
  seedOfRequirement,
  settledIncome,
} from '../db'
import { defineRouteTable, type MockRequest, type MockRoute } from '../router'
import { jsonResponse, noContentResponse, readInt, readString } from '../response'

/** 未接单、已过审核（待付定金）的需求才会出现在开发者需求大厅。 */
function hallRequirements(): RequirementItem[] {
  return requirements.filter(
    (item) => !item.developer && item.status === 'pending_deposit',
  )
}

function clientRequirements(): RequirementItem[] {
  return requirements.filter((item) => item.creator === CLIENT_USERNAME)
}

function devRequirements(): RequirementItem[] {
  return requirements.filter((item) => item.developer === DEV_USERNAME)
}

function applyHallQuery(items: RequirementItem[], query: URLSearchParams): RequirementItem[] {
  const keyword = readString(query, 'keyword').toLowerCase()
  const creator = readString(query, 'creator')
  const sortBy = readString(query, 'sort_by') || 'updated_at'
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
  const valueOf = (item: RequirementItem): number | string => {
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

function toSpotlightItem(item: RequirementItem) {
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

/** 概览口径：需求方看到的是「我发过多少单、成交多少」，与门户公开口径分开算。 */
function buildOverview(items: RequirementItem[]): RequirementOverviewResp {
  const turnOver = items.reduce((total, item) => {
    if (item.status !== 'completed') {
      return total
    }
    return total + (item.budget ?? 0)
  }, 0)
  const completed = items.filter((item) => item.status === 'completed').length

  return {
    developer_count: new Set(items.map((item) => item.developer).filter(Boolean)).size,
    total_orders: items.length,
    total_orders_change_rate: 12.5,
    positive_rate: 98.2,
    positive_rate_change_rate: 1.2,
    total_turnover_cny: turnOver,
    total_turnover_change_rate: 8.4,
    recent_deals: settledIncome.slice(0, 4).map((income) => ({
      payment_id: income.payment_id,
      requirement_id: income.requirement_id,
      title: income.title,
      amount_cny: income.amount_cny,
      paid_at: income.paid_at,
      comment_rating: 5,
      comment_text: '交付准时，沟通顺畅。',
      commented_at: income.paid_at,
    })),
  }
}

/** 解绑申请的演示数据：客户侧的待处理申请与开发者侧的发起记录共用一份。 */
function unbindRecord(request: MockRequest, code: string, initiator: 'creator' | 'developer') {
  return {
    requirement_id: code,
    status: 'pending' as const,
    developer: DEV_USERNAME,
    initiator,
    reason: readString(request.query, 'reason') || '演示数据：工期与预期不一致，协商解除。',
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    responded_by: null,
    responded_at: null,
    response_note: null,
  }
}

const routes: MockRoute[] = [
  /* ---------------------------------------------------------------- 客户侧 */
  {
    method: 'GET',
    path: '/requirements/mine',
    note: '我的需求（需求方视角）',
    handler: () => jsonResponse(clientRequirements()),
  },
  {
    method: 'GET',
    path: '/requirements/overview',
    note: '需求方概览',
    handler: () => jsonResponse(buildOverview(clientRequirements())),
  },
  {
    method: 'GET',
    path: '/public/requirements/public-overview',
    note: '门户公开概览（未登录也能看）',
    handler: () => jsonResponse(buildOverview(requirements)),
  },
  {
    method: 'GET',
    path: '/public/requirements/public-spotlight',
    note: '门户精选需求列表',
    handler: (request) => {
      const page = readInt(request.query, 'page', 1)
      const pageSize = readInt(request.query, 'page_size', 20)
      const visible = requirements.filter((item) => item.status !== 'cancelled')
      const start = Math.max(page - 1, 0) * pageSize

      return jsonResponse({
        total: visible.length,
        page,
        page_size: pageSize,
        items: visible.slice(start, start + pageSize).map(toSpotlightItem),
      })
    },
  },
  {
    method: 'POST',
    path: '/requirements/',
    note: '发布需求（进入平台审核）',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        title?: string
        description?: string
        budget?: number
        acceptance_criteria?: string
        payment_mode?: 'platform_guarantee' | 'self_managed'
      }

      createRequirementRecord({
        title: body.title?.trim() || '未命名需求',
        description: body.description?.trim() || '',
        budget: Number(body.budget) || 0,
        acceptance_criteria: body.acceptance_criteria?.trim() || '',
        payment_mode: body.payment_mode === 'self_managed' ? 'self_managed' : 'platform_guarantee',
      })

      return noContentResponse()
    },
  },
  {
    method: 'POST',
    path: '/requirements/:id/comment',
    note: '需求方评价',
    handler: () => jsonResponse({ ok: true }),
  },
  {
    method: 'DELETE',
    path: '/requirements/:id/cancel',
    note: '取消需求',
    handler: (_request, params) => {
      const requirement = findRequirement(params.id ?? '')
      if (!requirement) {
        return jsonResponse({ message: '需求不存在' }, 404)
      }

      requirement.status = 'cancelled'
      requirement.updated_at = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const seed = seedOfRequirement(requirement.requirement_id)
      if (seed) {
        seed.status = 'cancelled'
      }

      return noContentResponse()
    },
  },
  {
    method: 'PATCH',
    path: '/requirements/:id/resubmit',
    note: '驳回后重新提交审核',
    handler: (request, params) => {
      const requirement = findRequirement(params.id ?? '')
      if (!requirement) {
        return jsonResponse({ message: '需求不存在' }, 404)
      }

      const body = (request.body ?? {}) as {
        title?: string
        description?: string
        budget?: number
        acceptance_criteria?: string
      }

      requirement.title = body.title?.trim() || requirement.title
      requirement.description = body.description?.trim() || requirement.description
      requirement.acceptance_criteria = body.acceptance_criteria?.trim() || requirement.acceptance_criteria
      requirement.budget = Number(body.budget) || requirement.budget
      requirement.status = 'pending_review'
      requirement.review_note = null

      const seed = seedOfRequirement(requirement.requirement_id)
      if (seed) {
        seed.status = 'pending_review'
      }

      return noContentResponse()
    },
  },
  {
    method: 'PATCH',
    path: '/requirements/:id/subscription',
    note: '订阅需求状态变更',
    handler: (request, params) => {
      const requirement = findRequirement(params.id ?? '')
      const body = (request.body ?? {}) as { subscribe_status_change?: boolean }
      if (requirement) {
        requirement.subscribe_status_change = body.subscribe_status_change === true
      }

      return noContentResponse()
    },
  },
  {
    method: 'PATCH',
    path: '/requirements/:id/resource-visibility',
    note: '调整绑定资源的可见性',
    handler: (request, params) => {
      const requirement = findRequirement(params.id ?? '')
      const body = (request.body ?? {}) as { visibility?: 'public' | 'private' }
      if (requirement) {
        requirement.resource_visibility = body.visibility === 'private' ? 'private' : 'public'
      }

      return noContentResponse()
    },
  },
  {
    method: 'POST',
    path: '/requirements/:id/resource-delete-review',
    note: '审核开发者提交的资源版本删除申请',
    handler: (_request, params) => {
      const requirement = findRequirement(params.id ?? '')
      return jsonResponse(requirement ?? { message: '需求不存在' })
    },
  },
  {
    method: 'POST',
    path: '/requirements/:id/unbind-request',
    note: '需求方发起解除绑定申请',
    handler: (request, params) =>
      jsonResponse({
        ...unbindRecord(request, params.id ?? '', 'creator'),
        status: 'pending',
      }),
  },
  {
    method: 'POST',
    path: '/requirements/:id/unbind-response',
    note: '需求方响应解除申请',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { action?: 'approve' | 'reject' }

      return jsonResponse({
        ...unbindRecord(request, params.id ?? '', 'developer'),
        status: body.action === 'approve' ? 'approved' : 'rejected',
        responded_by: CLIENT_USERNAME,
        responded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        response_note: null,
      })
    },
  },

  /* ---------------------------------------------------------------- 开发者侧 */
  {
    method: 'GET',
    path: '/dev/requirements/hall/query',
    note: '需求大厅（可接取的需求分页）',
    handler: (request) => {
      const page = readInt(request.query, 'page', 1)
      const pageSize = readInt(request.query, 'page_size', 20)
      const filtered = applyHallQuery(hallRequirements(), request.query)
      const start = Math.max(page - 1, 0) * pageSize

      return jsonResponse({
        total: filtered.length,
        page,
        page_size: pageSize,
        items: filtered.slice(start, start + pageSize),
      })
    },
  },
  {
    method: 'GET',
    path: '/dev/requirements/mine',
    note: '我的接单',
    handler: () => jsonResponse(devRequirements()),
  },
  {
    method: 'GET',
    path: '/dev/requirements/wallet/overview',
    note: '开发者钱包总览',
    handler: () => jsonResponse({ ...devWallet, recent_income: settledIncome }),
  },
  {
    method: 'POST',
    path: '/dev/requirements/:id/bind-project',
    note: '开发者接单：绑定资源项目',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { resource_id?: number }
      const requirement = bindRequirementRecord(params.id ?? '', Number(body.resource_id) || 0)

      if (!requirement) {
        return jsonResponse({ message: '需求不存在或已被接取' }, 404)
      }

      return jsonResponse(requirement)
    },
  },
  {
    method: 'POST',
    path: '/dev/requirements/:id/unbind-request',
    note: '开发者发起解除绑定申请',
    handler: (request, params) =>
      jsonResponse({
        ...unbindRecord(request, params.id ?? '', 'developer'),
        status: 'pending',
      }),
  },
  {
    method: 'POST',
    path: '/dev/requirements/:id/unbind-response',
    note: '开发者响应解除申请',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { action?: 'approve' | 'reject' }

      return jsonResponse({
        ...unbindRecord(request, params.id ?? '', 'creator'),
        status: body.action === 'approve' ? 'approved' : 'rejected',
        responded_by: DEV_USERNAME,
        responded_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        response_note: null,
      })
    },
  },
]

export const requirementRoutes = defineRouteTable('requirements', routes)
