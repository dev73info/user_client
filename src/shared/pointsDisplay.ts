import type { PointsTransfer, UserPointsLog } from '@/api/points'

/**
 * 积分展示层的纯函数：记录区两段的档位、流水行与打赏行的文案、徽标修饰类、金额换算。
 *
 * 从 `views/PointsCenterView.vue` 抽出来，供页面、工具栏与两段列表组件共用；
 * 只做「值 → 显示串」的映射，不读 store、不发请求，便于单测。
 */

/** 记录区两段：打赏记录与积分明细。与开发者钱包、需求大厅的筛选一样用统一层的胶囊按钮。 */
export type PointsRecordTab = 'transfers' | 'logs'

export const POINTS_RECORD_TABS: ReadonlyArray<{ key: PointsRecordTab; label: string }> = [
  { key: 'transfers', label: '打赏记录' },
  { key: 'logs', label: '积分明细' },
]

/** 打赏方向：全部 / 我打赏的 / 我收到的。 */
export type TransferScope = 'all' | 'sent' | 'received'

export type TransferScopeOption = { value: TransferScope; label: string; count: number }

/**
 * 方向胶囊的读数：三个档位各数一次，切档时不用重新请求（记录是一次全量取回的）。
 */
export function pointsTransferScopes(
  transfers: PointsTransfer[],
  me: string,
): TransferScopeOption[] {
  return [
    { value: 'all', label: '全部', count: transfers.length },
    {
      value: 'sent',
      label: '我打赏的',
      count: transfers.filter((item) => pointsTransferMatchesScope(item, 'sent', me)).length,
    },
    {
      value: 'received',
      label: '我收到的',
      count: transfers.filter((item) => pointsTransferMatchesScope(item, 'received', me)).length,
    },
  ]
}

/** 一笔打赏落在哪个方向档里：`all` 恒真，其余按「我是付出方还是收到方」判。 */
export function pointsTransferMatchesScope(
  transfer: PointsTransfer,
  scope: TransferScope,
  me: string,
): boolean {
  if (scope === 'all') return true
  return scope === 'sent' ? transfer.from_username === me : transfer.to_username === me
}

/** 关键词命中对方用户名 / 附言任一即可；空关键词不筛。 */
export function pointsTransferMatchesKeyword(transfer: PointsTransfer, keyword: string): boolean {
  const search = keyword.trim().toLocaleLowerCase()
  if (!search) return true
  return [transfer.from_username, transfer.to_username, transfer.note ?? ''].some((value) =>
    value.toLocaleLowerCase().includes(search),
  )
}

/** 行的两端：自己一律显示「我」，省得一行里重复念两遍自己的用户名。 */
export function pointsSelfName(username: string, me: string): string {
  return username === me ? '我' : username
}

/** 行下的一句说明：时间 + 手续费（有才显示）+ 附言（有才显示）。 */
export function pointsTransferMeta(transfer: PointsTransfer): string {
  const fee = transfer.fee > 0 ? ` · 手续费 ${transfer.fee}` : ''
  const note = transfer.note ? ` · ${transfer.note}` : ''
  return `${transfer.created_at}${fee}${note}`
}

/** 到我手上的是**扣过手续费**的到账数，打出去的按票面金额列示。 */
export function pointsTransferBadgeLabel(transfer: PointsTransfer, me: string): string {
  return transfer.to_username === me ? `+${transfer.received}` : `-${transfer.amount}`
}

/** 收到的用成功色，打出去的用默认灰底（不加修饰类）。 */
export function pointsTransferBadgeClass(transfer: PointsTransfer, me: string): string {
  return transfer.to_username === me ? 'wb-badge--success' : ''
}

/** 手续费按费率向下取整：分不是积分的单位，多收一分都不合规。 */
export function pointsTransferFee(amount: number | null | undefined, feeRate: number): number {
  if (!amount || amount <= 0) return 0
  return Math.floor((amount * feeRate) / 100)
}

/** 预览里的「接收方到账」：打赏金额扣掉手续费。 */
export function pointsTransferReceived(amount: number | null | undefined, feeRate: number): number {
  if (!amount || amount <= 0) return 0
  return amount - pointsTransferFee(amount, feeRate)
}

/** 明细行标题：后端没写原因时给一句通用文案，不留空行。 */
export function pointsLogTitle(log: UserPointsLog): string {
  return log.reason || '积分变动'
}

/** 明细行下的一句说明：时间 + 变动后的余额（余额是全量口径，便于对账）。 */
export function pointsLogMeta(log: UserPointsLog): string {
  return `${log.created_at} · 变动后余额 ${log.balance_after}`
}

/** 变动值是带符号的：加号要显式写出来，否则「5」看不出是加了还是减了。 */
export function pointsLogDeltaLabel(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

/** 增加用成功色、减少用危险色——明细里这两种方向是唯一要看懂的信息。 */
export function pointsLogBadgeClass(delta: number): string {
  return delta > 0 ? 'wb-badge--success' : 'wb-badge--danger'
}
