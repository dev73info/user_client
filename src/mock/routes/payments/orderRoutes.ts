import type { MockRoute } from '../../router'

import { DEV_USERNAME, findRequirement, payments } from '../../db'
import { jsonResponse, readString, textResponse } from '../../response'
import { CONFIRM_HTML, confirm, createPayload, ensurePayment } from './helpers'

export const paymentOrderRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/payments/orders',
    note: '我的支付单（只给列表用，字段与后端一致）',
    handler: (request) => {
      const visible = payments.filter((item) => {
        const requirement = findRequirement(item.requirement_id)
        if (!requirement) {
          return false
        }
        return request.identity === 'dev' ? requirement.developer === DEV_USERNAME : true
      })

      return jsonResponse(
        visible.map((item) => ({ payment_id: item.payment_id, status: item.status })),
      )
    },
  },
  {
    method: 'POST',
    path: '/payments/alipay/create',
    note: '支付宝下单',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string; amount_cny?: number }
      const record = ensurePayment(
        body.requirement_id ?? '',
        Number(body.amount_cny) || 0,
        'alipay',
      )

      return jsonResponse(createPayload(record, 'alipay'))
    },
  },
  {
    method: 'POST',
    path: '/payments/wechat/create',
    note: '微信下单',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string; amount_cny?: number }
      const record = ensurePayment(
        body.requirement_id ?? '',
        Number(body.amount_cny) || 0,
        'wechat',
      )

      return jsonResponse(createPayload(record, 'wechat'))
    },
  },
  {
    method: 'POST',
    path: '/payments/alipay/page',
    note: '支付宝页面支付单（带 page_html）',
    handler: (request) => {
      const body = (request.body ?? {}) as { requirement_id?: string; amount_cny?: number }
      const record = ensurePayment(
        body.requirement_id ?? '',
        Number(body.amount_cny) || 0,
        'alipay',
      )

      return jsonResponse({ ...createPayload(record, 'alipay'), page_html: CONFIRM_HTML })
    },
  },
  {
    method: 'GET',
    path: '/payments/alipay/page',
    note: '支付宝页面支付单的 HTML（前端直读文本）',
    handler: () => textResponse(CONFIRM_HTML),
  },
  {
    method: 'POST',
    path: '/payments/alipay/confirm',
    note: '确认支付宝支付：直接置为已支付并推进需求状态',
    handler: (request) => {
      const body = (request.body ?? {}) as { payment_id?: string }
      const record = payments.find((item) => item.payment_id === body.payment_id)
      const requirementId = record?.requirement_id ?? readString(request.query, 'requirement_id')

      return jsonResponse(confirm(requirementId))
    },
  },
  {
    method: 'POST',
    path: '/payments/wechat/confirm',
    note: '确认微信支付',
    handler: (request) => {
      const body = (request.body ?? {}) as { payment_id?: string }
      const record = payments.find((item) => item.payment_id === body.payment_id)
      const requirementId = record?.requirement_id ?? readString(request.query, 'requirement_id')

      return jsonResponse(confirm(requirementId))
    },
  },
]
