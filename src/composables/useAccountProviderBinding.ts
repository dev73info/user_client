import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getBoundProviders,
  getProviderUnbindUrl,
  getProviderBindUrl,
  getQqUnbindQrUrl,
  getWechatUnbindQrUrl,
  getWechatBindQrUrl,
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
  const providerQr = reactive<{
    visible: boolean
    provider: 'wechat' | 'qq'
    mode: 'bind' | 'unbind'
    url: string
    state: string
    pollSecret: string
  }>({
    visible: false,
    provider: 'wechat',
    mode: 'bind',
    url: '',
    state: '',
    pollSecret: '',
  })

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
        if (provider === 'github' || provider === 'gitee') {
          const { url } = await getProviderUnbindUrl(auth.token, provider, window.location.href)
          if (!url.trim()) throw new Error('解绑验证地址为空')
          window.location.assign(url)
          return
        }
        await openProviderQr('qq', 'unbind')
      } catch (err) {
        TMessage.error(
          err instanceof Error ? err.message : `发起 ${providerLabel(provider)} 解绑验证失败`,
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

  async function openProviderQr(provider: 'wechat' | 'qq', mode: 'bind' | 'unbind') {
    const qr =
      provider === 'qq'
        ? await getQqUnbindQrUrl(auth.token, window.location.href)
        : mode === 'unbind'
          ? await getWechatUnbindQrUrl(auth.token, window.location.href)
          : await getWechatBindQrUrl(auth.token, window.location.href)
    if (!qr.url.trim() || !qr.state.trim() || !qr.poll_secret.trim()) {
      throw new Error(
        `${providerLabel(provider)}${mode === 'unbind' ? '解绑' : '绑定'}二维码或轮询凭据为空`,
      )
    }
    Object.assign(providerQr, {
      visible: true,
      provider,
      mode,
      url: qr.url,
      state: qr.state,
      pollSecret: qr.poll_secret,
    })
  }

  async function openWechatBinding(mode: 'bind' | 'unbind' = 'bind') {
    if (!auth.isAuthed) {
      TMessage.error(`请先登录后再${mode === 'unbind' ? '解绑' : '绑定'}微信`)
      return
    }
    if (wechatBindingLoading.value) return
    wechatBindingLoading.value = true
    try {
      if (/MicroMessenger/i.test(navigator.userAgent)) {
        const { url } =
          mode === 'unbind'
            ? await getWechatUnbindQrUrl(auth.token, window.location.href)
            : await getProviderBindUrl(auth.token, 'wechat', window.location.href)
        if (!url.trim()) throw new Error('微信授权地址为空')
        window.location.assign(url)
        return
      }
      await openProviderQr('wechat', mode)
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : `发起微信${mode === 'unbind' ? '解绑' : '绑定'}失败`,
      )
    } finally {
      wechatBindingLoading.value = false
    }
  }

  async function toggleWechatBinding() {
    if (!wechatBound.value) {
      await openWechatBinding('bind')
      return
    }
    await openWechatBinding('unbind')
  }

  function closeProviderQr() {
    Object.assign(providerQr, {
      visible: false,
      provider: 'wechat',
      mode: 'bind',
      url: '',
      state: '',
      pollSecret: '',
    })
  }

  async function handleProviderQrCompleted(result: { success: boolean; error?: string }) {
    const { provider, mode } = providerQr
    closeProviderQr()
    const label = providerLabel(provider)
    const action = mode === 'unbind' ? '解绑' : '绑定'
    if (!result.success) {
      TMessage.error(`${label}${action}失败：${result.error ?? '未完成'}`)
      return
    }
    TMessage.success(`${label}${mode === 'unbind' ? '已解除绑定' : '绑定成功'}`)
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

  function consumeProviderUnbindResult() {
    const result = typeof route.query.unbind === 'string' ? route.query.unbind.trim() : ''
    const error =
      typeof route.query.unbind_error === 'string' ? route.query.unbind_error.trim() : ''
    if (result === 'success') {
      TMessage.success('第三方账号已解除绑定')
      void loadBoundProviders()
    } else if (error) {
      TMessage.error(`第三方账号解绑失败：${error}`)
    }
    if (result || error) {
      const nextQuery = { ...route.query }
      delete nextQuery.unbind
      delete nextQuery.unbind_error
      void router.replace({ query: nextQuery })
    }
  }

  return {
    wechatBound,
    boundProviders,
    wechatBindingLoading,
    providerBindingLoading,
    loadError,
    providerQr,
    loadBoundProviders,
    handleProviderBinding,
    toggleWechatBinding,
    closeProviderQr,
    handleProviderQrCompleted,
    consumeWechatBindResult,
    consumeProviderBindResult,
    consumeProviderUnbindResult,
  }
}
