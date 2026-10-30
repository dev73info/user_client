import type { MockRoute } from '../../router'

import { bindRequirementRecord, devWallet, requirements, settledIncome } from '../../db'
import { jsonResponse } from '../../response'
import { applyHallQuery, devRequirements, hallRequirements } from './helpers'

export const devRequirementRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 开发者侧 */
  {
    method: 'GET',
    path: '/dev/requirements/hall/query',
    note: '需求大厅：契约是不带查询参数、一次回全量数组；排序与分页在前端做',
    handler: (request) =>
      // 这里原本回的是 `{total, page, page_size, items}` 的分页对象，
      // 而 `listRequirementHall` 按契约读的是裸数组，`payload.filter` 一调就抛，
      // 于是大厅永远显示「没有可接的待关联需求」。形状按前端实际消费的那一种给。
      jsonResponse(applyHallQuery(hallRequirements(), request.query)),
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
