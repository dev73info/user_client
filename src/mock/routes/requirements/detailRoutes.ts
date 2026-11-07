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

/** 费用快照：自管模式没有费率（404），担保模式按预算给一份与后端同口径的整数分快照。 */
function feeTermsOf(requirement: ReturnType<typeof findRequirement>) {
  if (!requirement || requirement.payment_mode !== 'platform_guarantee') {
    return null
  }
  const platformFeeBps = 500
  const taxBps = 0
  const depositRatioBps = 1000
  const totalFen = Math.round((requirement.budget ?? 0) * 100)
  const platformFeeFen = Math.trunc((totalFen * platformFeeBps) / 10_000)
  const taxFen = Math.trunc((totalFen * taxBps) / 10_000)
  const depositFen = Math.trunc((totalFen * depositRatioBps) / 10_000)
  const depositPlatformFeeFen = Math.trunc((depositFen * platformFeeBps) / 10_000)
  const finalFen = totalFen - depositFen
  const finalPlatformFeeFen = platformFeeFen - depositPlatformFeeFen
  return {
    requirement_id: requirement.requirement_id,
    platform_fee_bps: platformFeeBps,
    personal_income_tax_bps: taxBps,
    total_fen: totalFen,
    deposit_fen: depositFen,
    deposit_ratio_bps: depositRatioBps,
    platform_fee_fen: platformFeeFen,
    tax_fen: taxFen,
    developer_net_fen: totalFen - platformFeeFen - taxFen,
    deposit_platform_fee_fen: depositPlatformFeeFen,
    deposit_tax_fen: 0,
    deposit_developer_net_fen: depositFen - depositPlatformFeeFen,
    final_platform_fee_fen: finalPlatformFeeFen,
    final_tax_fen: taxFen,
    final_developer_net_fen: finalFen - finalPlatformFeeFen - taxFen,
    customer_breach_platform_fee_bps: 2000,
    customer_breach_tax_bps: 0,
    snapshot_at: '2026-11-08 10:00:00',
  }
}

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
    path: '/requirement/:id/fee-terms',
    note: '需求单费率快照：自管模式 404，担保模式给整数分快照',
    handler: (_request, params) => {
      const requirement = findRequirement(params.id ?? '')
      if (!requirement) {
        return errorResponse(404, '需求不存在或无权访问')
      }
      const terms = feeTermsOf(requirement)
      return terms ? jsonResponse(terms) : errorResponse(404, '该需求没有费率快照')
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
