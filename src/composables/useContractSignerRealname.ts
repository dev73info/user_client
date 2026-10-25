import { ref, watch } from 'vue'

import { getMyRealnameVerification } from '@/api/realname'
import type { SignerRealname } from '@/shared/contractSign'

/**
 * 取**当前登录用户自己**的实名资料，作为合同签署身份的回退来源。
 *
 * 为什么需要这一层：合同响应只带签约方的姓名与平台账号，**不携带实名姓名与
 * 脱敏证件号**（那两个字段在合同 DTO 上根本不存在）。签署页若只读合同字段，
 * 本人这一方就永远显示「未完成实名认证」、签署按钮永远不可点——
 * 这正是《开发者入驻协议》签不了的原因之一。
 *
 * 所以签署身份以「本人实名资料」为准：`/api/realname/me` 拿到审核通过的记录后
 * 取出姓名与脱敏证件号。
 *
 * 失败一律回退成 `null`（不影响页面其余部分渲染）：拿不到实名资料时页面会
 * 显示「未完成实名认证」，与事实一致，比整页报错更有用。
 */
export function useContractSignerRealname(token: () => string | null | undefined) {
  const selfRealname = ref<SignerRealname | null>(null)
  const realnameLoading = ref(false)

  // token 一到位就取一次；合同页刷新（换合同）不必重复取，实名资料不随合同变。
  watch(
    () => token(),
    (value) => {
      if (value && !selfRealname.value && !realnameLoading.value) {
        void loadSelfRealname(value)
      }
    },
    { immediate: true },
  )

  async function loadSelfRealname(token: string | null | undefined) {
    if (!token) {
      selfRealname.value = null
      return
    }
    realnameLoading.value = true
    try {
      const record = await getMyRealnameVerification(token)
      selfRealname.value = signerRealnameFromRecord(record)
    } catch {
      // 未提交过实名 / 网络失败都走这里：签署页按「未完成实名」处理即可。
      selfRealname.value = null
    } finally {
      realnameLoading.value = false
    }
  }

  function reset() {
    selfRealname.value = null
  }

  return { selfRealname, realnameLoading, loadSelfRealname, reset }
}

/** 实名记录 → 签署身份。审核未通过（或姓名/证件号缺失）时返回 null。 */
function signerRealnameFromRecord(record: unknown): SignerRealname | null {
  if (!record || typeof record !== 'object') return null
  const item = record as Record<string, unknown>
  const status = String(item.status ?? '').trim().toLowerCase()
  // 后端只在审核通过后给出可签署身份；其余状态（待审 / 驳回 / 撤回）都算没有。
  if (status !== 'approved') return null

  const name = firstText(item.real_name, item.real_name_masked, item.operator_name, item.company_name)
  const idCardNo = firstText(item.id_card_no_masked, item.operator_id_card_no_masked)
  if (!name || !idCardNo) return null
  return { legalName: name, idCardNo }
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text) return text
  }
  return ''
}
