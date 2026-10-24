/**
 * R010 打赏弹窗的交互状态与动作。
 *
 * 宿主 `DevTipDialog.vue` 只保留弹窗外壳与模板；档位选择、金额校验、下单与扫码轮询都在这里，
 * props / emits 契约与提交体构造在 `tipDialogModel.ts`。
 *
 * 只有现金一种形态：契约 `POST /api/tips` 的金额是整数分，收银台地址由后端回填在
 * `pay_url`（电脑端扫码），支付结果靠轮询 `GET /api/tips/{order_no}`。契约里没有积分打赏、
 * 没有支付渠道参数、也没有微信打赏中间页，所以这里没有通道切换，也不做微信内跳转。
 */
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { TMessage } from 'ui_73info'

import { createTip, getTipOrder, type TipOrder } from '@/api/tips'
import { TIP_MESSAGE_MAX_LENGTH, formatTipCashTier, validateTipCustomCash } from '@/shared/devTip'
import {
  buildTipPayload,
  FALLBACK_NOTICE,
  type DevTipDialogEmits,
  type DevTipDialogProps,
} from '@/components/dev/tipDialogModel'

export function useDevTipDialog(props: DevTipDialogProps, emit: DevTipDialogEmits) {
  /** 开发者总开关关着（或没拿到打赏块）时不允许提交 */
  const tipEnabled = computed(() => Boolean(props.tip?.enabled))

  /** 选中的固定档位下标；null 表示未选档位（走自填） */
  const selectedTierIndex = ref<number | null>(null)
  /** 是否使用自填金额（true 时忽略档位） */
  const useCustom = ref(false)
  const customCash = ref('')
  const message = ref('')
  const anonymous = ref(false)
  const submitting = ref(false)
  const errorText = ref('')

  /** 已下单、还没收到钱的那张单：有它就切到扫码面板 */
  const order = ref<TipOrder | null>(null)
  const qrDataUrl = ref('')
  const payUrl = ref('')
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const noticeText = computed(() => (props.tip?.notice ?? '').trim() || FALLBACK_NOTICE)

  const cashTiers = computed(() => props.tip?.cash_tiers_fen ?? [])
  const allowCustomCash = computed(() => Boolean(props.tip?.allow_custom_cash))

  const cashCustomHint = computed(() => {
    if (!allowCustomCash.value) {
      return ''
    }
    const min = formatTipCashTier(props.tip?.custom_cash_min_fen ?? 0)
    const max = formatTipCashTier(props.tip?.custom_cash_max_fen ?? 0)
    return `可自填 ${min} ~ ${max}`
  })

  /** 当前会提交的金额文本（用于金额摘要）。 */
  const amountPreview = computed(() => {
    if (!useCustom.value) {
      const tier = selectedTierIndex.value
      if (tier == null) {
        return '—'
      }
      const fen = cashTiers.value[tier]
      return fen == null ? '—' : formatTipCashTier(fen)
    }
    const parsed = validateTipCustomCash(customCash.value, props.tip)
    return parsed.ok ? formatTipCashTier(parsed.fen) : '—'
  })

  /** 扫码面板只在「已经下单但还没收到钱」时显示 */
  const successVisible = computed(() => order.value !== null && order.value.status !== 'paid')

  function stopPoll() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function resetState() {
    stopPoll()
    selectedTierIndex.value = cashTiers.value.length > 0 ? 0 : null
    useCustom.value = false
    customCash.value = ''
    message.value = ''
    anonymous.value = false
    errorText.value = ''
    order.value = null
    qrDataUrl.value = ''
    payUrl.value = ''
  }

  watch(
    () => props.open,
    (open) => {
      if (open) {
        resetState()
      } else {
        stopPoll()
      }
    },
  )

  function pickTier(index: number) {
    selectedTierIndex.value = index
    useCustom.value = false
  }

  function pickCustom() {
    useCustom.value = true
    selectedTierIndex.value = null
  }

  function close() {
    if (submitting.value) {
      return
    }
    emit('update:open', false)
  }

  async function renderQr(url: string) {
    try {
      qrDataUrl.value = await QRCode.toDataURL(url, { width: 220, margin: 1 })
    } catch {
      qrDataUrl.value = ''
    }
  }

  function pollOnce(orderNo: string) {
    if (!props.token.trim()) {
      return
    }
    void getTipOrder(props.token, orderNo)
      .then((latest) => {
        order.value = latest
        if (latest.status === 'paid') {
          stopPoll()
          TMessage.success('打赏成功，感谢支持')
          emit('success', latest)
          emit('update:open', false)
        } else if (latest.status === 'failed' || latest.status === 'closed') {
          stopPoll()
          errorText.value = '支付未完成，请重新发起打赏'
        }
      })
      .catch(() => {
        /* 轮询失败不打断扫码流程 */
      })
  }

  function startPoll(orderNo: string) {
    stopPoll()
    pollOnce(orderNo)
    pollTimer = setInterval(() => pollOnce(orderNo), 4000)
  }

  async function submit() {
    if (submitting.value) {
      return
    }
    errorText.value = ''
    if (!props.token.trim()) {
      errorText.value = '请先登录后再打赏'
      return
    }
    const messageText = message.value.trim()
    if (Array.from(messageText).length > TIP_MESSAGE_MAX_LENGTH) {
      errorText.value = `留言不能超过 ${TIP_MESSAGE_MAX_LENGTH} 字`
      return
    }
    const built = buildTipPayload({
      username: props.username,
      tip: props.tip,
      message: message.value,
      anonymous: anonymous.value,
      useCustom: useCustom.value,
      selectedTierIndex: selectedTierIndex.value,
      customCash: customCash.value,
    })
    if ('error' in built) {
      errorText.value = built.error
      return
    }

    submitting.value = true
    try {
      const created = await createTip(props.token, built)
      order.value = created
      if (created.status === 'paid') {
        TMessage.success('打赏成功，感谢支持')
        emit('success', created)
        emit('update:open', false)
        return
      }
      const url = (created.pay_url ?? '').trim()
      if (!url) {
        errorText.value = '订单已创建，但未取到收银台地址，请稍后在「我的已购」类记录中查看'
        return
      }
      payUrl.value = url
      await renderQr(url)
      startPoll(created.order_no)
    } catch (err) {
      // 后端拒绝的具体原因原样展示（例如「该开发者尚未绑定可用的结算账户」），不吞成「操作失败」
      errorText.value = err instanceof Error ? err.message : '发起打赏失败'
    } finally {
      submitting.value = false
    }
  }

  return {
    tipEnabled,
    selectedTierIndex,
    useCustom,
    customCash,
    message,
    anonymous,
    submitting,
    errorText,
    qrDataUrl,
    payUrl,
    noticeText,
    cashTiers,
    allowCustomCash,
    cashCustomHint,
    amountPreview,
    successVisible,
    stopPoll,
    pickTier,
    pickCustom,
    close,
    submit,
  }
}
