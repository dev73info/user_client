import { ref } from 'vue'

import { createSealMakeOnline, getMySeals, type MySealsData } from '@/api/asignAccount'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 印章管理弹窗域（企业电子印章，由爱签生成，用于合同盖章）。
 *
 * 印章列表**按需加载**：点开弹窗才查爱签，不在账号页加载时预取——账号页每次进来都会打一串
 * 接口，再多一次爱签查询只为渲染一句「已生成 / 待生成」不值当，所以入口行也不做状态胶囊，
 * 只有图标 + 主标题 + 副说明。
 *
 * 「修改企业信息」要切到爱签账户弹窗（改名会自动重新生成印章），两个入口语义相邻，
 * 这里只接一个回调，不自己持有爱签域的实例。
 */
export function useAccountSeal(options: { openCompanyInfo: () => void }) {
  const auth = useAuthStore()

  const sealDialogVisible = ref(false)
  const sealLoading = ref(false)
  const sealError = ref('')
  const sealData = ref<MySealsData | null>(null)
  const sealMakeLoading = ref(false)

  /** 登录态守卫：本域的两条动作要用（与 `useAsignAccount` 里那份同一段提示）。 */
  function requireToken(): boolean {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }
    return true
  }

  function openSealDialog() {
    sealDialogVisible.value = true
    sealData.value = null
    sealError.value = ''
    void loadMySeals()
  }

  async function loadMySeals() {
    if (!requireToken()) return
    sealLoading.value = true
    sealError.value = ''
    try {
      const res = await getMySeals(auth.token)
      if (res.success) {
        sealData.value = res.data ?? null
      } else {
        sealError.value = '暂时查不到企业印章，请稍后重试'
      }
    } catch (err) {
      sealError.value = err instanceof Error ? err.message : '查询企业印章失败'
    } finally {
      sealLoading.value = false
    }
  }

  /// 在线制作新印章：后端只生成爱签制章链接，真正制章由用户在爱签页面完成。
  /// 不传 sealNo，新增印章不会覆盖企业现有印章；制章完成后回本页刷新即可看到。
  async function handleSealMakeOnline() {
    if (!requireToken()) return
    sealMakeLoading.value = true
    try {
      const res = await createSealMakeOnline(auth.token, {})
      const url = res.data?.trim()
      if (res.success && url) {
        window.open(url, '_blank', 'noopener,noreferrer')
        TMessage.success('已打开爱签制章页面，完成后回本页刷新查看')
      } else {
        TMessage.warning('暂时拿不到制章链接，请稍后重试')
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '生成制章链接失败')
    } finally {
      sealMakeLoading.value = false
    }
  }

  /// 从印章管理切到「修改企业信息」（改名会自动重新生成印章）。
  function openCompanyFromSeal() {
    sealDialogVisible.value = false
    options.openCompanyInfo()
  }

  return {
    sealDialogVisible,
    sealLoading,
    sealError,
    sealData,
    sealMakeLoading,
    openSealDialog,
    loadMySeals,
    handleSealMakeOnline,
    openCompanyFromSeal,
  }
}
