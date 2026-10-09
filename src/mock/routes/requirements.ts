/**
 * 需求单：客户侧（我的需求、发布、取消、评论）与开发者侧（需求大厅、接单、我的接单）。
 *
 * 两侧读的是 `db.ts` 里的同一份数据，只是过滤条件不同：
 * 客户按 `creator` 过滤，开发者按 `developer` 过滤，需求大厅则是「还没人接的公开需求」。
 */

import type { RequirementItem, RequirementOverviewResp } from '@/api/requirements'

import {
  CLIENT_NICKNAME,
  CLIENT_USERNAME,
  DEV_USERNAME,
  bindRequirementRecord,
  createRequirementRecord,
  datetime,
  devWallet,
  findRequirement,
  mcResourceVersions,
  mcResources,
  requirements,
  seedOfRequirement,
  settledIncome,
  versionsOf,
} from '../db'
import { defineRouteTable, type MockRequest, type MockRoute } from '../router'
import { errorResponse, jsonResponse, noContentResponse, readInt, readString } from '../response'
import { parseMockToken } from '../token'

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
    note: '需求方 / 开发者互评（按操作者与 creator 是否一致写两侧字段）',
    handler: (request, params) => {
      const requirement = findRequirement(params.id ?? '')
      if (!requirement) {
        return jsonResponse({ message: '需求不存在' }, 404)
      }

      const body = (request.body ?? {}) as { rating?: number; comment?: string }
      const rating = Number(body.rating)
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return jsonResponse({ message: '评分无效' }, 400)
      }

      const text = body.comment?.trim() || null
      const now = datetime(0, 16, 0)
      const username = parseMockToken(request.token)?.username ?? ''

      if (username === requirement.creator) {
        requirement.comment_rating = rating
        requirement.comment_text = text
        requirement.commented_at = now
      } else {
        requirement.developer_comment_rating = rating
        requirement.developer_comment_text = text
        requirement.developer_commented_at = now
      }
      requirement.updated_at = now

      return noContentResponse()
    },
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
    note: '审核开发者提交的资源版本删除申请：同意则删版本并同步版本数，拒绝则记下理由',
    handler: (request, params) => {
      const requirement = findRequirement(params.id ?? '')
      if (!requirement) {
        return jsonResponse({ message: '需求不存在' }, 404)
      }

      const body = (request.body ?? {}) as {
        version_id?: number
        action?: 'approve' | 'reject'
        note?: string
      }
      const versionId = Number(body.version_id)
      const pending = requirement.pending_resource_version_delete_requests ?? []

      requirement.pending_resource_version_delete_requests = pending.filter(
        (item) => item.version_id !== versionId,
      )
      requirement.resource_version_delete_reviewed_at = datetime(0, 16, 0)
      requirement.updated_at = datetime(0, 16, 0)

      if (body.action === 'approve') {
        requirement.resource_version_delete_request_status = null
        requirement.resource_version_delete_review_note = null

        const index = mcResourceVersions.findIndex((item) => item.id === versionId)
        if (index >= 0) {
          mcResourceVersions.splice(index, 1)
        }
        if (requirement.bound_resource_id != null) {
          requirement.bound_resource_version_count = versionsOf(requirement.bound_resource_id).length
        }
      } else {
        requirement.resource_version_delete_request_status = 'rejected'
        requirement.resource_version_delete_review_note = body.note?.trim() || '演示数据：暂不删除该版本'
      }

      return jsonResponse(requirement)
    },
  },
  {
    method: 'POST',
    path: '/requirements/:id/claim-resource',
    note: '把交付资源转为需求方自己的资源：资源换主、需求记下转换时间；前置与后端一致（已结单 / 有交付资源 / 未转换）',
    handler: (request, params) => {
      const requirement = findRequirement(params.id ?? '')
      if (!requirement) {
        return errorResponse(404, 'requirement not found')
      }
      const username = parseMockToken(request.token)?.username ?? ''
      if (username !== requirement.creator) {
        return errorResponse(403, 'forbidden')
      }
      if (requirement.status !== 'completed') {
        return errorResponse(409, '需求尚未结单，暂不能转为我的资源')
      }
      if (requirement.resource_claimed_at) {
        return errorResponse(409, '该交付资源已转为需求方资源')
      }
      if (requirement.bound_resource_id == null) {
        return errorResponse(409, '该需求没有交付资源，无法转换')
      }

      const resource = mcResources.find((item) => item.id === requirement.bound_resource_id)
      if (resource?.ownership_type === 'team') {
        return errorResponse(409, '团队资源暂不支持转换')
      }
      if (resource) {
        resource.creator = CLIENT_USERNAME
        resource.author = CLIENT_NICKNAME
      }

      const now = datetime(0, 16, 0)
      requirement.resource_claimed_at = now
      requirement.bound_resource_author = CLIENT_USERNAME
      requirement.updated_at = now
      // 开发者一栏保持原开发者：他的接单记录不丢。

      return jsonResponse(requirement)
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
]

export const requirementRoutes = defineRouteTable('requirements', routes)
