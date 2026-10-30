/**
 * 打赏（`/api/tips/**`）的假路由。
 *
 * 之前这一族完全没实现，`GET /tips/settings` 落到兜底的 `[]`：
 * `fillForm` 读一个数组的 `enabled` / `cash_tiers_fen`，读出来全是 `undefined`，
 * 「打赏设置」页于是把一整套表单渲染成空档位、空上下限、空感谢语——
 * 页面不报错，但改什么都存不下，看起来像保存功能坏了。
 *
 * 金额一律**整数分**；契约没有积分档位、没有分通道开关、没有手续费，这里也不编。
 */

import type { components } from '@/api/generated/schema'

import type { MockRoute } from '../../router'
import { DEV_USERNAME, datetime } from '../../db/shared'
import { jsonResponse } from '../../response'

type TipConfig = components['schemas']['TipConfigResponse']
type TipOrder = components['schemas']['TipOrderResponse']

/** 打赏设置：默认关闭，档位是常见的 5 / 10 / 20 元。 */
const tipSettings: TipConfig = {
  enabled: true,
  cash_tiers_fen: [500, 1000, 2000],
  allow_custom_cash: true,
  custom_cash_min_fen: 100,
  custom_cash_max_fen: 2_000_000,
  public_records: true,
  thanks_message: '谢谢支持，后续版本会继续打磨。',
  updated_at: datetime(-3, 11, 0),
}

/** 收到的打赏：两笔已支付（平台抽 10%，与后端 `developer_net_fen` 同口径）。 */
const receivedTips: TipOrder[] = [
  {
    order_no: 'TIP-DEMO-2',
    tipper: 'client_flow_03562487',
    developer: DEV_USERNAME,
    amount_fen: 2000,
    developer_net_fen: 1800,
    message: '插件很好用，感谢。',
    anonymous: false,
    status: 'paid',
    split_status: 'succeeded',
    created_at: datetime(-5, 15, 20),
    paid_at: datetime(-5, 15, 22),
    pay_url: null,
    wechat_pay_token: null,
  },
  {
    order_no: 'TIP-DEMO-1',
    tipper: '匿名用户',
    developer: DEV_USERNAME,
    amount_fen: 500,
    developer_net_fen: 450,
    message: '',
    anonymous: true,
    status: 'paid',
    split_status: 'succeeded',
    created_at: datetime(-12, 9, 40),
    paid_at: datetime(-12, 9, 41),
    pay_url: null,
    wechat_pay_token: null,
  },
]

let nextTipSeq = 3

export const tipRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/tips/settings',
    note: '我的打赏设置（契约 `TipConfigResponse`，金额整数分）',
    handler: () => jsonResponse(tipSettings),
  },
  {
    method: 'PUT',
    path: '/tips/settings',
    note: '保存打赏设置：原样写回并发回新的设置',
    handler: (request) => {
      const body = (request.body ?? {}) as Partial<TipConfig>

      if (typeof body.enabled === 'boolean') tipSettings.enabled = body.enabled
      if (Array.isArray(body.cash_tiers_fen)) tipSettings.cash_tiers_fen = body.cash_tiers_fen
      if (typeof body.allow_custom_cash === 'boolean') {
        tipSettings.allow_custom_cash = body.allow_custom_cash
      }
      if (typeof body.custom_cash_min_fen === 'number') {
        tipSettings.custom_cash_min_fen = body.custom_cash_min_fen
      }
      if (typeof body.custom_cash_max_fen === 'number') {
        tipSettings.custom_cash_max_fen = body.custom_cash_max_fen
      }
      if (typeof body.thanks_message === 'string') {
        tipSettings.thanks_message = body.thanks_message
      }
      if (typeof body.public_records === 'boolean') tipSettings.public_records = body.public_records
      tipSettings.updated_at = datetime(0, 12, 0)

      return jsonResponse(tipSettings)
    },
  },
  {
    method: 'GET',
    path: '/tips/received',
    note: '我收到的打赏（契约是裸数组，不分页）',
    handler: () => jsonResponse(receivedTips),
  },
  {
    method: 'POST',
    path: '/tips',
    note: '发起打赏：建一张待支付的单，附带一个假的收银台地址',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        developer?: string
        amount_fen?: number
        message?: string
        anonymous?: boolean
      }
      const amountFen = Math.round(Number(body.amount_fen) || 0)
      const orderNo = `TIP-DEMO-${nextTipSeq}`
      nextTipSeq += 1

      return jsonResponse({
        order_no: orderNo,
        tipper: DEV_USERNAME,
        developer: (body.developer ?? '').trim() || DEV_USERNAME,
        amount_fen: amountFen,
        // 平台抽 10%，与后端结算口径一致
        developer_net_fen: Math.round(amountFen * 0.9),
        message: body.message ?? '',
        anonymous: body.anonymous === true,
        status: 'pending',
        split_status: 'none',
        created_at: datetime(0, 12, 0),
        paid_at: null,
        pay_url: `https://mock.73info.local/tip/${orderNo}`,
        wechat_pay_token: null,
      })
    },
  },
  {
    method: 'GET',
    path: '/tips/:order_no',
    note: '单张打赏单：演示数据里只有那两张已支付的历史单',
    handler: (_request, params) =>
      jsonResponse(
        receivedTips.find((item) => item.order_no === params.order_no) ?? receivedTips[0],
      ),
  },
]
