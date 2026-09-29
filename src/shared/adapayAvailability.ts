import { computed, ref } from 'vue'

import { getAdapayAvailability } from '@/api/adapay'
import { useAuthStore } from '@/stores/auth'

/**
 * 电签担保可用性：以服务端状态为准。
 *
 * 后端 `is_platform_guarantee_ready()` 会校验 Adapay 密钥、回调地址、个税规则等
 * 配置是否齐备，并通过 `/adapay/availability` 暴露。前端据此决定是否展示
 * 「电签担保」发布方式，避免出现「前端可选但提交被后端拒绝」的情况。
 *
 * 查询结果全局缓存一份，多个发布入口共用，避免重复请求。
 */

const platformGuaranteeAllowed = ref(false)
const loaded = ref(false)
let pending: Promise<void> | null = null

/**
 * 当前用户是否可使用电签担保。未加载完成时保守返回 false。
 *
 * 后端综合「配置就绪」与「仅测试角色可用」灰度后给出 `escrowAllowed`；
 * 旧响应无该字段时回退到 `paymentReady`。
 */
export const platformGuaranteeReady = computed(() => loaded.value && platformGuaranteeAllowed.value)

/** 可用性是否已加载完成，用于区分「未就绪」与「尚未知晓」。 */
export const platformGuaranteeLoaded = computed(() => loaded.value)

/**
 * 加载电签担保可用性。并发调用会复用同一个请求。
 * 失败时按不可用处理（保守降级），不影响用户以「无电签约定」正常发布。
 */
export function loadAdapayAvailability(force = false): Promise<void> {
  if (loaded.value && !force) {
    return Promise.resolve()
  }
  if (pending) {
    return pending
  }

  const auth = useAuthStore()
  auth.hydrate()
  const token = auth.token || undefined
  pending = getAdapayAvailability(token)
    .then((availability) => {
      const allowed = availability.escrowAllowed ?? availability.paymentReady
      platformGuaranteeAllowed.value = allowed === true
      // 没带令牌时问的是匿名身份。灰度期间 `escrowAllowed` 是按登录用户判的，
      // 而发布弹窗在首页就是挂载状态（`visible` 只是内层 v-if），挂载时往往还没登录完，
      // 这一问必然答「不可用」。把它当结论缓存下来，登录后就再也不会重问，
      // 「电签担保」整个页面会话都不出现——所以匿名答案不落缓存，留给下次带令牌的调用纠正。
      loaded.value = Boolean(token)
    })
    .catch(() => {
      // 接口异常时保持不可用，避免展示一个提交必然失败的选项。
      platformGuaranteeAllowed.value = false
      loaded.value = true
    })
    .finally(() => {
      pending = null
    })

  return pending
}
