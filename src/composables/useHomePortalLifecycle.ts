import { onBeforeUnmount, onMounted, watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

/** 首屏数据与列表的刷新周期：5 分钟，且只在页面可见、没有发布 / 支付 / 登录在途时跑。 */
const AUTO_REFRESH_INTERVAL_MS = 300_000

export type HomePortalLifecycleOptions = {
  /** 视图那一份卸载标记的写入口（`let isMounted = true` 由视图持有）。 */
  markUnmounted: () => void
  /** 侧栏签到状态（`useHomeCheckin.load`）。 */
  loadCheckin: () => Promise<void>
  /** 一次性授权回跳参数（登录 / 微信 / 云闪付）的消费。 */
  consumeAuthQuery: () => void
  /** 押金比例（支付域）：首屏拉一次，轮询时只有已登录才拉。 */
  loadDepositRatio: () => Promise<void>
  loadPendingRequirements: (background?: boolean) => Promise<void>
  loadRequirementOverview: () => Promise<void>
  loadPublicPortalData: (background?: boolean) => Promise<void>
  /** 有写操作在途时跳过轮询：发布、支付、登录三态任一为真。 */
  isBusy: () => boolean
}

/**
 * 门户首页的页面生命周期（R047 从 `views/HomeView.vue` 拆出）：首屏、登录态变化、5 分钟轮询、卸载清理。
 *
 * 拆出前这一段在视图里占 80 余行，且与「谁持有卸载标记」耦合：`isMounted` 仍是视图那一份
 * （各 composable 只收只读 getter），这里通过 `markUnmounted` 回写，不另存一个标记。
 *
 * 时序与拆出前逐条一致：
 * - `onMounted`：SEO → `auth.hydrate()` → 签到 → 消费授权回跳参数 → 四批数据并发 → 起轮询；
 * - `watch(auth.isAuthed)`：签到与被点赞状态重拉（`loadPublicPortalData(true)`）；
 * - 轮询：页面不可见、或有写在途时整轮跳过；同一轮不重入（`autoRefreshInFlight`）；
 * - `onBeforeUnmount`：置卸载标记、恢复 SEO、停轮询（表单状态由 `useHomePortalAuth` 自己清）。
 */
export function useHomePortalLifecycle(options: HomePortalLifecycleOptions) {
  const auth = useAuthStore()

  let autoRefreshTimer: ReturnType<typeof setInterval> | null = null
  let autoRefreshInFlight = false

  /** 登录成功 / 首屏要重拉的四批数据（押金比例 + 待办需求 + 平台概览 + 公开资源）。 */
  async function refreshPortalData() {
    await Promise.all([
      options.loadDepositRatio(),
      options.loadPendingRequirements(),
      options.loadRequirementOverview(),
      options.loadPublicPortalData(),
    ])
  }

  async function runBackgroundAutoRefresh() {
    if (autoRefreshInFlight) {
      return
    }

    autoRefreshInFlight = true
    try {
      if (auth.isAuthed) {
        await Promise.all([
          options.loadDepositRatio(),
          options.loadPendingRequirements(true),
          options.loadRequirementOverview(),
          options.loadPublicPortalData(true),
        ])
      } else {
        await Promise.all([
          options.loadPendingRequirements(true),
          options.loadRequirementOverview(),
          options.loadPublicPortalData(true),
        ])
      }
    } finally {
      autoRefreshInFlight = false
    }
  }

  watch(
    () => auth.isAuthed,
    () => {
      void options.loadCheckin()
      // 登录态变化后重拉公开资源，补齐 / 清空 liked_by_me。
      void options.loadPublicPortalData(true)
    },
  )

  onMounted(() => {
    setSeoMeta({
      title: '73Info 柒叁信息 - 资源与需求协作平台',
      description:
        '73Info 柒叁信息面向网站开发和小工具场景提供免费资源浏览、需求发布、开发者协作、沟通记录、工单跟进与合规说明服务。',
      path: '/',
    })

    auth.hydrate()
    void options.loadCheckin()

    // 紧接登录态：先消费一次性的授权回跳参数（登录 / 微信 / 云闪付），并清掉地址栏上的那份。
    options.consumeAuthQuery()

    void refreshPortalData()

    autoRefreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return
      }
      if (options.isBusy() || auth.loading) {
        return
      }
      void runBackgroundAutoRefresh()
    }, AUTO_REFRESH_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    options.markUnmounted()
    resetSeoMeta()
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer)
      autoRefreshTimer = null
    }
  })

  return { refreshPortalData }
}
