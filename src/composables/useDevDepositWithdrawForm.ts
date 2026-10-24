/**
 * 保证金提现弹窗的表单与提交：金额 + 备注，退回方式固定为原路退回（文案见弹窗）。
 *
 * 保证金与接单收入走两条互不相通的出款路径（`source: 'developer_order_deposit'`），
 * 校验口径仍复用 `validateDevWithdrawalRequest`，不在这里另写一套金额规则。
 *
 * 提交成功后**不在这里回刷**：`submit()` 返回 true，由弹窗 `emit('submitted')` 交给页面决定怎么刷
 * （页面用静默后台刷新，避免表格再闪一次 loading 遮罩）。
 */
import { reactive, ref } from 'vue'

import {
  createDevOrderDepositWithdrawalRequest,
  type CreateDevOrderDepositWithdrawalRequest,
} from '@/api/devOrderDeposit'
import { validateDevWithdrawalRequest } from '@/api/devWallet'
import { MIN_WITHDRAW_CNY, normalizeCnyAmount } from '@/shared/devWalletDisplay'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export function useDevDepositWithdrawForm(withdrawable: () => number) {
  const auth = useAuthStore()

  const visible = ref(false)
  const submitting = ref(false)
  const error = ref('')
  const form = reactive<CreateDevOrderDepositWithdrawalRequest>({
    amount_cny: 0,
    channel: 'adapay',
    account_name: '',
    account_no: '',
    note: '',
  })

  function reset() {
    form.amount_cny = 0
    form.channel = 'adapay'
    form.account_name = ''
    form.account_no = ''
    form.note = ''
  }

  /** 打开弹窗：余额不足时只提示、不开窗（按钮本身也 disabled，这里兜住键盘/程序触发） */
  function open() {
    if (withdrawable() < MIN_WITHDRAW_CNY) {
      TMessage.warning('当前可提现保证金不足，暂时无法发起提现')
      return
    }

    reset()
    error.value = ''
    visible.value = true
  }

  async function submit(): Promise<boolean> {
    if (submitting.value) return false
    error.value = ''
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }

    const payload: CreateDevOrderDepositWithdrawalRequest = {
      amount_cny: normalizeCnyAmount(Number(form.amount_cny)),
      channel: form.channel,
      account_name: form.account_name.trim(),
      account_no: form.account_no.trim(),
      note: form.note?.trim() || null,
    }

    const validationMessage = validateDevWithdrawalRequest(
      payload,
      withdrawable(),
      undefined,
      false,
      'developer_order_deposit',
    )
    if (validationMessage) {
      TMessage.warning(validationMessage)
      return false
    }

    submitting.value = true
    try {
      const record = await createDevOrderDepositWithdrawalRequest(auth.token, payload)
      if (record.status === 'paid') {
        TMessage.success('保证金已退回')
      } else if (record.status === 'payout_failed') {
        TMessage.warning(record.payout_failure_message || '自动退回未完成，申请已保留待人工处理')
      } else if (record.status === 'pending_review') {
        TMessage.warning('自动退回暂未开启，申请已转人工审核')
      } else {
        TMessage.success('保证金退回处理中，请留意原支付账户')
      }
      visible.value = false
      reset()
      return true
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '提交保证金提现申请失败'
      error.value = message
      TMessage.error(message)
      return false
    } finally {
      submitting.value = false
    }
  }

  return { visible, submitting, error, form, open, reset, submit }
}
