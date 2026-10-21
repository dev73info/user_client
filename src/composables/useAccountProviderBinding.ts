import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getBoundProviders,
  getProviderBindUrl,
  getWechatBindAuthorizeUrl,
  getWechatBindQrUrl,
  unbindProvider,
} from '@/api/auth'
import { providerLabel } from '@/shared/accountEntries'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 第三方账号绑定域：GitHub / Gitee / QQ 的绑定与解绑、微信扫码绑定（PC 出二维码、微信内走授权页），
 * 以及两条**回跳 query** 的消费（`wechat_bind` / `bind`，都带一个 `*_error` 兄弟键）。
 *
 * 为什么它单独成域：这一块是唯一「点一下就离开本站」的入口——授权链接由后端签名、落地页在第三方，
 * 回来时靠 query 报结果。四份状态（已绑渠道 / 微信是否已绑 / 两个加载位 / 二维码弹窗）与
 * 「绑定 = 跳出去、解绑 = 打接口」两种口径绑在一起，摊在视图里既读不出主线，也挡着 `api-deps`。
 *
 * 微信「已绑定」的初值由 `useAccountSecuritySettings.loadProfile()` 读到后回写（视图把
 * `applyWechatBound` 接到本域的 `wechatBound` 上）：同一个 `getProfile` 不打两遍。
 */
export function useAccountProviderBinding() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const wechatBindingLoading = ref(false)
  const wechatBound = ref(false)
  const boundProviders = ref<string[]>([])
  const providerBindingLoading = ref(false)

  // PC 端扫码绑定：展示二维码并轮询绑定结果
  const wechatBindQr = reactive({ visible: false, url: '', state: '' })

  /** 微信内打开时只能走服务号网页授权（拿不到摄像头扫码的容器），其余走二维码。 */
  function isWechatBrowser() {
    return /MicroMessenger/i.test(navigator.userAgent)
  }

  /** 拉一次已绑渠道：失败按「没绑过」处理，入口行显示未绑定而不是卡在加载态。 */
  async function loadBoundProviders() {
    if (!auth.isAuthed) {
      return
    }
    try {
      const result = await getBoundProviders(auth.token)
      boundProviders.value = result.providers ?? []
    } catch {
      boundProviders.value = []
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

  /** 微信绑定：微信内跳服务号网页授权，PC 端出二维码。 */
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
      if (isWechatBrowser()) {
        const { url } = await getWechatBindAuthorizeUrl(auth.token, window.location.href)
        if (!url.trim()) {
          throw new Error('微信授权地址为空')
        }
        window.location.assign(url)
        return
      }

      const qr = await getWechatBindQrUrl(auth.token, window.location.href)
      if (!qr.url.trim() || !qr.state.trim()) {
        throw new Error('微信绑定二维码地址为空')
      }
      wechatBindQr.url = qr.url
      wechatBindQr.state = qr.state
      wechatBindQr.visible = true
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起微信绑定失败')
    } finally {
      wechatBindingLoading.value = false
    }
  }

  async function unbindWechat() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后再解除微信绑定')
      return
    }
    if (wechatBindingLoading.value) {
      return
    }
    wechatBindingLoading.value = true
    try {
      await unbindProvider(auth.token, 'wechat')
      wechatBound.value = false
      TMessage.success('微信已解除绑定')
      await auth.fetchProfile(true).catch(() => undefined)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '解除微信绑定失败')
    } finally {
      wechatBindingLoading.value = false
    }
  }

  /** 入口行只有一行动作：已绑就解绑，未绑就走绑定（微信内 / 扫码两条路）。 */
  async function toggleWechatBinding() {
    if (wechatBound.value) {
      await unbindWechat()
      return
    }
    await openWechatBinding()
  }

  function closeWechatBindQr() {
    wechatBindQr.visible = false
    wechatBindQr.url = ''
    wechatBindQr.state = ''
  }

  /** 二维码弹窗回报轮询结果：成功后要与 profile 对齐（`auth` 里那份缓存要作废）。 */
  async function handleWechatBound(result: { success: boolean; error?: string }) {
    closeWechatBindQr()
    if (result.success) {
      wechatBound.value = true
      TMessage.success('微信绑定成功')
      await auth.fetchProfile(true).catch(() => undefined)
    } else {
      TMessage.error(`微信绑定失败：${result.error ?? '未完成'}`)
    }
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
    wechatBindQr,
    loadBoundProviders,
    handleProviderBinding,
    toggleWechatBinding,
    closeWechatBindQr,
    handleWechatBound,
    consumeWechatBindResult,
    consumeProviderBindResult,
  }
}
