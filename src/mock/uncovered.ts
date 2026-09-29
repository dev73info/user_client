/**
 * 未实现接口的登记簿。
 *
 * 兜底响应只保证页面不崩，不会让功能真的可用，所以必须让人看得见缺了什么：
 * 控制台首次出现时打一条 warn，身份切换器的面板里列出完整清单。
 */

import { ref } from 'vue'

const MAX_ENTRIES = 60

export const uncoveredEndpoints = ref<string[]>([])

export function recordUncovered(requestId: string): void {
  if (uncoveredEndpoints.value.includes(requestId)) {
    return
  }

  console.warn(`[mock] 这个接口还没有假数据，已返回空壳：${requestId}`)

  uncoveredEndpoints.value = [...uncoveredEndpoints.value, requestId].slice(-MAX_ENTRIES)
}

export function clearUncoveredEndpoints(): void {
  uncoveredEndpoints.value = []
}
