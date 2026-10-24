import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'

import { getAdapayClientPlatform } from '@/api/adapay'
import { createResourcePurchase, type ResourcePurchaseOrder } from '@/api/resourcePurchase'
import { useResourcePayment } from '@/composables/useResourcePayment'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  canReuseCashQrForChannel,
  fenToYuanText,
  normalizePromoCode,
  type ResourcePayChannelUi,
} from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

export type UseResourcePurchaseOptions = {
  /** 当前资源编号（没有编号就不下单） */
  getResourceId: () => number | null
  /** 资源当前的推广分成比例（bps），只用来决定要不要出推广轻提示 */
  getPromoShareBps: () => number
  /** 付款成功 / 后端回「已购买」后刷新详情（资源实体还在父级手里） */
  refreshDetail: () => Promise<void>
}

/**
 * 资源购买（下单 / 渠道切换 / 支付面与轮询）。三件**不能动**的东西原样搬进来：
 * ①**下单串行队列** `submitChain`（同一时刻只跑一笔，避免并发抢改同一条 pending）；
 * ②**支付面世代号**（`useResourcePayment` 的 `generation`，作废即递增，下单 / 轮询 / 画码
 * 都持当前世代号、过期的整轮丢弃，旧渠道单不得挂回可付款面，R031）；
 * ③**切渠道防抖 350ms**。组件只拿状态与四个动作，`router` / `TMessage` / api 全在这一层。
 */
export function useResourcePurchase(options: UseResourcePurchaseOptions) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const panelOpen = ref(false)
  const submitting = ref(false)
  const channel = ref<ResourcePayChannelUi>('alipay')
  /** 购买失败原因：原样透传后端文案（toast 只停 2.6 秒，用户在弹窗里还要能再看到一次） */
  const error = ref('')
  /** 切换支付渠道防抖，避免连点支付宝/微信刷出一堆订单 */
  let channelSwitchTimer: ReturnType<typeof setTimeout> | null = null
  /** 下单串行队列：同一时刻只跑一笔，避免并发抢改同一条 pending */
  let submitChain: Promise<void> = Promise.resolve()

  /** 支付面（订单 / 二维码 / 世代号）与轮询统一由 `useResourcePayment` 管理 */
  const {
    order,
    qrDataUrl,
    generation: surfaceGeneration,
    stopPoll,
    invalidateSurface,
    renderQr,
    startPoll,
  } = useResourcePayment({
    getToken: () => auth.token,
    onPaid: (paidOrder) => handlePaid(paidOrder),
    notifyClosed: () => TMessage.warning('支付未完成，请重新发起购买'),
  })

  /**
   * R029：本次链接带来的推广码（`?promo=`，分享短链落地时写入）。列表页保证它只在
   * 「当前详情就是分享链接指向的那条资源」时留在地址栏上，所以这里可以直接按资源用；
   * 格式不合格的码在落地时就拒掉了，这里再校验一次兜底。
   */
  const promoCode = computed(() => normalizePromoCode(route.query.promo))

  /**
   * 推广轻提示：比例 > 0 且本次带了推广码才提示（比例 0 时后端不归因，提示它同样是错的）。
   */
  const showPromoHint = computed(
    () => Number(options.getPromoShareBps() ?? 0) > 0 && Boolean(promoCode.value),
  )

  function clearChannelSwitchTimer() {
    if (channelSwitchTimer !== null) {
      clearTimeout(channelSwitchTimer)
      channelSwitchTimer = null
    }
  }

  /** 复用已有待支付单：只重挂轮询，不重新下单 */
  function startReusePoll() {
    if (order.value?.order_no) {
      startPoll(order.value.order_no)
    }
  }

  /** 当前资源是否已有可复用的待支付码（同渠道），避免弹窗反复开关再插新单 */
  function hasReusableCashQr(channelToCheck: ResourcePayChannelUi): boolean {
    const current = order.value
    const resourceId = options.getResourceId()
    if (!current || resourceId == null || current.resource_id !== resourceId) {
      return false
    }
    return canReuseCashQrForChannel(current, channelToCheck, Boolean(qrDataUrl.value.trim()))
  }

  async function open() {
    if (!auth.isAuthed) {
      TMessage.info('请先登录后再购买')
      void router.push({
        name: 'home',
        query: { modal: 'auth', mode: 'login', redirect_to: route.fullPath },
      })
      return
    }
    clearChannelSwitchTimer()
    panelOpen.value = true
    error.value = ''

    // 优先复用本页已有的待支付码；没有才按默认支付宝拉一次
    if (hasReusableCashQr(channel.value)) {
      startReusePoll()
      return
    }
    channel.value = 'alipay'
    if (hasReusableCashQr('alipay')) {
      startReusePoll()
      return
    }
    // 两个渠道都无码可复用：作废旧引用后再拉新单，不复用 / 不展示旧渠道单
    invalidateSurface()
    void submit()
  }

  function close() {
    clearChannelSwitchTimer()
    panelOpen.value = false
    error.value = ''
    // 保留 pending 订单与二维码；pending 时不停轮询——本机靠查单落 paid 后要能自动刷新详情
  }

  function selectChannel(next: ResourcePayChannelUi) {
    if (channel.value === next && (qrDataUrl.value || submitting.value)) {
      return
    }
    const channelChanged = channel.value !== next
    channel.value = next
    error.value = ''
    // 切渠道：旧渠道的可付款面（旧码 / 旧单号 / 旧链接）立即作废，不等新单结果
    if (channelChanged) {
      invalidateSurface()
    } else {
      stopPoll()
    }
    clearChannelSwitchTimer()
    // 防抖：连点支付宝/微信只按最后一次真正下单
    channelSwitchTimer = setTimeout(() => {
      channelSwitchTimer = null
      void submit()
    }, 350)
  }

  async function handlePaid(paidOrder: ResourcePurchaseOrder) {
    stopPoll()
    order.value = paidOrder
    qrDataUrl.value = ''
    error.value = ''
    TMessage.success('购买成功，可以下载了')
    await options.refreshDetail()
    panelOpen.value = false
  }

  function submit() {
    submitChain = submitChain.catch(() => undefined).then(() => runSubmit())
    return submitChain
  }

  async function runSubmit() {
    const resourceId = options.getResourceId()
    if (resourceId == null || !auth.token?.trim()) {
      void open()
      return
    }
    // 排队执行到此时，若渠道已有可复用码则跳过，消化防抖期间的多余请求
    if (hasReusableCashQr(channel.value)) {
      startReusePoll()
      return
    }
    // 世代号：本轮下单期间若用户切了渠道（`invalidateSurface` 会递增），
    // 之后每个落点都比对一次，过期就整轮丢弃——旧渠道的迟到响应不得挂回可付款面
    const requestedGeneration = surfaceGeneration.value
    submitting.value = true
    error.value = ''
    try {
      // 排队间隙用户又切了渠道：以当前选择为准，避免为过期渠道再落单
      if (requestedGeneration !== surfaceGeneration.value) {
        return
      }
      // 2.0 没有「微信内先静默授权拿 openid」这一步（授权端点不在契约里），
      // 微信渠道直接下单，缺 open_id 由后端报错、按真实错误展示。
      if (requestedGeneration !== surfaceGeneration.value) {
        return
      }
      const cashOrder = await createResourcePurchase(auth.token, resourceId, {
        pay_channel: channel.value,
        client_platform: getAdapayClientPlatform() === 'mobile' ? 'mobile' : 'pc',
        // R029：推广码随单下发，后端按比例归因
        ...(promoCode.value ? { promo_code: promoCode.value } : {}),
      })
      if (requestedGeneration !== surfaceGeneration.value) {
        return
      }
      order.value = cashOrder
      if (cashOrder.status === 'paid') {
        await handlePaid(cashOrder)
        return
      }
      await renderQr(cashOrder, requestedGeneration)
      if (requestedGeneration !== surfaceGeneration.value) {
        return
      }
      if (!cashOrder.pay_url?.trim()) TMessage.info('订单已创建，支付完成后即可下载')
      startPoll(cashOrder.order_no, requestedGeneration)
    } catch (submitError) {
      if (requestedGeneration !== surfaceGeneration.value) {
        return
      }
      const message = describeBackendError(submitError, '创建购买订单失败')
      if (message.includes('已购买')) {
        TMessage.success(message)
        await options.refreshDetail()
        panelOpen.value = false
        return
      }
      // 后端拒绝的具体原因（例如 409 的响应体）原样留在弹窗里，别让用户只看到一个转瞬即逝的 toast
      error.value = message
      TMessage.error(message)
    } finally {
      submitting.value = false
    }
  }

  return {
    panelOpen,
    submitting,
    channel,
    error,
    order,
    qrDataUrl,
    promoCode,
    showPromoHint,
    open,
    close,
    selectChannel,
    submit,
  }
}
