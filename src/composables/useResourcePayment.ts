import { computed, onBeforeUnmount, ref } from 'vue'
import QRCode from 'qrcode'

import { getMyResourcePurchase, type ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { resourcePaymentCountdownText } from '@/shared/resourcePaymentCountdown'

export type UseResourcePaymentOptions = {
  /** 当前会话令牌。每次轮询时读取，避免闭包持有旧值。 */
  getToken: () => string
  /** 轮询查到 `paid` 后的回调。 */
  onPaid: (order: ResourcePurchaseOrder) => void | Promise<void>
  /** 轮询查到 `failed` / `closed` 时的提示。 */
  notifyClosed?: () => void
}

/**
 * 资源订单的二维码渲染与支付状态轮询。
 *
 * 资源详情面板与接口资源收银台共用这一套实现：一个订单只对应一条轮询，
 * 切渠道 / 重新拉单时用「支付面世代号」作废旧单的迟到响应，旧码不会复活。
 */
export function useResourcePayment(options: UseResourcePaymentOptions) {
  const order = ref<ResourcePurchaseOrder | null>(null)
  const qrDataUrl = ref('')
  /** 本次支付码真正展示的时间：后端复用旧 pending 单时，倒计时从这里起算。 */
  const surfaceShownAt = ref(0)
  /** 支付面世代号：每次作废（切渠道 / 重新拉单）递增。 */
  const generation = ref(0)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  const nowTick = ref(Date.now())
  const countdownTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)

  /**
   * 二维码下方的支付倒计时。
   *
   * 资源购买订单只回了 `created_at`，没有渠道截止时间；且后端会复用 pending 单，
   * `created_at` 可能远早于本次展示，所以按「created_at 与本次展示时间的较晚者」起算。
   * 文案由共享函数生成，不自动关单，也不把 0 点解释成渠道已失效。
   */
  const countdownText = computed(() =>
    resourcePaymentCountdownText({
      createdAt: order.value?.created_at ?? '',
      status: order.value?.status ?? '',
      hasQr: Boolean(qrDataUrl.value),
      now: nowTick.value,
      surfaceShownAt: surfaceShownAt.value,
    }),
  )

  /** 记录支付码已展示；由渲染二维码的两条路径（本地画码 / 微信授权码）共用。 */
  function markSurfaceShown() {
    surfaceShownAt.value = Date.now()
  }

  function stopPoll() {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  /**
   * 作废当前支付面：清掉对旧订单的引用与二维码，并递增世代号。
   * 此后旧单的迟到轮询 / 渲染响应世代号对不上，不会把旧的可付款面挂回来。
   */
  function invalidateSurface() {
    stopPoll()
    generation.value += 1
    order.value = null
    qrDataUrl.value = ''
    surfaceShownAt.value = 0
  }

  function clearQr() {
    qrDataUrl.value = ''
  }

  async function renderQr(
    current: ResourcePurchaseOrder,
    renderGeneration: number = generation.value,
  ) {
    const content = current.pay_url?.trim()
    if (!content) {
      if (renderGeneration === generation.value) {
        qrDataUrl.value = ''
      }
      return
    }

    let dataUrl = ''
    try {
      dataUrl = await QRCode.toDataURL(content, {
        width: 220,
        margin: 1,
      })
    } catch {
      dataUrl = ''
    }

    // 渲染是异步的：期间若已作废支付面（世代号变了），旧码不得落到新的支付面上
    if (renderGeneration !== generation.value) {
      return
    }
    qrDataUrl.value = dataUrl
    if (dataUrl) {
      markSurfaceShown()
    }
  }

  async function pollOnce(orderNo: string, pollGeneration: number = generation.value) {
    const token = options.getToken().trim()
    if (!token) {
      return
    }

    try {
      const latest = await getMyResourcePurchase(token, orderNo)
      // 迟到的轮询响应：该单已不是当前支付面 → 丢弃，不复活旧单
      if (pollGeneration !== generation.value) {
        return
      }
      order.value = latest
      if (latest.status === 'paid') {
        await options.onPaid(latest)
      } else if (latest.status === 'failed' || latest.status === 'closed') {
        stopPoll()
        options.notifyClosed?.()
      }
    } catch {
      /* 轮询失败不打断扫码流程 */
    }
  }

  function startPoll(orderNo: string, pollGeneration: number = generation.value) {
    stopPoll()
    // 立刻查一次：后端会对 pending 主动问渠道，不必干等首个 interval
    void pollOnce(orderNo, pollGeneration)
    pollTimer = setInterval(() => {
      void pollOnce(orderNo, pollGeneration)
    }, 4000)
  }

  onBeforeUnmount(() => {
    stopPoll()
    clearInterval(countdownTimer)
  })

  return {
    order,
    qrDataUrl,
    countdownText,
    generation,
    stopPoll,
    invalidateSurface,
    markSurfaceShown,
    clearQr,
    renderQr,
    pollOnce,
    startPoll,
  }
}
