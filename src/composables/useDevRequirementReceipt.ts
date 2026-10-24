import { computed, ref } from 'vue'

import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/devRequirements'
import {
  receiptMoney,
  receiptTotal,
  rowCustomer,
  rowTitle,
  timeValue,
  type DevMyOrderRow,
} from '@/shared/devDelivery'
import { displayStatusLabel, displayStatusType } from '@/shared/devMyRequirementCard'

/**
 * 「回款详情」弹窗的那一组事实：打开状态、当前行、抬头、委托方、状态徽标、逐笔回执与合计。
 *
 * 存的是**行标识**而不是行快照：弹窗开着时点顶部刷新，下面仍从最新的数据里重新找同一行，
 * 不会留下一份过期的金额。行来源（`mergedRows`）仍是页面的单实例，这里只吃一个 getter。
 *
 * 「待签合同」那一档要读页面一次取回的签约状态（`contractStatusOf` 注入进来），
 * 在弹窗里再判一次就是第二份口径。
 */
export function useDevRequirementReceipt(options: {
  /** 归并好的行（页面的单实例，这里只读） */
  rows: () => DevMyOrderRow[]
  /** 本页一次取回的签约状态（`useDevMyRequirementsLoad.contractStatusOf`） */
  contractStatusOf: (item: RequirementItem) => ContractSigningStatus | null
}) {
  const visible = ref(false)
  const activeKey = ref<string | null>(null)

  const activeRow = computed(
    () => options.rows().find((row) => row.key === activeKey.value) ?? null,
  )

  /** 打开某一行：只记行标识，金额与逐笔都从最新的数据里重新算。 */
  function open(row: DevMyOrderRow) {
    activeKey.value = row.key
    visible.value = true
  }

  /* 行的状态文案与徽标色调：补充行只剩「需求已解绑」这一类（没绑定需求单的交付不成行，
     见 `shared/devDelivery.ts`），其余按本页签约状态判到「待签合同」那一档。 */
  function rowStatusLabel(row: DevMyOrderRow): string {
    return row.item
      ? displayStatusLabel(row.item, options.contractStatusOf(row.item))
      : '需求已解绑'
  }

  function rowStatusType(row: DevMyOrderRow): 'info' | 'success' | 'warning' | 'danger' {
    return row.item ? displayStatusType(row.item, options.contractStatusOf(row.item)) : 'info'
  }

  const detail = computed(() => {
    const row = activeRow.value
    if (!row) {
      return null
    }

    /* 逐笔按到账时间正序排：托管模式下定金先分账、尾款后分账，
       顺着时间读下来才是「第 1 笔 / 第 2 笔」应有的顺序（与列表里最近一笔在最上面相反）。 */
    const receipts = [...row.receipts].sort(
      (left, right) => timeValue(left.paidAt) - timeValue(right.paidAt),
    )

    return {
      dialogTitle: row.requirementId ? `回款详情 · ${row.requirementId}` : '回款详情',
      title: rowTitle(row),
      requirementId: row.requirementId ?? '',
      customer: rowCustomer(row) || '—',
      statusLabel: rowStatusLabel(row),
      statusTone: rowStatusType(row),
      receipts,
      totalText: receiptMoney(receiptTotal(receipts)),
    }
  })

  return { visible, open, detail }
}
