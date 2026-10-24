import type { MockRoute } from '../../router'

import { errorResponse, jsonResponse, noContentResponse, readInt } from '../../response'
import { parseMockToken } from '../../token'
import {
  CLIENT_NICKNAME,
  CLIENT_USERNAME,
  createRequirementRecord,
  datetime,
  findRequirement,
  mcResourceVersions,
  mcResources,
  requirements,
  seedOfRequirement,
  versionsOf,
} from '../../db'
import { buildOverview, clientRequirements, toSpotlightItem } from './helpers'

export const clientRequirementRoutes: MockRoute[] = [
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
      requirement.acceptance_criteria =
        body.acceptance_criteria?.trim() || requirement.acceptance_criteria
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
          requirement.bound_resource_version_count = versionsOf(
            requirement.bound_resource_id,
          ).length
        }
      } else {
        requirement.resource_version_delete_request_status = 'rejected'
        requirement.resource_version_delete_review_note =
          body.note?.trim() || '演示数据：暂不删除该版本'
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
        return errorResponse(404, '需求不存在')
      }
      const username = parseMockToken(request.token)?.username ?? ''
      if (username !== requirement.creator) {
        return errorResponse(403, '无权执行该操作')
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
]
