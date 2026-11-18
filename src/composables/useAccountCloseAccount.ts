import { computed, ref } from 'vue'

import {
  cancelAccountClose,
  getAccountCloseRequest,
  requestAccountClose,
  sendAccountCloseCode,
} from '@/api/auth'
import type { AccountCloseRequestResp } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 注销账号（整个账号，不是结算账户）的申请域。
 *
 * 与「注销结算账户」分开：那一个是渠道侧的收款账户（`useSettlementAccount` 里的
 * `closeSettle*`），只影响收款；这一个走「验证码申请 + 等待期」流程，破坏性更强，
 * 所以确认词、申请状态与撤销都单独归这里。
 *
 * 提交申请不会退出登录；等待期结束后后端在下次登录 / 鉴权时惰性落地软注销。
 */
export function useAccountCloseAccount() {
  const auth = useAuthStore()

  const accountCloseDialogVisible = ref(false)
  const accountCloseConfirmation = ref('')
  const accountCloseEmailCode = ref('')
  const accountClosing = ref(false)
  const accountCloseCodeSending = ref(false)
  const accountCloseLoading = ref(false)
  const accountCloseRequest = ref<AccountCloseRequestResp | null>(null)
  const accountClosePending = computed(() => Boolean(accountCloseRequest.value?.pending))
  const accountCloseReady = computed(
    () =>
      !accountClosePending.value &&
      accountCloseConfirmation.value.trim() === '注销账号' &&
      /^\d{6}$/.test(accountCloseEmailCode.value.trim()),
  )

  async function loadAccountCloseStatus(showError = true) {
    if (!auth.isAuthed) return
    accountCloseLoading.value = true
    try {
      accountCloseRequest.value = await getAccountCloseRequest(auth.token)
    } catch (err) {
      if (showError) {
        TMessage.error(err instanceof Error ? err.message : '加载注销申请状态失败')
      }
    } finally {
      accountCloseLoading.value = false
    }
  }

  /** 每次打开前清空草稿，并读取当前是否已有待生效申请。 */
  function openAccountCloseDialog() {
    accountCloseConfirmation.value = ''
    accountCloseEmailCode.value = ''
    accountCloseDialogVisible.value = true
    void loadAccountCloseStatus()
  }

  async function handleSendAccountCloseCode() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后注销账号')
      return
    }
    if (accountCloseCodeSending.value) return
    accountCloseCodeSending.value = true
    try {
      await sendAccountCloseCode(auth.token)
      TMessage.success('验证码已发送到当前账号邮箱')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '发送注销验证码失败')
    } finally {
      accountCloseCodeSending.value = false
    }
  }

  async function handleCloseAccount() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后注销账号')
      return
    }
    if (!accountCloseReady.value) {
      TMessage.warning(
        accountClosePending.value ? '注销申请已在处理中' : '请输入“注销账号”和邮箱验证码',
      )
      return
    }

    accountClosing.value = true
    try {
      const request = await requestAccountClose(auth.token, accountCloseEmailCode.value.trim())
      accountCloseRequest.value = request
      accountCloseEmailCode.value = ''
      const days = request.days_remaining ?? 0
      TMessage.success(`注销申请已提交，将在 ${days} 天后生效`)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '提交注销申请失败')
    } finally {
      accountClosing.value = false
    }
  }

  async function handleCancelAccountClose() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后撤销注销申请')
      return
    }
    if (accountClosing.value) return
    accountClosing.value = true
    try {
      await cancelAccountClose(auth.token)
      accountCloseRequest.value = {
        pending: false,
        requested_at: null,
        effective_at: null,
        days_remaining: null,
      }
      TMessage.success('注销申请已撤销')
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '撤销注销申请失败')
    } finally {
      accountClosing.value = false
    }
  }

  return {
    accountCloseDialogVisible,
    accountCloseConfirmation,
    accountCloseEmailCode,
    accountClosing,
    accountCloseCodeSending,
    accountCloseLoading,
    accountCloseRequest,
    accountClosePending,
    accountCloseReady,
    openAccountCloseDialog,
    loadAccountCloseStatus,
    handleSendAccountCloseCode,
    handleCloseAccount,
    handleCancelAccountClose,
  }
}
