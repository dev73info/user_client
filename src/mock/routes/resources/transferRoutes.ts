/**
 * 过户与转移（`/api/resources/transfers/**` 与 `/api/resources/purchase-transfers/**`）的假路由。
 *
 * 这两族原来一条都没实现，`/workbench/purchase-transfers` 页面的四个读数全靠兜底的 `[]`，
 * 页面看起来「没有待接收的申请」是正常空态，但发起、接收、拒绝、撤销全都点不动。
 *
 * 路径用契约的**复数** `/resources/...`：前端 `src/api/resourceTransfers.ts` 写的是
 * `/dev/resources/transfers/mine`，别名会把它翻成 `/resources/transfers/mine`。
 *
 * 演示数据里各放一条「待接收」和一条「我发起的」：两者状态不同，列表才看得出差别。
 */

import type { components } from '@/api/generated/schema'

import type { MockRoute } from '../../router'
import { DEV_USERNAME, datetime } from '../../db/shared'
import { errorResponse, jsonResponse } from '../../response'

type ResourceTransfer = components['schemas']['ResourceTransferResponse']
type PurchaseTransfer = components['schemas']['PurchaseTransferResponse']

/** 资源所有权过户：一条待对方接收、一条我已撤销（历史）。 */
const resourceTransfers: ResourceTransfer[] = [
  {
    transfer_id: 1,
    resource_id: 9003,
    resource_name: '小程序订单提醒机器人',
    from_user: DEV_USERNAME,
    from_ownership_type: 'individual',
    from_team_id: null,
    from_team_name: null,
    to_user: 'client_flow_03562487',
    to_team_id: null,
    to_team_name: null,
    status: 'pending',
    message: '团队合并后由你这边继续维护。',
    initiated_at: datetime(-2, 10, 20),
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
  },
  {
    transfer_id: 2,
    resource_id: 9001,
    resource_name: '跨境电商订单同步插件',
    from_user: DEV_USERNAME,
    from_ownership_type: 'individual',
    from_team_id: null,
    from_team_name: null,
    to_user: 'client_flow_03562487',
    to_team_id: null,
    to_team_name: null,
    status: 'cancelled',
    message: '',
    initiated_at: datetime(-9, 14, 5),
    responded_at: null,
    responded_by: null,
    cancelled_at: datetime(-8, 9, 30),
  },
]

/** 订单使用权转移：同样一条待接收、一条已结束。 */
const purchaseTransfers: PurchaseTransfer[] = [
  {
    transfer_id: 1,
    order_no: 'MOCK-RPO-1',
    resource_id: 9003,
    resource_title: '小程序订单提醒机器人',
    from_username: DEV_USERNAME,
    to_username: 'client_flow_03562487',
    status: 'pending',
    message: '这个订单的使用权转给你。',
    initiated_at: datetime(-1, 16, 40),
    responded_at: null,
    responded_by: null,
    cancelled_at: null,
  },
  {
    transfer_id: 2,
    order_no: 'MOCK-RPO-2',
    resource_id: 9001,
    resource_title: '企业微信审批流连接器',
    from_username: DEV_USERNAME,
    to_username: 'client_flow_03562487',
    status: 'accepted',
    message: '',
    initiated_at: datetime(-14, 11, 0),
    responded_at: datetime(-13, 9, 15),
    responded_by: 'client_flow_03562487',
    cancelled_at: null,
  },
]

/**
 * 统一的状态流转：接收 → accepted，拒绝 → rejected，撤销 → cancelled。
 *
 * 两族的行字段名不完全一样（一边是 `from_user` / `resource_name`，一边是 `from_username` /
 * `resource_title`），所以这里只按两者共有的这四列操作，不要求整行同构。
 */
type TransferRow = {
  transfer_id: number
  status: string
  responded_at?: string | null
  responded_by?: string | null
  cancelled_at?: string | null
}

function respond<T extends TransferRow>(
  rows: T[],
  transferId: string,
  action: 'accept' | 'reject' | 'cancel',
): T | null {
  const row = rows.find((item) => String(item.transfer_id) === transferId)
  if (!row) {
    return null
  }

  if (action === 'cancel') {
    row.status = 'cancelled'
    row.cancelled_at = datetime(0, 12, 0)
    return row
  }

  row.status = action === 'accept' ? 'accepted' : 'rejected'
  row.responded_at = datetime(0, 12, 0)
  row.responded_by = DEV_USERNAME

  return row
}

export const transferRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 资源所有权过户 */
  {
    method: 'GET',
    path: '/resources/transfers/mine',
    note: '我发起的资源过户（契约 `ResourceTransferResponse[]`）',
    handler: () => jsonResponse(resourceTransfers),
  },
  {
    method: 'GET',
    path: '/resources/transfers/inbox',
    note: '待我接收的资源过户（演示数据里没有别人转给我的）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'POST',
    path: '/resources/transfers/:transfer_id/accept',
    note: '接收资源过户',
    handler: (_request, params) => {
      const row = respond(resourceTransfers, params.transfer_id ?? '', 'accept')
      return row ? jsonResponse(row) : errorResponse(404, '过户申请不存在')
    },
  },
  {
    method: 'POST',
    path: '/resources/transfers/:transfer_id/reject',
    note: '拒绝资源过户',
    handler: (_request, params) => {
      const row = respond(resourceTransfers, params.transfer_id ?? '', 'reject')
      return row ? jsonResponse(row) : errorResponse(404, '过户申请不存在')
    },
  },
  {
    method: 'POST',
    path: '/resources/transfers/:transfer_id/cancel',
    note: '撤销资源过户',
    handler: (_request, params) => {
      const row = respond(resourceTransfers, params.transfer_id ?? '', 'cancel')
      return row ? jsonResponse(row) : errorResponse(404, '过户申请不存在')
    },
  },

  /* ---------------------------------------------------------------- 订单使用权转移 */
  {
    method: 'GET',
    path: '/resources/purchase-transfers/outgoing',
    note: '我发起的使用权转移',
    handler: () => jsonResponse(purchaseTransfers),
  },
  {
    method: 'GET',
    path: '/resources/purchase-transfers/incoming',
    note: '待我接收的使用权转移（演示数据里没有别人转给我的）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'POST',
    path: '/resources/purchase-transfers/:transfer_id/accept',
    note: '接收使用权转移',
    handler: (_request, params) => {
      const row = respond(purchaseTransfers, params.transfer_id ?? '', 'accept')
      return row ? jsonResponse(row) : errorResponse(404, '转移申请不存在')
    },
  },
  {
    method: 'POST',
    path: '/resources/purchase-transfers/:transfer_id/reject',
    note: '拒绝使用权转移',
    handler: (_request, params) => {
      const row = respond(purchaseTransfers, params.transfer_id ?? '', 'reject')
      return row ? jsonResponse(row) : errorResponse(404, '转移申请不存在')
    },
  },
  {
    method: 'POST',
    path: '/resources/purchase-transfers/:transfer_id/cancel',
    note: '撤销使用权转移',
    handler: (_request, params) => {
      const row = respond(purchaseTransfers, params.transfer_id ?? '', 'cancel')
      return row ? jsonResponse(row) : errorResponse(404, '转移申请不存在')
    },
  },
]
