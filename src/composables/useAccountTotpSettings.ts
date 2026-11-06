import { ref } from 'vue'

import {
  disableProfileTotp,
  enableProfileTotp,
  getProfileTotp,
  setupProfileTotp,
  type ProfileTotpSetup,
} from '@/api/settings'
import { HttpError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/** 身份验证器（TOTP）域：状态、绑定草稿、启用 / 停用与错误文案。 */
export function useAccountTotpSettings() {
  const auth = useAuthStore()

  const totpEnabled = ref(false)
  const totpConfirmedAt = ref<string | null>(null)
  const totpStatusLoading = ref(false)

  const totpSetup = ref<ProfileTotpSetup | null>(null)
  const totpSetupLoading = ref(false)
  const totpBindCode = ref('')
  const totpEnableSubmitting = ref(false)

  const totpDisableVisible = ref(false)
  const totpDisableCode = ref('')
  const totpDisableSubmitting = ref(false)

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof HttpError) {
      if (err.code === 'TOTP_CODE_INVALID') return '动态码不正确'
      if (err.code === 'TOTP_SECRET_MISSING') return '绑定信息已失效，请重新生成二维码'
      if (err.code === 'TOTP_ALREADY_ENABLED') return '身份验证器已启用'
      if (err.status === 429) return '请求过于频繁，请稍后再试'
      return err.message || fallback
    }
    return fallback
  }

  async function loadTotpStatus() {
    if (!auth.isAuthed) {
      return
    }
    totpStatusLoading.value = true
    try {
      const status = await getProfileTotp(auth.token)
      totpEnabled.value = status.enabled
      totpConfirmedAt.value = status.confirmed_at ?? null
    } catch (err) {
      TMessage.error(errorMessage(err, '加载身份验证器状态失败'))
    } finally {
      totpStatusLoading.value = false
    }
  }

  /** 生成待确认密钥：成功后面板展开二维码与手动密钥。 */
  async function startTotpSetup() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后修改两步验证')
      return
    }
    totpSetupLoading.value = true
    try {
      totpSetup.value = await setupProfileTotp(auth.token)
      totpBindCode.value = ''
    } catch (err) {
      TMessage.error(errorMessage(err, '生成绑定密钥失败'))
    } finally {
      totpSetupLoading.value = false
    }
  }

  function cancelTotpSetup() {
    totpSetup.value = null
    totpBindCode.value = ''
  }

  async function confirmEnableTotp() {
    const code = totpBindCode.value.trim()
    if (code.length !== 6) {
      TMessage.error('请输入 6 位动态码')
      return
    }
    totpEnableSubmitting.value = true
    try {
      await enableProfileTotp(auth.token, code)
      totpSetup.value = null
      totpBindCode.value = ''
      TMessage.success('身份验证器已启用')
      await loadTotpStatus()
      await auth.fetchProfile(true).catch(() => undefined)
    } catch (err) {
      TMessage.error(errorMessage(err, '启用身份验证器失败'))
    } finally {
      totpEnableSubmitting.value = false
    }
  }

  function startTotpDisable() {
    totpDisableCode.value = ''
    totpDisableVisible.value = true
  }

  function cancelTotpDisable() {
    totpDisableVisible.value = false
    totpDisableCode.value = ''
  }

  async function confirmDisableTotp() {
    const code = totpDisableCode.value.trim()
    if (code.length !== 6) {
      TMessage.error('请输入 6 位动态码')
      return
    }
    totpDisableSubmitting.value = true
    try {
      await disableProfileTotp(auth.token, code)
      totpDisableVisible.value = false
      totpDisableCode.value = ''
      TMessage.success('身份验证器已停用')
      await loadTotpStatus()
      await auth.fetchProfile(true).catch(() => undefined)
    } catch (err) {
      TMessage.error(errorMessage(err, '停用身份验证器失败'))
    } finally {
      totpDisableSubmitting.value = false
    }
  }

  async function copyTotpSecret() {
    if (!totpSetup.value) {
      return
    }
    try {
      await navigator.clipboard.writeText(totpSetup.value.secret)
      TMessage.success('密钥已复制')
    } catch {
      TMessage.error('复制失败，请手动选择密钥')
    }
  }

  return {
    totpEnabled,
    totpConfirmedAt,
    totpStatusLoading,
    totpSetup,
    totpSetupLoading,
    totpBindCode,
    totpEnableSubmitting,
    totpDisableVisible,
    totpDisableCode,
    totpDisableSubmitting,
    loadTotpStatus,
    startTotpSetup,
    cancelTotpSetup,
    confirmEnableTotp,
    startTotpDisable,
    cancelTotpDisable,
    confirmDisableTotp,
    copyTotpSecret,
  }
}
