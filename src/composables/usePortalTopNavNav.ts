import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { buildDevPortalUrl } from '@/config/runtime'
import { useAuthStore } from '@/stores/auth'

export type AuthMode = 'login' | 'register'

export type HeaderLink = {
  label: string
  to?: { name: string }
  href?: string
  active?: boolean
}

/**
 * 顶栏的导航出口：导航链接清单、开发者区判定，以及**全部** `router.push` / `auth.logout`。
 *
 * 抽出来的目的是让顶栏与它拆出的三个子组件都不直接碰 router：子组件只发事件
 * （点工作台 / 退出登录 / 提交搜索），改路由的动作一律回到这里。
 */
export function usePortalTopNavNav() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const authModalVisible = computed(() => route.query.modal === 'auth')
  // 开发者工作台已并入统一工作台外壳（/workbench/developer/**），顶栏跟随整站样式，
  // 不再单开紧凑版式；只有遗留的独立 /dev 页面（如开发者入驻协议）保留 dev 版式。
  const isDeveloperArea = computed(() => route.path.startsWith('/dev'))

  const headerLinks = computed<HeaderLink[]>(() => {
    const currentName = String(route.name ?? '')
    const allowActive = !authModalVisible.value

    const onResourceCatalog =
      currentName === 'resource-catalog' || currentName === 'resource-detail'
    // 「资源项目」把原「免费资源」「付费资源」两项并成一项：两个分区都算在这一项下
    const onResources = currentName === 'resources' || onResourceCatalog

    const links: HeaderLink[] = [
      { label: '首页', to: { name: 'home' }, active: allowActive && currentName === 'home' },
      {
        label: '资源项目',
        to: { name: 'resources' },
        active: allowActive && onResources,
      },
      {
        label: '需求大厅',
        to: { name: 'requirement-hall' },
        active: allowActive && (currentName === 'requirement-hall' || currentName === 'payment'),
      },
      {
        label: '社区',
        to: { name: 'community' },
        active: allowActive && ['community', 'community-post'].includes(currentName),
      },
      // 积分商城是公开的兑换入口，不需要登录，所以挂在顶栏而不是工作台里。
      {
        label: '积分商城',
        to: { name: 'mall' },
        active: allowActive && currentName === 'mall',
      },
    ]

    if (auth.isAuthed) {
      links.push({
        label: '工作台',
        to: { name: 'workbench' },
        active: allowActive && route.path.startsWith('/workbench'),
      })
    }

    return links
  })

  function openAuth(mode: AuthMode) {
    const nextQuery: Record<string, string> = { modal: 'auth', mode }
    const redirectTarget =
      typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''

    if (redirectTarget && redirectTarget.startsWith('/') && !redirectTarget.startsWith('//')) {
      nextQuery.redirect_to = redirectTarget
    }

    void router.push({ name: 'home', query: nextQuery })
  }

  function goWorkbench() {
    void router.push({ name: 'workbench' })
  }

  function openDevWorkbench() {
    void router.push(buildDevPortalUrl(auth.token))
  }

  function logout() {
    auth.logout()
    void router.push({ name: 'home' })
  }

  return {
    authModalVisible,
    isDeveloperArea,
    headerLinks,
    openAuth,
    goWorkbench,
    openDevWorkbench,
    logout,
  }
}
