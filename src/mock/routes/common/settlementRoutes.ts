/**
 * 收款账户（结算账户）的假路由。
 *
 * 契约在 `crates/business/payment/src/api/settlement*.rs`，前端适配层是 `src/api/adapay/member.ts`。
 * 这一族原来一条都没实现，用户端读到的全是兜底的 `[]`：账户页把空数组当成账户对象，
 * 永远显示「正在自动开通收款账户」，绑卡弹窗也永远走不到「已绑卡」这一档。
 *
 * 只做「能读、能绑、能换、能注销」这四条主链，状态在 `db/settlement.ts` 里真实推进，
 * 所以预览时绑一张卡就能看到入口卡从「待绑卡」变成「已设置」。
 */

import type { MockRoute } from '../../router'

import {
  bindSettlementAccount,
  closeSettlementAccount,
  settlementAccount,
} from '../../db/settlement'
import { jsonResponse } from '../../response'

export const settlementRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/payment/settlement-account',
    note: '我的收款账户（没开户时回 null，不是 404）',
    handler: () => jsonResponse(settlementAccount),
  },
  {
    method: 'POST',
    path: '/payment/settlement-account',
    note: '首次提交开户资料：只收户名 / 开户行 / 卡号后四位',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        account_name?: string
        bank_name?: string
        account_no_tail?: string
        member_type?: string | null
      }

      return jsonResponse(bindSettlementAccount(body))
    },
  },
  {
    method: 'POST',
    path: '/payment/settlement-account/change',
    note: '已开通状态下改绑：与开户同一套字段',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        account_name?: string
        bank_name?: string
        account_no_tail?: string
        member_type?: string | null
      }

      return jsonResponse(bindSettlementAccount(body))
    },
  },
  {
    method: 'POST',
    path: '/payment/settlement-account/close',
    note: '注销结算账户：行不删，只置 closed',
    handler: () => jsonResponse(closeSettlementAccount()),
  },
  {
    method: 'POST',
    path: '/payment/settlement-account/sync',
    note: '回查渠道状态：演示数据没有渠道可问，原样回当前账户',
    handler: () => jsonResponse(settlementAccount),
  },
  {
    method: 'POST',
    path: '/payment/settlement-account/open',
    note: '对私自动开户：完整资料直连渠道，演示里按成功绑卡回写后四位',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        card_name?: string
        card_id?: string
        bank_name?: string
        member_type?: string | null
      }

      return jsonResponse(
        bindSettlementAccount({
          account_name: body.card_name,
          bank_name: body.bank_name,
          account_no_tail: (body.card_id ?? '').slice(-4),
          member_type: body.member_type ?? 'personal',
        }),
      )
    },
  },
  {
    method: 'POST',
    path: '/payment/settlement-account/open-enterprise',
    note: '企业对公账户自动开通：演示里同样视为就绪',
    handler: () => jsonResponse(settlementAccount),
  },
]
