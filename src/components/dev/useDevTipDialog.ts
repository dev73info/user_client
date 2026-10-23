/**
 * R010 打赏弹窗的交互状态与动作。
 *
 * 宿主 `DevTipDialog.vue` 只保留弹窗外壳与模板；档位选择、通道切换、金额校验、
 * 下单与现金二维码轮询都在这里，行为与拆分前逐行一致。props / emits 契约与提交体构造
 * 在 `tipDialogModel.ts`。
 */
import { computed, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { TMessage } from 'ui_73info'

import { createTip, getTipOrder, type TipOrder } from '@/api/tips'
import { isWechatBrowser } from '@/shared/auth/browser'
import {
  defaultTipChannel,
  formatTipCashTier,
  formatTipPointsTier,
  TIP_MESSAGE_MAX_LENGTH,
  tipChannelAvailability,
  validateTipCustomCash,
  validateTipCustomPoints,
} from '@/shared/devTip'
import {
  buildTipPayload,
  FALLBACK_NOTICE,
  type DevTipDialogEmits,
  type DevTipDialogProps,
} from '@/components/dev/tipDialogModel'

export function useDevTipDialog(props: DevTipDialogProps, emit: DevTipDialogEmits) {
  const availability = computed(() => tipChannelAvailability(props.tip))

  const channel = ref<'cash' | 'points'>('cash')
  /** 选中的固定档位下标；null 表示未选档位（走自填） */
  const selectedTierIndex = ref<number | null>(null)
  /** 是否使用自填金额（true 时忽略档位） */
  const useCustom = ref(false)
  const customCash = ref('')
  const customPoints = ref('')
  const message = ref('')
  const anonymous = ref(false)
  const submitting = ref(false)
  const errorText = ref('')

  /** 现金单：本站中间页 URL 生成的二维码 */
  const order = ref<TipOrder | null>(null)
  const qrDataUrl = ref('')
  const payUrl = ref('')
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const noticeText = computed(() => (props.tip?.notice ?? '').trim() || FALLBACK_NOTICE)
  const feePercentText = computed(() => {
    const bps = Number(props.tip?.platform_fee_bps ?? 0)
    if (!Number.isFinite(bps) || bps <= 0) {
      return ''
    }
    return `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`
  })

  const cashTiers = computed(() => props.tip?.cash_tiers_fen ?? [])
  const pointsTiers = computed(() => props.tip?.points_tiers ?? [])
  const allowCustomCash = computed(() => Boolean(props.tip?.allow_custom_cash))
  const allowCustomPoints = computed(() => Boolean(props.tip?.allow_custom_points))

  const cashCustomHint = computed(() => {
    if (!allowCustomCash.value) {
      return ''
    }
    const min = formatTipCashTier(props.tip?.custom_cash_min_fen ?? 0)
    const max = formatTipCashTier(props.tip?.custom_cash_max_fen ?? 0)
    return `可自填 ${min} ~ ${max}`
  })

  const pointsCustomHint = computed(() => {
    if (!allowCustomPoints.value) {
      return ''
    }
    return `可自填 ${props.tip?.custom_points_min ?? 0} ~ ${props.tip?.custom_points_max ?? 0} 积分`
  })

  /** 当前会提交的金额文本（用于金额摘要）。 */
  const amountPreview = computed(() => {
    if (channel.value === 'cash') {
      const tier = selectedTierIndex.value
      if (!useCustom.value && tier != null) {
        return formatTipCashTier(cashTiers.value[tier])
      }
      const parsed = validateTipCustomCash(customCash.value, props.tip)
      return parsed.ok ? formatTipCashTier(parsed.fen) : '—'
    }
    const tier = selectedTierIndex.value
    if (!useCustom.value && tier != null) {
      return formatTipPointsTier(pointsTiers.value[tier])
    }
    const parsed = validateTipCustomPoints(customPoints.value, props.tip)
    return parsed.ok ? formatTipPointsTier(parsed.fen) : '—'
  })

  const successVisible = computed(
    () => order.value?.pay_method === 'cash' && order.value?.status !== 'paid',
  )

  function stopPoll() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  function resetState() {
    stopPoll()
    channel.value = defaultTipChannel(availability.value)
    selectedTierIndex.value = availability.value.cash && cashTiers.value.length > 0 ? 0 : null
    useCustom.value = false
    customCash.value = ''
    customPoints.value = ''
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

  watch(channel, (next) => {
    // 切通道时重置档位选择：现金与积分的档位列表不同
    selectedTierIndex.value =
      (next === 'cash' ? cashTiers.value.length : pointsTiers.value.length) > 0 ? 0 : null
    useCustom.value = false
    errorText.value = ''
  })

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

  /** 构造提交体：优先固定档位，其次自填（规则在 `tipDialogModel.ts`）。 */
  function buildPayload() {
    return buildTipPayload({
      username: props.username,
      tip: props.tip,
      payMethod: channel.value,
      message: message.value,
      anonymous: anonymous.value,
      useCustom: useCustom.value,
      selectedTierIndex: selectedTierIndex.value,
      customCash: customCash.value,
      customPoints: customPoints.value,
    })
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
    const built = buildPayload()
    if ('error' in built) {
      errorText.value = built.error
      return
    }

    submitting.value = true
    try {
      const created = await createTip(props.token, built)
      order.value = created
      if (created.pay_method === 'points' || created.status === 'paid') {
        TMessage.success('打赏成功，感谢支持')
        emit('success', created)
        emit('update:open', false)
        return
      }
      const url = (created.pay_url ?? '').trim()
      if (!url) {
        errorText.value = '订单已创建，但未取到支付信息，请稍后在「我的已购」类记录中查看'
        return
      }
      payUrl.value = url
      if (isWechatBrowser()) {
        // 微信内：跳到本站中间页，由 PaymentView 自动完成授权并唤起 JSAPI
        window.location.assign(url)
        return
      }
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
    availability,
    channel,
    selectedTierIndex,
    useCustom,
    customCash,
    customPoints,
    message,
    anonymous,
    submitting,
    errorText,
    qrDataUrl,
    payUrl,
    noticeText,
    feePercentText,
    cashTiers,
    pointsTiers,
    allowCustomCash,
    allowCustomPoints,
    cashCustomHint,
    pointsCustomHint,
    amountPreview,
    successVisible,
    stopPoll,
    pickTier,
    pickCustom,
    close,
    submit,
  }
}
