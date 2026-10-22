import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { useAuthStore } from '@/stores/auth'

/**
 * 首页 URL 上的一次性「授权回跳」参数：`oauth_token` / `oauth_error`（第三方登录）、
 * `wechat_oauth` / `union_oauth`（支付前授权）。读一次、提示一次，然后把参数从地址栏清掉 ——
 * 不清掉的话刷新页面会重复弹 toast，`oauth_token` 还会被反复 `setToken`。
 *
 * 这一支只做「读 URL → 落 token / 弹提示 → 清参」，不碰页面状态：
 * 云闪付授权成功后要把支付方式切回 `union`，靠 `onUnionAuthorized` 回调交给支付域去落。
 *
 * `hashQueryValue` / `routeQueryValue` 一起放在这里：同一个 URL 取值口径被视图里的
 * 弹窗开关（`modal` / `mode`）、`redirect_to`、邀请码、分享参数共用，抄两份迟早跑偏。
 */
export type HomeAuthQueryOptions = {
  /** `union_oauth=success`：用户刚在云闪付页完成授权，支付方式应回落到云闪付。 */
  onUnionAuthorized?: () => void
}

export function useHomeAuthQuery(options: HomeAuthQueryOptions = {}) {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  /** hash 形态的地址（`#/?modal=publish`）里 query 取不到时兜底。 */
  function hashQueryValue(key: string) {
    const hash = route.hash.trim()
    if (!hash.startsWith('#/?')) {
      return ''
    }

    return new URLSearchParams(hash.slice(3)).get(key)?.trim() ?? ''
  }

  function routeQueryValue(key: string) {
    const value = route.query[key]
    if (typeof value === 'string') {
      return value.trim()
    }
    return hashQueryValue(key)
  }

  /**
   * 消费授权回跳参数。三段顺序与拆出前逐行一致：先登录态（`oauth_token` / `oauth_error`），
   * 再微信、云闪付的授权结果，最后统一 `router.replace` 把参数清掉。
   */
  function consumeAuthQuery() {
    const oauthToken =
      typeof route.query.oauth_token === 'string' ? route.query.oauth_token.trim() : ''
    const oauthError =
      typeof route.query.oauth_error === 'string' ? route.query.oauth_error.trim() : ''

    if (oauthToken) {
      auth.setToken(oauthToken)
      TMessage.success('登录成功')
      void router.replace({ query: {} })
    } else if (oauthError) {
      TMessage.error(`登录失败: ${oauthError}`)
      const nextQuery = { ...route.query }
      delete nextQuery.oauth_token
      delete nextQuery.oauth_error
      void router.replace({ query: nextQuery })
    }

    const wechatOauthResult = routeQueryValue('wechat_oauth')
    const wechatOauthError = routeQueryValue('wechat_oauth_error')
    const unionOauthResult = routeQueryValue('union_oauth')
    const unionOauthError = routeQueryValue('union_oauth_error')
    if (wechatOauthResult === 'success') {
      TMessage.success('微信授权成功，请再次点击支付')
    } else if (wechatOauthError) {
      TMessage.error(`微信授权失败：${wechatOauthError}`)
    }
    if (unionOauthResult === 'success') {
      options.onUnionAuthorized?.()
      TMessage.success('云闪付授权成功，请再次点击支付')
    } else if (unionOauthError) {
      TMessage.error(`云闪付授权失败：${unionOauthError}`)
    }
    if (wechatOauthResult || wechatOauthError || unionOauthResult || unionOauthError) {
      const nextQuery = { ...route.query }
      delete nextQuery.wechat_oauth
      delete nextQuery.wechat_oauth_error
      delete nextQuery.union_oauth
      delete nextQuery.union_oauth_error
      void router.replace({ query: nextQuery })
    }
  }

  return { hashQueryValue, routeQueryValue, consumeAuthQuery }
}
