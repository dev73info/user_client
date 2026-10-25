import { computed, type Ref } from 'vue'

import type { ContractDetail } from '@/api/contracts'
import type { RequirementItem } from '@/api/requirements'
import { CONTRACT_STATUS, contractEffectiveUntilLabel } from '@/shared/contracts'
import {
  archiveSignBlockedMessage as archiveSignBlockedText,
  attachmentApproved as isAttachmentApproved,
  attachmentGateMessage as attachmentGateText,
  canSignContract as contractCanSign,
  contractPartyDisplay,
  contractPartyOf,
  hasCustomAttachment as contractHasCustomAttachment,
  signerIdentityReady as isSignerIdentityReady,
  type SignerRealname,
  signingLogLabel,
} from '@/shared/contractSign'
import {
  developmentCycleLabel,
  isRequirementArchived,
  requirementArchiveBanner,
} from '@/shared/requirementArchive'

/**
 * 合同签署页的**展示口径**（R047 从 `useContractSign` 再拆一层）。
 *
 * 这里只回答「页面上显示什么」：签约方是谁、能不能签、附件放没放行、到期归档态怎么讲。
 * 判定本身都在 `shared/contractSign` / `shared/requirementArchive` 里，这里只是把
 * 「合同 + 当前账号 + 入口身份」拼成一份 computed，供视图与区块组件共用。
 *
 * 不碰请求、路由与定时器：取数与动作在 `useContractSign`，路由身份在
 * `useContractSignNavigation`，状态轮询在 `useContractSignPolling`。
 */
type UseContractSignDisplayOptions = {
  contract: Ref<ContractDetail | null>
  /** R014 的到期归档状态：由 `useContractSign` 读需求详情得到。 */
  requirementArchive: Ref<RequirementItem | null>
  /** 签署进行中：`canSubmitSign` 要据此置灰按钮。 */
  signing: Ref<boolean>
  /**
   * 「已阅读并理解重要条款提示」的勾选状态（R043 任务-03）。
   *
   * 平台协议要求签署前单独确认重要条款提示，所以勾选状态要参与 `canSubmitSign`；
   * 需求合同不受约束（`isPlatformAgreement` 为假时直接放行）。
   */
  noticeAccepted: Ref<boolean>
  /** 已签署合同是否回退展示本地正文（爱签预览取不到时置位）。 */
  localDocumentFallback: Ref<boolean>
  /** 当前登录账号：决定本人是甲方还是乙方。 */
  username: () => string
  /**
   * 本人的实名资料（`/realname/me`）：签署身份的姓名与证件号唯一来源。
   *
   * 合同响应里没有这两项（后端 2.0 的 `ContractResponse` 不带实名字段），
   * 没有它时签署身份会恒显示「未完成实名认证」、「开始签署」永久置灰。
   */
  selfRealname: Ref<SignerRealname | null>
  /** 需求编号：合同详情页没有 query 时，附件面板从合同上取。 */
  requirementId: string
  isWorkbenchSignature: Ref<boolean>
  isDeveloperAgreement: Ref<boolean>
  isPlatformAgreement: Ref<boolean>
}

export function useContractSignDisplay(options: UseContractSignDisplayOptions) {
  const { contract, requirementArchive, signing, localDocumentFallback } = options

  const currentParty = computed(() => contractPartyOf(contract.value, options.username()))
  const currentSigner = computed(() =>
    currentParty.value
      ? contractPartyDisplay(
          contract.value,
          currentParty.value,
          options.isPlatformAgreement.value,
          options.selfRealname.value,
        )
      : null,
  )
  const signerIdentityReady = computed(() => isSignerIdentityReady(currentSigner.value))
  const canSignContract = computed(() => contractCanSign(contract.value, currentParty.value))
  // 从需求列表 / 需求会话的「查看合同」进来时，页面同样要能看清是谁在什么时候签的。
  // 只有在本人还需要签署时才收起这些区块，保持签署流程页只聚焦签署动作。
  const showSignatureFacts = computed(
    () => options.isWorkbenchSignature.value || !canSignContract.value,
  )
  const showLocalDocument = computed(
    () => contract.value?.status !== CONTRACT_STATUS.signed || localDocumentFallback.value,
  )

  /** 签约方展示行（含丙方，仅在有名字时出现）。 */
  const parties = computed(() => {
    const item = contract.value
    if (!item) return []
    const rows = [
      { name: item.party_a_name, signedAt: item.party_a_signed_at },
      { name: item.party_b_name, signedAt: item.party_b_signed_at },
    ]
    if (item.party_c_name) {
      rows.push({ name: item.party_c_name, signedAt: item.party_c_signed_at ?? null })
    }
    return rows
  })

  /** 签署记录行（展示文案已换算好，组件只负责渲染）。 */
  const signingLogs = computed(() =>
    (contract.value?.signing_logs ?? []).map((log) => ({
      id: log.id,
      time: log.created_at,
      label: signingLogLabel(log),
    })),
  )

  const hasCustomAttachment = computed(() => contractHasCustomAttachment(contract.value))
  const attachmentApproved = computed(() => isAttachmentApproved(contract.value))
  /** 附件未放行时给出的中文说明；为空表示不拦签署。 */
  const attachmentGateMessage = computed(() => attachmentGateText(contract.value))
  /** 附件准备入口所在的需求编号：合同详情页没有 query，就从合同上取。 */
  const attachmentRequirementId = computed(
    () => contract.value?.requirement_id?.trim() || options.requirementId,
  )
  /** 自定义附件只存在于需求合同上：平台内置协议不展示该面板。 */
  const showAttachmentPanel = computed(
    () => !options.isPlatformAgreement.value && Boolean(attachmentRequirementId.value),
  )
  const currentPartyAsAttachmentParty = computed(() => currentParty.value)

  /** 已进入锁定 / 已清除：写操作一律被后端拒绝，页面据此置灰。 */
  const requirementArchived = computed(
    () => requirementArchive.value != null && isRequirementArchived(requirementArchive.value),
  )
  /** 锁定 / 清除横幅（未归档时 title 为空串，模板据此不渲染）。 */
  const archiveBanner = computed(() =>
    requirementArchive.value
      ? requirementArchiveBanner(requirementArchive.value)
      : { state: 'active' as const, title: '', description: '' },
  )
  /** 归档态下签署按钮旁的中文说明。 */
  const archiveSignBlockedMessage = computed(() =>
    archiveSignBlockedText(archiveBanner.value.state),
  )

  /** R014：合同有效期截止（担保合同的签署完成时写入）；未签署完成给中文说明，不显示空值。 */
  const effectiveUntilLabel = computed(() =>
    contract.value
      ? contractEffectiveUntilLabel(contract.value.status, contract.value.effective_until)
      : '',
  )
  /** R014：签约时快照的开发周期（天）；无值不渲染。 */
  const developmentCycleText = computed(() =>
    developmentCycleLabel(contract.value?.development_cycle_days),
  )

  /**
   * 平台协议必须勾选确认重要条款提示才能发起签署（R043 任务-03）。
   *
   * 需求合同恒放行：平台不是需求合同的当事人，不在别人的合同流程里加平台自己的提示。
   */
  const platformNoticeConfirmed = computed(
    () => !options.isPlatformAgreement.value || options.noticeAccepted.value,
  )

  /** 签署可用性：合同可签 + 实名齐全 + 附件已放行（平台生成的合同不受附件闸门约束）+ 未进入到期归档 + 平台协议已确认重要条款提示。 */
  const canSubmitSign = computed(
    () =>
      canSignContract.value &&
      signerIdentityReady.value &&
      !signing.value &&
      attachmentApproved.value &&
      !requirementArchived.value &&
      platformNoticeConfirmed.value,
  )

  // 开发者入驻协议签署完成后的引导按钮；工作台签署详情已有「返回我的合同」入口，不在此重复展示。
  const showBecomeDeveloper = computed(
    () =>
      !options.isWorkbenchSignature.value &&
      options.isDeveloperAgreement.value &&
      contract.value?.status === CONTRACT_STATUS.signed,
  )

  return {
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
    platformNoticeConfirmed,
    showBecomeDeveloper,
  }
}
