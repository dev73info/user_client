import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getBoundProviders,
  getProviderBindUrl,
  getWechatBindQrUrl,
  unbindProvider,
} from '@/api/auth'
import { describeBackendError } from '@/shared/backendErrorText'
import { providerLabel } from '@/shared/accountEntries'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export function useAccountProviderBinding() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const wechatBindingLoading = ref(false)
  const wechatBound = ref(false)
  const boundProviders = ref<string[]>([])
  const providerBindingLoading = ref(false)
  const loadError = ref('')
  const wechatBindQr = reactive({ visible: false, url: '', state: '', pollSecret: '' })

  async function loadBoundProviders() {
    if (!auth.isAuthed) return
    loadError.value = ''
    try {
      const result = await getBoundProviders(auth.token)
      boundProviders.value = result.providers ?? []
      wechatBound.value = boundProviders.value.includes('wechat')
    } catch (err) {
      loadError.value = describeBackendError(err, '加载第三方绑定状态失败')
    }
  }

  async function handleProviderBinding(provider: 'github' | 'gitee' | 'qq') {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后再绑定')
      return
    }
    if (providerBindingLoading.value) return
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
      if (!url.trim()) throw new Error('绑定地址为空')
      window.location.assign(url)
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : `发起 ${providerLabel(provider)} 绑定失败`,
      )
      providerBindingLoading.value = false
    }
  }

  async function openWechatBinding() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后再绑定微信')
      return
    }
    if (wechatBindingLoading.value) return
    wechatBindingLoading.value = true
    try {
      if (/MicroMessenger/i.test(navigator.userAgent)) {
        const { url } = await getProviderBindUrl(auth.token, 'wechat', window.location.href)
        if (!url.trim()) throw new Error('微信授权地址为空')
        window.location.assign(url)
        return
      }
      const qr = await getWechatBindQrUrl(auth.token, window.location.href)
      if (!qr.url.trim() || !qr.state.trim() || !qr.poll_secret.trim()) {
        throw new Error('微信绑定二维码或轮询凭据为空')
      }
      Object.assign(wechatBindQr, {
        visible: true,
        url: qr.url,
        state: qr.state,
        pollSecret: qr.poll_secret,
      })
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发起微信绑定失败')
    } finally {
      wechatBindingLoading.value = false
    }
  }

  async function toggleWechatBinding() {
    if (!wechatBound.value) {
      await openWechatBinding()
      return
    }
    if (wechatBindingLoading.value) return
    wechatBindingLoading.value = true
    try {
      await unbindProvider(auth.token, 'wechat')
      wechatBound.value = false
      boundProviders.value = boundProviders.value.filter((item) => item !== 'wechat')
      TMessage.success('微信已解除绑定')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '解除微信绑定失败')
    } finally {
      wechatBindingLoading.value = false
    }
  }

  function closeWechatBindQr() {
    Object.assign(wechatBindQr, { visible: false, url: '', state: '', pollSecret: '' })
  }

  async function handleWechatBound(result: { success: boolean; error?: string }) {
    closeWechatBindQr()
    if (!result.success) {
      TMessage.error(`微信绑定失败：${result.error ?? '未完成'}`)
      return
    }
    TMessage.success('微信绑定成功')
    await loadBoundProviders()
  }

  function consumeWechatBindResult() {
    const result = typeof route.query.wechat_bind === 'string' ? route.query.wechat_bind.trim() : ''
    const error =
      typeof route.query.wechat_bind_error === 'string' ? route.query.wechat_bind_error.trim() : ''
    if (result === 'success') {
      TMessage.success('微信绑定成功')
      void loadBoundProviders()
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
    loadError,
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
