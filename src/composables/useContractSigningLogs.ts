import type { Ref } from 'vue'

import { fetchMyContractSigningLogs, type ContractDetail } from '@/api/contracts'

/**
 * 合同详情不内嵌签署流水，签约页单独补拉一次。
 *
 * 只读补充信息：拉不到就保留现有日志，不能因此阻断合同展示。
 */
export async function hydrateSigningLogs(contract: Ref<ContractDetail | null>, token: string) {
  const current = contract.value
  if (!current) return
  try {
    const logs = await fetchMyContractSigningLogs(token, current.id)
    if (logs.length) {
      contract.value = { ...current, signing_logs: logs }
    }
  } catch {
    // 忽略：签署记录不是签署动作的前置条件
  }
}
