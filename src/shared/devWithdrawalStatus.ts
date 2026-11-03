/**
 * 提现单的状态文案与标签色调：接单收入提现与保证金提现共用一套口径。
 *
 * 从 `devFundDisplay.ts` 拆出来：那份文件贴着 300 行预算，这两条又是纯查询、谁都能用。
 */
import type { DevWithdrawalRecord } from '@/api/devWallet'

/**
 * 提现状态文案。
 *
 * 已知状态用列表页的紧凑文案（例如 `processing` →「处理中」），未知状态才回落到
 * 后端下发的 `status_label`，最后才是状态码。这里不写任何到账承诺：
 * 1.x 页面那句「出款中（T+1）」里的 T+1 并不是后端契约。
 */
export function incomeWithdrawalStatusText(
  status: DevWithdrawalRecord['status'],
  statusLabel?: string | null,
) {
  const map: Record<string, string> = {
    pending_review: '待审核',
    approved: '待出款',
    processing: '处理中',
    payout_processing: '处理中',
    failed: '出款失败',
    payout_failed: '出款失败',
    rejected: '已驳回',
    paid: '已到账',
    closed: '已关闭',
  }
  return map[status] ?? statusLabel ?? status
}

export function statusTagType(
  status: DevWithdrawalRecord['status'],
): 'warning' | 'success' | 'danger' | 'info' {
  if (status === 'pending_review') {
    return 'warning'
  }
  if (status === 'approved' || status === 'processing' || status === 'payout_processing') {
    return 'info'
  }
  if (status === 'paid') {
    return 'success'
  }
  return 'danger'
}
