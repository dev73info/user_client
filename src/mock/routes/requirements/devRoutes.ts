import type { MockRoute } from '../../router'

import { bindRequirementRecord, devWallet, requirements, settledIncome } from '../../db'
import { jsonResponse, readInt } from '../../response'
import { applyHallQuery, devRequirements, hallRequirements } from './helpers'

export const devRequirementRoutes: MockRoute[] = [
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
