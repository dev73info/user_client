import { ref, watch } from 'vue'

import { getAlipayPageHtml } from '@/api/payments'
import type { PaymentQueryContext } from '@/shared/paymentQuery'

type UseAlipayPageFrameOptions = {
  ctx: () => PaymentQueryContext
  /** 实际渠道：只有支付宝扫码（非 Adapay）才有官方收银台页 */
  resolvedChannel: () => string
  isAdapay: () => boolean
  token: () => string
}

/**
 * 支付宝官方收银台（`srcdoc` 内嵌）。
 *
 * 支付宝要求「扫码 + 轮询」都在它自己的页面里完成，所以直接整页内嵌，比只画一个二维码更稳；
 * 拿不到收银台页时上层会退回到二维码分支（`v-else`）。
 */
export function useAlipayPageFrame(options: UseAlipayPageFrameOptions) {
  const alipayPageHtml = ref('')
  const alipayPageLoading = ref(false)
  const alipayIframeLoading = ref(false)

  async function loadAlipayPageHtml(paymentIdValue: string) {
    alipayPageHtml.value = ''
    alipayPageLoading.value = true
    alipayIframeLoading.value = true

    if (!options.token()) {
      alipayPageLoading.value = false
      alipayIframeLoading.value = false
      return
    }

    try {
      alipayPageHtml.value = await getAlipayPageHtml(options.token(), paymentIdValue)
    } catch {
      // 失败保持空串，模板退回二维码分支
    } finally {
      alipayPageLoading.value = false
    }
  }

  function handleIframeLoad() {
    alipayIframeLoading.value = false
  }

  watch(
    [() => options.ctx().paymentId, () => options.resolvedChannel(), () => options.token()],
    async ([id, channel]) => {
      if (channel !== 'alipay' || !id || options.isAdapay()) {
        return
      }

      await loadAlipayPageHtml(id)
    },
    {
      immediate: true,
    },
  )

  return {
    alipayPageHtml,
    alipayPageLoading,
    alipayIframeLoading,
    handleIframeLoad,
  }
}
