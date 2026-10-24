import { useRoute, useRouter } from 'vue-router'

import { useRealnameApprovalGate } from '@/composables/useRealnameApprovalGate'
import { useAuthStore } from '@/stores/auth'

type UsePublishModalRouteOptions = {
  /** 关掉弹窗后仍停在那一页（回跳地址与摘 query 都落在这一页上）。 */
  routeName: string
  /**
   * 未登录的去向，默认站内登录页 `home?modal=auth&mode=login&redirect_to=<发布地址>`。
   * 个人中心由视图注入（那边的导航归视图管），形状与默认值一致。
   */
  onNeedLogin?: (redirectTarget: string) => void
  /** 未实名 / 被驳回 / 查无记录的去向，默认 `workbench-realname?redirect_to=<发布地址>`。 */
  onNeedRealname?: (redirectTarget: string) => void
}

/**
 * 「发布需求」弹窗所在页面的路由与门禁 —— 需求大厅 / 个人中心两份薄包装共用这一段。
 *
 * 三件事，都是拆分前各自抄过一遍的：
 * - `publishRedirectTarget()`：登录 / 实名完成后回到本页，并带上 `?modal=publish` 把弹窗重开；
 * - `ensureApproved()`：发布前的实名门禁；两个去向默认走站内登录页 / 实名页，可注入覆盖；
 * - `clearPublishModalQuery()`：只摘 `modal` 这一个键，其余 query（`settle` / OAuth 回跳参数）原样留着。
 */
export function usePublishModalRoute(options: UsePublishModalRouteOptions) {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  function publishRedirectTarget() {
    return router.resolve({
      name: options.routeName,
      query: { ...route.query, modal: 'publish' },
    }).fullPath
  }

  const gotoLogin =
    options.onNeedLogin ??
    ((redirectTarget: string) => {
      void router.push({
        name: 'home',
        query: { modal: 'auth', mode: 'login', redirect_to: redirectTarget },
      })
    })
  const gotoRealname =
    options.onNeedRealname ??
    ((redirectTarget: string) => {
      void router.push({ name: 'workbench-realname', query: { redirect_to: redirectTarget } })
    })

  const gate = useRealnameApprovalGate({
    token: () => auth.token,
    isAuthed: () => auth.isAuthed,
    hydrate: () => auth.hydrate(),
    onNeedLogin: gotoLogin,
    onNeedRealname: gotoRealname,
  })

  async function ensureApproved() {
    return gate.ensureApproved(publishRedirectTarget())
  }

  function clearPublishModalQuery() {
    if (route.query.modal !== 'publish') {
      return
    }

    const nextQuery = { ...route.query }
    delete nextQuery.modal
    void router.replace({ query: nextQuery })
  }

  return { publishRedirectTarget, ensureApproved, clearPublishModalQuery }
}
