import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { notificationsItem, overviewItem, ticketsItem } from '@/shared/workbenchMenu'
import {
  isMessagesRouteName,
  messagesRouteNameFor,
  notificationsRouteNameFor,
  ticketsRouteNameFor,
  workbenchBrandTitleFor,
} from '@/shared/workbenchRoutes'

/** 模式切换按钮上那圈图标的转动时长：与样式里的 `workbench-mode-spin` 动画同长。 */
const MODE_SWITCH_SPIN_MS = 360

/**
 * 工作台模式（用户 / 开发者）：跟着路由走，命中 `devArea` 路由就是开发者模式。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。这里是**唯一**计算模式的地方：
 * 侧边栏换整条菜单、品牌标题、消息 / 工单 / 系统通知三条路由各自指向哪一端，都以它为准。
 */
export function useWorkbenchMode(options: { closeMobileMenu: () => void }) {
  const route = useRoute()
  const router = useRouter()

  // 工作台模式跟随路由：命中 devArea 路由时侧边栏整体换成开发者菜单，回到用户端页面即自动切回。
  const isDevWorkbenchMode = computed(() =>
    route.matched.some((record) => Boolean(record.meta.devArea)),
  )

  /** 侧栏菜单与主内容的过渡 key：模式一变整块换掉，做 out-in 淡入淡出。 */
  const workbenchModeKey = computed(() => (isDevWorkbenchMode.value ? 'dev' : 'user'))
  const workbenchBrandTitle = computed(() => workbenchBrandTitleFor(isDevWorkbenchMode.value))

  // 消息中心 / 工单中心 / 系统通知：两种工作台各有一条路由，页面内的高亮与链接跟着当前模式走。
  const messagesRouteName = computed(() => messagesRouteNameFor(isDevWorkbenchMode.value))
  const isMessagesRoute = computed(() => isMessagesRouteName(route.name))
  const ticketsRouteName = computed(() => ticketsRouteNameFor(isDevWorkbenchMode.value))
  const notificationsRouteName = computed(() => notificationsRouteNameFor(isDevWorkbenchMode.value))
  const ticketsMenuItem = computed(() => ({ ...ticketsItem, name: ticketsRouteName.value }))
  const notificationsMenuItem = computed(() => ({
    ...notificationsItem,
    name: notificationsRouteName.value,
  }))

  const modeSwitching = ref(false)
  const modeSwitchSpinning = ref(false)
  let modeSwitchSpinTimer: ReturnType<typeof setTimeout> | null = null

  // 切换工作台：立刻换路由，侧栏菜单与主内容用 out-in 交叉淡入淡出；按钮图标用 CSS 转一圈。
  async function switchWorkbenchMode() {
    if (modeSwitching.value) return
    const targetName = isDevWorkbenchMode.value ? overviewItem.name : 'dev-home'
    if (route.name === targetName) return

    options.closeMobileMenu()
    modeSwitching.value = true
    modeSwitchSpinning.value = true
    if (modeSwitchSpinTimer) {
      clearTimeout(modeSwitchSpinTimer)
      modeSwitchSpinTimer = null
    }
    try {
      await router.push({ name: targetName })
      await nextTick()
    } finally {
      modeSwitching.value = false
      modeSwitchSpinTimer = setTimeout(() => {
        modeSwitchSpinning.value = false
        modeSwitchSpinTimer = null
      }, MODE_SWITCH_SPIN_MS)
    }
  }

  onBeforeUnmount(() => {
    if (modeSwitchSpinTimer) {
      clearTimeout(modeSwitchSpinTimer)
      modeSwitchSpinTimer = null
    }
  })

  return {
    isDevWorkbenchMode,
    workbenchModeKey,
    workbenchBrandTitle,
    messagesRouteName,
    isMessagesRoute,
    ticketsRouteName,
    notificationsRouteName,
    ticketsMenuItem,
    notificationsMenuItem,
    modeSwitching,
    modeSwitchSpinning,
    switchWorkbenchMode,
  }
}
