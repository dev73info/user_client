import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { closeAccount } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 注销账号（整个账号，不是结算账户）的弹窗域。
 *
 * 与「注销结算账户」分开：那一个是渠道侧的收款账户（`useSettlementAccount` 里的
 * `closeSettle*`），只影响收款；这一个会释放第三方绑定、把人踢下线并回首页，破坏性更强，
 * 所以确认词、加载位与路由跳转都单独归这里，免得两种「注销」共用一个域、改一处连累另一处。
 *
 * 确认词必须原样键入「注销账号」，「确认注销」才点得动。
 */
export function useAccountCloseAccount() {
  const auth = useAuthStore()
  const router = useRouter()

  const accountCloseDialogVisible = ref(false)
  const accountCloseConfirmation = ref('')
  const accountClosing = ref(false)
  const accountCloseReady = computed(() => accountCloseConfirmation.value.trim() === '注销账号')

  /** 每次打开前清空确认词（与拆分前同口径）。 */
  function openAccountCloseDialog() {
    accountCloseConfirmation.value = ''
    accountCloseDialogVisible.value = true
  }

  async function handleCloseAccount() {
    if (!auth.isAuthed) {
      TMessage.error('请先登录后注销账号')
      return
    }
    if (!accountCloseReady.value) {
      TMessage.warning('请输入“注销账号”确认操作')
      return
    }

    accountClosing.value = true
    try {
      await closeAccount(auth.token)
      accountCloseDialogVisible.value = false
      auth.logout()
      TMessage.success('账号已注销，第三方绑定已释放')
      await router.replace({ name: 'home' })
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '注销账号失败')
    } finally {
      accountClosing.value = false
    }
  }

  return {
    accountCloseDialogVisible,
    accountCloseConfirmation,
    accountClosing,
    accountCloseReady,
    openAccountCloseDialog,
    handleCloseAccount,
  }
}
