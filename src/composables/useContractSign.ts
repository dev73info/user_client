import { computed, onMounted, ref } from 'vue'

import {
  fetchApiUsageAgreement,
  fetchAsignContractPreviewUrl,
  fetchDeveloperAgreement,
  fetchMyContract,
  fetchMyRequirementContract,
  initiateAsignSign,
  syncAsignSignStatus,
  type ContractDetail,
} from '@/api/contracts'
import { fetchRequirementDetail, type RequirementItem } from '@/api/requirements'
import { CONTRACT_STATUS } from '@/shared/contracts'
import { contractStatusTone } from '@/shared/contractSign'
import { ARCHIVED_WRITE_BLOCKED_MESSAGE } from '@/shared/requirementArchive'
import { useAuthStore } from '@/stores/auth'

import { useContractNoticeConfirm } from './useContractNoticeConfirm'
import { useContractSignDisplay } from './useContractSignDisplay'
import { useContractSignNavigation } from './useContractSignNavigation'
import { useContractSignPolling } from './useContractSignPolling'

/**
 * 合同签署页的取数与动作（R047 从 `ContractSignView` 迁出）。
 *
 * 页面有三种入口（工作台签署详情 / 需求合同 / 平台内置协议），数据来源各不相同，
 * 但签署闸门、附件放行、到期归档、爱签轮询是同一套。这里只做编排：展示口径在
 * `useContractSignDisplay`，路由身份在 `useContractSignNavigation`，轮询在
 * `useContractSignPolling`，平台协议的重要条款确认在 `useContractNoticeConfirm`，
 * 纯展示换算在 `shared/contractSign`。**整页跳转留在视图**：去爱签签署 / 看爱签预览
 * 都是 `window.location` 级跳转，由视图注入 `openPage`，composable 只把 URL 交出去。
 */
type UseContractSignOptions = {
  /** 整页跳转（`window.location.href = url`）：爱签签署页与合同预览页都走这里。 */
  openPage: (url: string) => void
}

export function useContractSign(options: UseContractSignOptions) {
  const auth = useAuthStore()

  const loading = ref(true)
  const signing = ref(false)
  const contract = ref<ContractDetail | null>(null)
  const error = ref('')
  const successMsg = ref('')
  // 发起爱签签署时是否短信通知签署人，默认不通知。
  const noticeSigner = ref(false)
  // 已签署的合同不再在本地铺正文（爱签那份才是准的），只有爱签取不到预览链接时才回退本地正文。
  const localDocumentFallback = ref(false)

  const polling = useContractSignPolling({
    contract,
    isLoading: () => loading.value,
    isSigning: () => signing.value,
    token: () => auth.token,
    onSigned: () => nav.continueAfterSignCompleted(),
  })
  const nav = useContractSignNavigation({ contract, stopPolling: polling.stop })

  // R014：需求单的「合同有效期届满 → 超期锁定 / 已清除」状态。合同详情本身不带归档标记，
  // 借需求详情（`requireId`）读一次；读取即触发后端收口，返回的就是最新状态。
  const requirementArchive = ref<RequirementItem | null>(null)

  const platformNotice = useContractNoticeConfirm(nav)

  const {
    currentParty,
    currentSigner,
    signerIdentityReady,
    canSignContract,
    showSignatureFacts,
    showLocalDocument,
    parties,
    signingLogs,
    hasCustomAttachment,
    attachmentApproved,
    attachmentGateMessage,
    attachmentRequirementId,
    showAttachmentPanel,
    currentPartyAsAttachmentParty,
    requirementArchived,
    archiveBanner,
    archiveSignBlockedMessage,
    effectiveUntilLabel,
    developmentCycleText,
    canSubmitSign,
    showBecomeDeveloper,
  } = useContractSignDisplay({
    contract,
    requirementArchive,
    signing,
    localDocumentFallback,
    noticeAccepted: platformNotice.noticeAccepted,
    username: () => auth.username,
    requirementId: nav.requirementId,
    isWorkbenchSignature: nav.isWorkbenchSignature,
    isDeveloperAgreement: nav.isDeveloperAgreement,
    isPlatformAgreement: nav.isPlatformAgreement,
    token: () => auth.token, // 取本人实名资料用
  })

  /** 附件变更后换成后端最新那份，避免停在旧审核态。 */
  function applyUpdatedContract(updated: ContractDetail) {
    contract.value = updated
    successMsg.value = ''
    error.value = ''
  }

  async function loadContract() {
    loading.value = true
    error.value = ''
    try {
      if (nav.isWorkbenchSignature.value) {
        contract.value = await fetchMyContract(auth.token, nav.contractId)
      } else if (nav.isApiUsageAgreement.value) {
        contract.value = await fetchApiUsageAgreement(auth.token)
      } else if (nav.isDeveloperAgreement.value) {
        contract.value = await fetchDeveloperAgreement(auth.token)
      } else {
        contract.value = await fetchMyRequirementContract(auth.token, nav.requirementId)
      }
      // 已发起爱签签署但本地仍是待签署（回调可能延迟/丢失）：主动向爱签同步状态。
      // 用户从爱签签署页返回本页时，若已在爱签完成签署，这里会把本地合同更新为已签署。
      // 若同步后仍未签署，则启动轮询持续同步，直到爱签侧完成或合同变为已签署。
      const item = contract.value
      if (item && item.status === CONTRACT_STATUS.signing) {
        const hasInitiated = (item.signing_logs ?? []).some(
          (log) => log.action === 'asign_sign_initiated',
        )
        if (hasInitiated) {
          try {
            contract.value = await syncAsignSignStatus(auth.token, item.id)
          } catch {
            // 同步失败不阻断页面展示，保留已加载状态。
          }
          if (contract.value?.status === CONTRACT_STATUS.signing) {
            polling.start()
          }
        }
      }
      // R014：读一次需求详情拿「超期锁定 / 已清除」标记（读取即触发后端收口）。失败不阻断合同展示。
      const rid = contract.value?.requirement_id?.trim() || nav.requirementId
      if (!nav.isPlatformAgreement.value && rid) {
        try {
          requirementArchive.value = await fetchRequirementDetail(auth.token, rid)
        } catch {
          requirementArchive.value = null
        }
      } else {
        requirementArchive.value = null
      }
    } catch (cause) {
      contract.value = null
      error.value = cause instanceof Error ? cause.message : '加载合同失败，请刷新重试'
    } finally {
      loading.value = false
    }
  }

  /** 发起签署前的三道本地闸门（后端同样会拦，这里先给出可操作的中文说明）。 */
  function signBlockedReason(): string {
    if (requirementArchived.value) return ARCHIVED_WRITE_BLOCKED_MESSAGE
    if (!signerIdentityReady.value) {
      return '请先完成实名认证，签署身份必须包含真实姓名和身份证号'
    }
    if (!attachmentApproved.value) {
      return attachmentGateMessage.value || '自定义合同附件待平台审核通过后才能发起签署'
    }
    return ''
  }

  async function handleSign() {
    if (!contract.value || signing.value) return
    // R043 任务-03：平台协议要先确认重要条款提示（放行时顺手留痕一次）。
    const blocked = signBlockedReason() || (await platformNotice.confirmBeforeSign())
    if (blocked) {
      error.value = blocked
      return
    }
    signing.value = true
    error.value = ''
    try {
      const result = await initiateAsignSign(auth.token, contract.value.id, noticeSigner.value)
      // 无论跳爱签还是短信通知后轮询，签完都要离开「签署页原地」；进爱签前先打标，
      // 整页回跳后 sessionStorage 还在，同步到已签约即可继续走。
      if (!nav.isPlatformAgreement.value) {
        nav.markRequirementSignPendingReturn()
        nav.rememberRequirementSignContext()
      }
      if (result.sign_url && !noticeSigner.value) {
        // 未勾选短信通知时，跳转到爱签签署页面（整页跳转由视图执行）。
        options.openPage(result.sign_url)
        return
      }
      // 勾选了短信通知：不跳转页面，短信通知签署人，停留本页轮询状态。
      successMsg.value = noticeSigner.value
        ? '已发起并短信通知签署人'
        : '已发起签署，请稍后刷新查看签署状态'
      await loadContract()
      if (contract.value?.status === CONTRACT_STATUS.signed) {
        nav.continueAfterSignCompleted()
        return
      }
      polling.start()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '发起签署失败，请稍后重试'
    } finally {
      signing.value = false
    }
  }

  /**
   * 「查看合同」：跳爱签的合同预览页（previewContract），与需求列表页同一口径。
   * 爱签侧还没有这份合同（例如平台自动生成的协议没走过爱签）时回退本地合同正文，
   * 否则页面上就没有任何地方能看到合同内容了。
   */
  async function viewContract() {
    if (!contract.value) return
    try {
      const previewUrl = await fetchAsignContractPreviewUrl(auth.token, contract.value.id)
      if (previewUrl) {
        options.openPage(previewUrl)
        return
      }
    } catch {
      // 忽略：回退本地合同正文
    }
    localDocumentFallback.value = true
    error.value = '爱签暂未提供该合同的查看页，以下为本地留存的合同正文'
  }

  onMounted(async () => {
    auth.hydrate()
    if (!nav.isWorkbenchSignature.value && !nav.isPlatformAgreement.value && !nav.requirementId) {
      nav.goHome()
      return
    }
    if (!nav.isWorkbenchSignature.value) {
      nav.rememberRedirectTarget()
      nav.rememberRequirementSignContext()
    }
    if (auth.token) {
      await auth.initializeSession().catch(() => undefined)
    }
    await loadContract()
    nav.continueAfterSignCompleted()
  })

  return {
    loading,
    signing,
    contract,
    /** 附件面板要直接拿 token 调接口（它自己管理上传/拟定状态）。 */
    token: computed(() => auth.token),
    error,
    successMsg,
    noticeSigner,
    localDocumentFallback,
    requirementArchive,
    noticeAccepted: platformNotice.noticeAccepted,
    platformAgreementCode: platformNotice.platformAgreementCode,
    onNoticeLoaded: platformNotice.onNoticeLoaded,
    currentParty,
    currentSigner,
    signerIdentityReady,
    canSignContract,
    showSignatureFacts,
    showLocalDocument,
    parties,
    signingLogs,
    hasCustomAttachment,
    attachmentApproved,
    attachmentGateMessage,
    attachmentRequirementId,
    showAttachmentPanel,
    currentPartyAsAttachmentParty,
    requirementArchived,
    archiveBanner,
    archiveSignBlockedMessage,
    effectiveUntilLabel,
    developmentCycleText,
    canSubmitSign,
    showBecomeDeveloper,
    applyUpdatedContract,
    loadContract,
    handleSign,
    viewContract,
    contractStatusTone,
    goBack: nav.goBack,
    goRealname: nav.goRealname,
    goBecomeDeveloper: nav.goBecomeDeveloper,
    isWorkbenchSignature: nav.isWorkbenchSignature,
    isDeveloperAgreement: nav.isDeveloperAgreement,
    isApiUsageAgreement: nav.isApiUsageAgreement,
    isPlatformAgreement: nav.isPlatformAgreement,
  }
}
