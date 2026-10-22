import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { MockRoute } from '../../router'

import {
  DEV_USERNAME,
  createResourceRecord,
  createVersionRecord,
  mcResourceVersions,
  mcResources,
  versionsOf,
} from '../../db'
import { jsonResponse, noContentResponse, textResponse } from '../../response'
import { myResources, nowIso } from './helpers'

export const devResourceRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 开发者侧 */
  {
    method: 'GET',
    path: '/dev/resources/resources',
    note: '我的资源列表',
    handler: () => jsonResponse(myResources()),
  },
  {
    method: 'POST',
    path: '/dev/resources/resources',
    note: '发布资源',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        title?: string
        author?: string
        description?: string
        platform?: string
        file_name?: string
        source_url?: string
        requirement_id?: string | null
        visibility?: McResourcePayload['visibility']
        price_fen?: number
        price_points?: number
        copyright_declared?: boolean
        /** R029：推广分成比例（万分比） */
        promo_share_bps?: number
      }

      const created = createResourceRecord({
        title: body.title?.trim() || '未命名资源',
        author: body.author?.trim() || DEV_USERNAME,
        description: body.description?.trim() || '',
        platform: body.platform?.trim() || '自研工具',
        file_name: body.file_name?.trim() || 'resource.zip',
        source_url: body.source_url ?? '',
        requirement_id: body.requirement_id ?? null,
        visibility: body.visibility ?? 'review',
        promo_share_bps: body.promo_share_bps ?? 0,
      })
      created.price_fen = body.price_fen ?? 0
      created.price_points = body.price_points ?? 0
      created.copyright_declared = Boolean(body.copyright_declared)
      if (created.copyright_declared) {
        created.copyright_declared_at = nowIso()
      }
      return jsonResponse(created)
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/resources/team',
    note: '团队资源（演示数据里没有团队资源）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/dev/resources/resources/:resourceId',
    note: '资源详情',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource ? jsonResponse(resource) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'PATCH',
    path: '/dev/resources/resources/:resourceId',
    note: '更新资源主页',
    handler: (request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      if (!resource) {
        return textResponse('资源不存在', 404)
      }

      const body = (request.body ?? {}) as Partial<McResourcePayload>
      Object.assign(resource, {
        ...body,
        tag_selections: body.tag_selections ?? resource.tag_selections,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ''),
      })

      return jsonResponse(resource)
    },
  },
  {
    method: 'DELETE',
    path: '/dev/resources/resources/:resourceId',
    note: '删除资源',
    handler: (_request, params) => {
      const index = mcResources.findIndex((item) => String(item.id) === params.resourceId)
      if (index >= 0) {
        mcResources.splice(index, 1)
      }

      return noContentResponse()
    },
  },
  {
    method: 'POST',
    path: '/dev/resources/resources/:resourceId/cover',
    note: '上传资源封面（mock 不存文件，回显现有资源）',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource ? jsonResponse(resource) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/resources/:resourceId/versions',
    note: '版本列表',
    handler: (_request, params) =>
      jsonResponse(versionsOf(Number(params.resourceId)) as McResourceVersionPayload[]),
  },
  {
    method: 'POST',
    path: '/dev/resources/resources/:resourceId/versions',
    note: '发布新版本（multipart：version / note / file）',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { version?: string; note?: string }
      const record = createVersionRecord(
        Number(params.resourceId),
        body.version?.trim() || 'v1.0.0',
        body.note?.trim() || null,
      )

      return record ? jsonResponse(record) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'PATCH',
    path: '/dev/resources/resources/:resourceId/versions/:versionId',
    note: '更新版本',
    handler: (request, params) => {
      const record = mcResourceVersions.find((item) => String(item.id) === params.versionId)
      if (!record) {
        return textResponse('版本不存在', 404)
      }

      const body = (request.body ?? {}) as { version?: string; note?: string }
      record.version = body.version?.trim() || record.version
      record.note = body.note?.trim() || record.note

      return jsonResponse(record)
    },
  },
  {
    method: 'DELETE',
    path: '/dev/resources/resources/:resourceId/versions/:versionId',
    note: '删除版本',
    handler: (_request, params) => {
      const index = mcResourceVersions.findIndex((item) => String(item.id) === params.versionId)
      if (index >= 0) {
        mcResourceVersions.splice(index, 1)
      }

      return noContentResponse()
    },
  },
]
