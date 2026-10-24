import { computed, ref, watch } from 'vue'

import {
  getAfterSalesCase,
  listMyAfterSalesCases,
  openAfterSalesCase,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesCaseDetail,
  type AfterSalesCaseSummary,
  type AfterSalesRespondAction,
} from '@/api/afterSales'
import {
  canRespondBreachCase,
  canWithdrawBreachCase,
  type BreachActionSubject,
} from '@/shared/requirementBreach'
import { parseCnyToFen } from '@/shared/money'
import { TMessage } from 'ui_73info'

export type AfterSalesCaseProps = {
  visible: boolean
  token: string | null
  requirementId: string
  /** 当前登录人：只喂给「我是立案人 / 我是对方当事人」那组判定。 */
  currentUsername: string
  /** 当前登录人能不能在这一侧发起案件（需求方且需求已结单）。 */
  canOpenCase: boolean
}

/**
 * 结单后「售后 / 解除合作」案件：列表、详情、立案、表态与撤回。
 *
 * 三个口径照契约与后端状态机，不要各写一套：
 * - 这一侧只立 `after_sales`（售后）案件：后端 `can_file_status` 对已结单需求只放行这一类，
 *   旧代码按「要不要返工」在 `mutual_unbind` / `after_sales` 之间二选一，结单需求上那一半必然 400；
 * - 列表用 `open` 区分在办与已收口，详情（表态流水 / 裁决）另取一次 `GET /api/dispute/cases/{case_no}`；
 * - 表态与撤回的资格判定在 `shared/requirementBreach`，与需求页那两个弹窗同一份。
 */
export function useAfterSalesCase(options: AfterSalesCaseProps, emitClose: () => void) {
  const description = ref('')
  const claimAmount = ref<string | number>('')
  const submitting = ref(false)
  const cases = ref<AfterSalesCaseSummary[]>([])
  const casesLoading = ref(false)
  /** 在办案件的详情（诉求说明 / 表态流水 / 裁决）。 */
  const caseDetail = ref<AfterSalesCaseDetail | null>(null)
  const respondingCaseNo = ref<string | null>(null)
  const withdrawingCaseNo = ref<string | null>(null)

  const busy = computed(
    () => submitting.value || respondingCaseNo.value !== null || withdrawingCaseNo.value !== null,
  )
  const claimAmountFen = computed(() => parseCnyToFen(claimAmount.value) ?? 0)
  /** 在办案件（一个需求同时只有一条，`open` 由后端按状态算）。 */
  const openCase = computed(() => cases.value.find((item) => item.open) ?? null)
  /** 最近一条已收口的案件：只用来在表单上方说一句「上次的结果」。 */
  const lastClosedCase = computed(() => cases.value.find((item) => !item.open) ?? null)

  /** 判定用的最小形状：列表给的是 `open`，这里折成 `is_open` 后与需求页共用同一组判定。 */
  const openSubject = computed<BreachActionSubject | null>(() => {
    const item = openCase.value
    return item
      ? {
          status: item.status,
          is_open: item.open,
          filed_by: item.filed_by,
          respondent: item.respondent,
        }
      : null
  })
  const canRespond = computed(() =>
    canRespondBreachCase(openSubject.value, options.currentUsername),
  )
  const canWithdraw = computed(() =>
    canWithdrawBreachCase(openSubject.value, options.currentUsername),
  )

  async function refresh() {
    if (!options.token || !options.requirementId) return
    casesLoading.value = true
    try {
      cases.value = await listMyAfterSalesCases(options.token, {
        requirement_id: options.requirementId,
      })
      const caseNo = openCase.value?.case_no
      caseDetail.value = caseNo ? await getAfterSalesCase(options.token, caseNo) : null
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载解除合作案件失败')
    } finally {
      casesLoading.value = false
    }
  }

  async function submit() {
    if (!options.token || !options.requirementId || !options.canOpenCase) return
    const note = description.value.trim()
    if (!note) {
      TMessage.warning('请先描述遇到的问题')
      return
    }
    submitting.value = true
    try {
      await openAfterSalesCase(options.token, {
        requirement_id: options.requirementId,
        kind: 'after_sales',
        claim_amount_fen: claimAmountFen.value,
        claim_note: note,
      })
      TMessage.success('解除合作申请已提交')
      description.value = ''
      claimAmount.value = ''
      await refresh()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起解除合作申请失败')
    } finally {
      submitting.value = false
    }
  }

  async function respond(item: AfterSalesCaseSummary, action: AfterSalesRespondAction) {
    if (!options.token) return
    respondingCaseNo.value = item.case_no
    try {
      await respondAfterSalesCase(options.token, item.case_no, action)
      TMessage.success(action === 'approve' ? '已同意解除合作' : '已表示不同意，案件转平台裁决')
      await refresh()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '提交解除合作案件表态失败')
    } finally {
      respondingCaseNo.value = null
    }
  }

  async function withdraw(item: AfterSalesCaseSummary) {
    if (!options.token) return
    withdrawingCaseNo.value = item.case_no
    try {
      await withdrawAfterSalesCase(options.token, item.case_no, '当事人撤回申请')
      TMessage.success('解除合作申请已撤回')
      await refresh()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '撤回解除合作申请失败')
    } finally {
      withdrawingCaseNo.value = null
    }
  }

  function close() {
    if (!busy.value) emitClose()
  }

  watch(
    () => options.visible,
    async (visible) => {
      if (!visible) return
      description.value = ''
      claimAmount.value = ''
      cases.value = []
      caseDetail.value = null
      await refresh()
    },
  )

  return {
    description,
    claimAmount,
    submitting,
    cases,
    casesLoading,
    caseDetail,
    respondingCaseNo,
    withdrawingCaseNo,
    claimAmountFen,
    openCase,
    lastClosedCase,
    canRespond,
    canWithdraw,
    busy,
    refresh,
    submit,
    respond,
    withdraw,
    close,
  }
}
