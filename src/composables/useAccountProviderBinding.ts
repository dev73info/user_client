import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { getBoundProviders, getProviderBindUrl, unbindProvider } from '@/api/auth'
import { providerLabel } from '@/shared/accountEntries'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 第三方账号绑定域：GitHub / Gitee / QQ / 微信的绑定与解绑，
 * 以及两条**回跳 query** 的消费（`wechat_bind` / `bind`，都带一个 `*_error` 兄弟键）。
 *
 * 微信绑定只保留「跳后端签好的授权地址」这一条：2.0 契约里没有扫码绑定的状态轮询端点
 * （`/auth/wechat/bind/qr/*`），PC 端的二维码弹窗已删。
 *
 * 为什么它单独成域：这一块是唯一「点一下就离开本站」的入口——授权链接由后端签名、落地页在第三方，
 * 回来时靠 query 报结果。四份状态（已绑渠道 / 微信是否已绑 / 两个加载位 / 二维码弹窗）与
 * 「绑定 = 跳出去、解绑 = 打接口」两种口径绑在一起，摊在视图里既读不出主线，也挡着 `api-deps`。
 *
 * 微信「已绑定」的初值在 `loadBoundProviders()` 里落地：契约的档案响应没有 `wechat_bound`，
 * 绑定状态的唯一事实源是 `GET /auth/providers`。
 */
export function useAccountProviderBinding() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const wechatBindingLoading = ref(false)
  const wechatBound = ref(false)
  const boundProviders = ref<string[]>([])
  const providerBindingLoading = ref(false)

  /** 拉一次已绑渠道：失败按「没绑过」处理，入口行显示未绑定而不是卡在加载态。 */
  async function loadBoundProviders() {
    if (!auth.isAuthed) {
      return
    }
    try {
      const result = await getBoundProviders(auth.token)
      boundProviders.value = result.providers ?? []
      wechatBound.value = boundProviders.value.includes('wechat')
    } catch {
      boundProviders.value = []
      wechatBound.value = false
    }
  }

  /** 绑定 / 解绑 GitHub、Gitee、QQ：已绑则解绑，未绑则跳后端给的授权地址。 */
  async function handleProviderBinding(provider: 'github' | 'gitee' | 'qq') {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后再绑定')
      return
    }
    if (providerBindingLoading.value) {
      return
    }
    if (boundProviders.value.includes(provider)) {
      providerBindingLoading.value = true
      try {
        await unbindProvider(auth.token, provider)
        boundProviders.value = boundProviders.value.filter((item) => item !== provider)
        TMessage.success(`${providerLabel(provider)} 已解除绑定`)
      } catch (err) {
        TMessage.error(
          err instanceof Error ? err.message : `解除 ${providerLabel(provider)} 绑定失败`,
        )
      } finally {
        providerBindingLoading.value = false
      }
      return
    }

    providerBindingLoading.value = true
    try {
      const { url } = await getProviderBindUrl(auth.token, provider, window.location.href)
      if (!url.trim()) {
        throw new Error('绑定地址为空')
      }
      window.location.assign(url)
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : `发起 ${providerLabel(provider)} 绑定失败`,
      )
      providerBindingLoading.value = false
    }
  }

  /** 微信绑定：跳后端签好的授权地址（`GET /auth/wechat/bind/url`），回来靠 `wechat_bind` query 报结果。 */
  async function openWechatBinding() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后再绑定微信')
      return
    }
    if (wechatBindingLoading.value) {
      return
    }
    wechatBindingLoading.value = true
    try {
      const { url } = await getProviderBindUrl(auth.token, 'wechat', window.location.href)
      if (!url.trim()) {
        throw new Error('微信授权地址为空')
      }
      window.location.assign(url)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起微信绑定失败')
      wechatBindingLoading.value = false
    }
  }

  /** 当前契约只支持微信绑定，不支持自助解绑。 */
  async function toggleWechatBinding() {
    if (wechatBound.value) {
      TMessage.info('微信账号已绑定，暂不支持自助解除绑定')
      return
    }
    await openWechatBinding()
  }

  /**
   * 消费微信回跳 query。
   *
   * 三条 query 消费器（本条、`bind` 那条、视图里 `settle=1`）各自 `router.replace` 一次，
   * 并发时后一次会用旧快照覆盖前一次——所以每次都用**当前** `route.query` 重新展开。
   */
  function consumeWechatBindResult() {
    const result = typeof route.query.wechat_bind === 'string' ? route.query.wechat_bind.trim() : ''
    const error =
      typeof route.query.wechat_bind_error === 'string' ? route.query.wechat_bind_error.trim() : ''
    if (result === 'success') {
      TMessage.success('微信绑定成功')
    } else if (error) {
      TMessage.error(`微信绑定失败：${error}`)
    }
    if (result || error) {
      const nextQuery = { ...route.query }
      delete nextQuery.wechat_bind
      delete nextQuery.wechat_bind_error
      void router.replace({ query: nextQuery })
    }
  }

  /** 消费第三方绑定回跳 query：成功时要重新拉一次已绑渠道。 */
  function consumeProviderBindResult() {
    const result = typeof route.query.bind === 'string' ? route.query.bind.trim() : ''
    const error = typeof route.query.bind_error === 'string' ? route.query.bind_error.trim() : ''
    if (result === 'success') {
      TMessage.success('第三方账号绑定成功')
      void loadBoundProviders()
    } else if (error) {
      TMessage.error(`第三方账号绑定失败：${error}`)
    }
    if (result || error) {
      const nextQuery = { ...route.query }
      delete nextQuery.bind
      delete nextQuery.bind_error
      void router.replace({ query: nextQuery })
    }
  }

  return {
    wechatBound,
    boundProviders,
    wechatBindingLoading,
    providerBindingLoading,
    loadBoundProviders,
    handleProviderBinding,
    toggleWechatBinding,
    consumeWechatBindResult,
    consumeProviderBindResult,
  }
}
