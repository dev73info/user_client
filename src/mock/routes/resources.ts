/**
 * 资源：开发者侧的「我的资源 / 版本管理」与门户公开的资源市场。
 *
 * 公开列表用的是同一批资源，只挑 `published` 的；下载接口返回一段占位内容，
 * 前端读流、写进度、触发保存这条链能完整跑一遍，不会卡在空的响应体上。
 */

import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'

import {
  DEV_USERNAME,
  createResourceRecord,
  createVersionRecord,
  mcResources,
  mcResourceVersions,
  versionsOf,
} from '../db'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, noContentResponse, textResponse } from '../response'

function myResources(): McResourcePayload[] {
  return mcResources.filter((item) => item.creator === DEV_USERNAME)
}

function publishedResources(): McResourcePayload[] {
  return mcResources.filter((item) => item.visibility === 'published')
}

/** 公开资源多带几个门户卡片要用的字段（与后端的 public 视图对齐）。 */
function toPublicResource(resource: McResourcePayload) {
  const withFeatured = resource as McResourcePayload & {
    is_featured?: boolean
    like_count?: number
  }
  return {
    ...resource,
    versions: versionsOf(resource.id).length,
    download_count: 12,
    like_count: withFeatured.like_count ?? 0,
    is_featured: Boolean(withFeatured.is_featured),
    updated_at: resource.updated_at,
  }
}

const MOCK_PACKAGE_CONTENT = 'mock resource package\n'.repeat(200)

function downloadResponse(fileName: string): Response {
  return new Response(MOCK_PACKAGE_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(new Blob([MOCK_PACKAGE_CONTENT]).size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

const routes: MockRoute[] = [
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
      }

      return jsonResponse(
        createResourceRecord({
          title: body.title?.trim() || '未命名资源',
          author: body.author?.trim() || DEV_USERNAME,
          description: body.description?.trim() || '',
          platform: body.platform?.trim() || '自研工具',
          file_name: body.file_name?.trim() || 'resource.zip',
          source_url: body.source_url ?? '',
          requirement_id: body.requirement_id ?? null,
          visibility: body.visibility ?? 'review',
        }),
      )
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

  /* ---------------------------------------------------------------- 门户公开 */
  {
    method: 'GET',
    path: '/resource/resources',
    note: '门户资源市场列表（已公开的资源）',
    handler: () => jsonResponse(publishedResources().map(toPublicResource)),
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId',
    note: '门户资源详情',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource ? jsonResponse(toPublicResource(resource)) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId/versions',
    note: '门户资源的版本列表',
    handler: (_request, params) => jsonResponse(versionsOf(Number(params.resourceId))),
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId/versions/:versionId/download',
    note: '下载资源版本：返回一段占位内容，前端的下载进度与保存链路能完整跑通',
    handler: (_request, params) =>
      downloadResponse(`resource-${params.resourceId ?? '0'}-${params.versionId ?? '0'}.zip`),
  },
  {
    method: 'GET',
    path: '/resources/tags',
    note: '资源标签分组原始数据：mock 返回空数组，标签树会是空的（不做假标签，避免与 wasm 的解析口径打架）',
    handler: () => jsonResponse([]),
  },
]

export const resourceRoutes = defineRouteTable('resources', routes)
