import { computed } from 'vue'

import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/devRequirements'
import type { DevWalletIncomeItem } from '@/api/devWallet'
import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import { buildDevOrderRows, receiptTotal, type DevMyOrderRow } from '@/shared/devDelivery'
import { isWaitingContractSign } from '@/shared/devMyRequirementCard'

/**
 * 「我的接单」的行口径：把需求单、交付（资源 + 资源版本）与到账（钱包回执）拼成一行，
 * 再给卡片算好几个只读派生值（状态档位、到账合计、绑定资源标题、会话摘要）。
 *
 * 行的来源仍是页面持有的单实例（`rows` / `resources` / …，这里只吃 getter，不持有），
 * 与 `useDevRequirementFilters` 的分工一致：那边筛的是行，这边只负责把行拼好与读数。
 */
export function useDevMyRequirementsRows(options: {
  rows: () => RequirementItem[]
  resources: () => McResourcePayload[]
  versionsByResource: () => Map<number, McResourceVersionPayload[]>
  income: () => DevWalletIncomeItem[]
  /** 本页那一份签约状态（列表加载时一次取回）：状态档位与「待签合同」都读它。 */
  contractOf: (item: RequirementItem) => ContractSigningStatus | null
  /** 会话摘要（`useDevRequirementRowDialogs` 里的同一份记录）。 */
  conversationStatusLabel: (item: RequirementItem) => string
}) {
  /** 列表里的一行：交付与到账先按需求归并（见 `shared/devDelivery.ts`），再把需求单本身贴回来。 */
  const requirementById = computed(
    () => new Map(options.rows().map((item) => [item.requirement_id, item])),
  )
  const resourceById = computed(() => new Map(options.resources().map((item) => [item.id, item])))

  const mergedRows = computed<DevMyOrderRow[]>(() =>
    buildDevOrderRows(
      options.rows(),
      options.resources(),
      options.versionsByResource(),
      options.income(),
    ).map((row) => ({
      ...row,
      item: row.requirementId ? (requirementById.value.get(row.requirementId) ?? null) : null,
    })),
  )

  /**
   * 行的状态档位：「待签合同」是签约状态推出来的中间态，不是 `RequirementItem.status` 的取值，
   * 单独给它一个 key，否则筛不到；补充行（未关联需求）另占 `unlinked` 一档。
   */
  function statusKeyOf(row: DevMyOrderRow): string {
    if (!row.item) {
      return 'unlinked'
    }

    return isWaitingContractSign(row.item, options.contractOf(row.item))
      ? 'contract_pending'
      : row.item.status
  }

  /** 累计到账：所有行上到账合计的和，与「收益钱包」的入账口径同源，不另算一份。 */
  const incomeTotal = computed(() =>
    mergedRows.value.reduce((total, row) => total + receiptTotal(row.receipts), 0),
  )

  /**
   * 绑定资源的兜底标题：交付物那一格在需求还没有版本时回落到绑定的资源，
   * 资源已经不在资源清单里时写明原因，别把一格留空。查表留在页面（资源清单是页面的数据），
   * 卡片只吃算好的这一个字符串。
   */
  function boundResourceTitleFor(row: DevMyOrderRow): string | null {
    const resourceId = row.item?.bound_resource_id
    if (resourceId == null) {
      return null
    }

    return resourceById.value.get(resourceId)?.title ?? '资源已不在列表'
  }

  /** 会话摘要：卡上的「会话」格子读的就是它（与弹窗里发出的「已创建会话」是同一份记录）。 */
  function conversationLabelFor(row: DevMyOrderRow): string {
    return row.item ? options.conversationStatusLabel(row.item) : ''
  }

  return {
    mergedRows,
    statusKeyOf,
    incomeTotal,
    boundResourceTitleFor,
    conversationLabelFor,
  }
}
