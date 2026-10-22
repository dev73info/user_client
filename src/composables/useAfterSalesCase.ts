import { computed, ref, watch } from 'vue'

import {
  listMyAfterSalesCases,
  openAfterSalesCase,
  respondAfterSalesCase,
  withdrawAfterSalesCase,
  type AfterSalesCase,
  type AfterSalesRespondAction,
} from '@/api/afterSales'
import { TMessage } from 'ui_73info'

export type AfterSalesCaseProps = {
  visible: boolean
  token: string | null
  requirementId: string
  /** 当前登录人是否是本需求的需求方（甲方）：只有甲方能发起解除合作。 */
  canOpenCase: boolean
  /** 需求预算（元）：主张金额的上限；拿不到时传 null，不限制，仍由后端兜底。 */
  requirementBudget?: number | null
}

/**
 * 解除合作弹窗的**数据与动作层**（R047 从 `components/AfterSalesModal.vue` 拆出）：
 * 案件列表与窗口状态、发起 / 表态 / 撤回三个写操作、表单字段与「有请求在途」的判定。
 *
 * 口径与拆出前逐条一致：
 * - 每次打开都重新拉一次列表（谈完一轮再打开要看到最新状态，不是上次的缓存），并把表单与窗口状态复位；
 * - 发起前先拦「没写描述」与「主张金额超过需求预算」，别让用户填完才吃一个后端 400；
 * - 没勾「要一笔钱回来」时不带金额（后端拒收「没要钱却填了额度」的诉求）；
 * - 有请求在途时不允许关窗，避免资金动作的结果无从收口。
 */

export function useAfterSalesCase(options: AfterSalesCaseProps, emitClose: () => void) {
  /**
   * 诉求 = 两个**期望**，不是四类资金通道：
   *   - 要一笔钱回来（`expectsMoney`）：退还是赔由平台认定，发起人不用挑资金来源；
   *   - 要对方返工 / 补交付（`expectsRework`）：动作项，可以与要钱并存（「先返工，做不到再退钱」）。
   *
   * 两个都关掉 = 只反馈问题（不动钱、不要求返工）。四值的「要求退款 / 要求赔偿 / 返工 / 其它」于
   * 2026-10-05 拆成这两项：原来那个字段同时编码了「期望什么」「钱从谁的池子出」「怎么执行」。
   */
  const expectsMoney = ref(true)
  const expectsRework = ref(false)
  const description = ref('')
  const claimAmount = ref<string | number>('')
  const submitting = ref(false)
  const cases = ref<AfterSalesCase[]>([])
  const casesLoading = ref(false)
  const respondingId = ref<number | null>(null)
  const withdrawingId = ref<number | null>(null)

  /** 解除合作窗口是否还开着（服务端判定）；窗口状态未知时为 null。 */
  const windowOpen = ref<boolean | null>(null)
  /** 解除合作窗口关闭时间，用于在窗口已关闭时告知需求方。 */
  const windowClosesAt = ref<string | null>(null)

  /** 需求预算（分）：主张金额的上限，0 表示拿不到（不限制）。 */
  const budgetFen = computed(() => {
    const budget = options.requirementBudget
    if (budget == null || !Number.isFinite(budget) || budget <= 0) {
      return 0
    }
    return Math.round(budget * 100)
  })

  /** 有请求在途时不允许关窗，避免资金动作的结果无从收口。 */
  const busy = computed(
    () => submitting.value || respondingId.value !== null || withdrawingId.value !== null,
  )

  /** 诉求额度分：非法或非正数一律按 0（后端只把它当诉求参考，实际退款由平台裁决）。 */
  const claimAmountFen = computed(() => {
    const parsed = Number(claimAmount.value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0
    }
    return Math.round(parsed * 100)
  })

  async function refresh() {
    if (!options.token || !options.requirementId) {
      return
    }
    casesLoading.value = true
    try {
      const result = await listMyAfterSalesCases(options.token, options.requirementId)
      cases.value = result.items
      windowOpen.value = result.windowOpen
      windowClosesAt.value = result.windowClosesAt
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载解除合作案件失败')
    } finally {
      casesLoading.value = false
    }
  }

  async function submit() {
    if (!options.token || !options.requirementId || !options.canOpenCase) {
      return
    }
    if (!description.value.trim()) {
      TMessage.warning('请先描述遇到的问题')
      return
    }
    // 主张金额不许超过需求预算（后端也会以 400 拒收）：在提交前就拦住，别让用户填完才吃一个错误提示。
    if (expectsMoney.value && budgetFen.value > 0 && claimAmountFen.value > budgetFen.value) {
      TMessage.warning(`主张金额不能超过需求预算 ${(budgetFen.value / 100).toFixed(2)} 元`)
      return
    }

    submitting.value = true
    try {
      await openAfterSalesCase(
        options.token,
        options.requirementId,
        expectsMoney.value,
        expectsRework.value,
        description.value.trim(),
        // 没勾「要一笔钱回来」时不带金额：后端拒收「没要钱却填了额度」的诉求。
        expectsMoney.value ? claimAmountFen.value : 0,
      )
      TMessage.success('解除合作申请已提交，对方会在会话里收到通知')
      description.value = ''
      claimAmount.value = ''
      await refresh()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起解除合作申请失败')
    } finally {
      submitting.value = false
    }
  }

  async function respond(item: AfterSalesCase, action: AfterSalesRespondAction) {
    if (!options.token) {
      return
    }
    respondingId.value = item.id
    try {
      const updated = await respondAfterSalesCase(options.token, item.id, action)
      TMessage.success(respondToast(action, updated))
      await refresh()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '提交解除合作案件表态失败')
    } finally {
      respondingId.value = null
    }
  }

  /** 表态结果提示：接受分「当场退款」与「等发起人收口」两种去处，别用同一句话糊过去。 */ function respondToast(
    action: AfterSalesRespondAction,
    updated: AfterSalesCase,
  ) {
    if (action === 'reject') {
      return '已提交，等待平台裁决'
    }
    if (action === 'complete') {
      return '已确认诉求落实，案件结案'
    }
    if (action === 'unfulfilled') {
      return '已提交，案件转平台裁决'
    }
    if (updated.status === 'rework_pending') {
      return '已接受返工要求，等对方确认返工完成'
    }
    return updated.status === 'agreed'
      ? '已接受对方诉求，等对方确认落实'
      : '已接受对方诉求，平台开始执行'
  }

  async function withdraw(item: AfterSalesCase) {
    if (!options.token) {
      return
    }
    withdrawingId.value = item.id
    try {
      await withdrawAfterSalesCase(options.token, item.id)
      TMessage.success('解除合作申请已撤回')
      await refresh()
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '撤回解除合作申请失败')
    } finally {
      withdrawingId.value = null
    }
  }

  function close() {
    if (busy.value) {
      return
    }
    emitClose()
  }

  // 每次打开都重新拉取：谈完一轮再打开要看到最新状态，而不是上次的缓存。
  watch(
    () => options.visible,
    async (visible) => {
      if (!visible) {
        return
      }
      expectsMoney.value = true
      expectsRework.value = false
      description.value = ''
      claimAmount.value = ''
      cases.value = []
      windowOpen.value = null
      windowClosesAt.value = null
      await refresh()
    },
  )

  return {
    expectsMoney,
    expectsRework,
    description,
    claimAmount,
    submitting,
    cases,
    casesLoading,
    respondingId,
    withdrawingId,
    windowOpen,
    windowClosesAt,
    budgetFen,
    claimAmountFen,
    busy,
    refresh,
    submit,
    respond,
    withdraw,
    close,
  }
}
