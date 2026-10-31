/**
 * 需求单详情与它在争议域的摘要。
 *
 * 这两条本来缺着，`GET /api/requirement/{id}` 落到 mock 的兜底 `[]` 上，会话页与会话弹窗
 * 都把它当「需求不存在或无权访问」，打开会话就弹红条、消息区空白。
 *
 * 单独一个文件而不是塞回 `clientRoutes`：那边已经贴着 300 行的模块上限，
 * 详情属于「谁都能读」的一条，跟客户侧的发布 / 取消 / 互评不是同一类操作。
 */

import type { MockRoute } from '../../router'

import { findRequirement } from '../../db'
import { errorResponse, jsonResponse } from '../../response'

export const requirementDetailRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/requirements/:id',
    note: '需求详情：会话页与会话弹窗都读它',
    handler: (_request, params) => {
      const requirement = findRequirement(params.id ?? '')

      return requirement ? jsonResponse(requirement) : errorResponse(404, '需求不存在或无权访问')
    },
  },
  {
    method: 'GET',
    path: '/requirement/:id/breach-case',
    note: '需求上的案件摘要：演示数据一律「没有案件」，页面据此不显示调解入口',
    handler: (_request, params) => {
      const requirement = findRequirement(params.id ?? '')

      // 契约明说「没有案件也回 200 + has_case:false」，不是 404——
      // 前端拿 404 会当成加载失败，而不是「这个需求没有争议」。
      return requirement
        ? jsonResponse({ requirement_id: requirement.requirement_id, has_case: false, case: null })
        : errorResponse(404, '需求不存在')
    },
  },
]
