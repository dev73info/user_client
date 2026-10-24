import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import { useRouter } from 'vue-router'

/** 支付成功页自动返回的倒计时（原来是一个「返回工作台」按钮） */
const REDIRECT_SECONDS = 3

/**
 * 支付成功后 3 秒自动「返回」（与顶部「返回」按钮同一个动作：`router.back()`）。
 *
 * 只在 `paid` 为真时启动：「正在确认支付结果」与「微信已返回支付成功」两个态下到账尚未确认
 * （或以后者电脑端订单为准），自动把用户带走会让他看不到后续结果。
 */
export function usePaymentRedirect(options: { paid: Ref<boolean> }) {
  const router = useRouter()
  const redirectCountdown = ref(REDIRECT_SECONDS)
  let timer: ReturnType<typeof setInterval> | null = null

  function stopRedirectCountdown() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function goBack() {
    router.back()
  }

  function startRedirectCountdown() {
    stopRedirectCountdown()
    redirectCountdown.value = REDIRECT_SECONDS
    timer = setInterval(() => {
      redirectCountdown.value -= 1
      if (redirectCountdown.value <= 0) {
        stopRedirectCountdown()
        goBack()
      }
    }, 1000)
  }

  onMounted(() => {
    // `paid` 可能在本页轮询后才变真，所以用 watch 而不是只看 mounted 那一刻。
    watch(
      options.paid,
      (value) => {
        if (value) {
          startRedirectCountdown()
        } else {
          stopRedirectCountdown()
        }
      },
      { immediate: true },
    )
  })

  onUnmounted(stopRedirectCountdown)

  return { redirectCountdown, goBack }
}
