import { computed, ref, watch } from 'vue'

import {
  deleteContractAttachment,
  downloadBlankContractTemplate,
  downloadContractAttachment,
  draftContractAttachment,
  uploadContractAttachment,
  type ContractDetail,
  type DraftContractAttachmentPayload,
} from '@/api/contracts'
import { listMyRequirements } from '@/api/devRequirements'
import { listRequirements } from '@/api/requirements'
import { useContractAttachmentDownload } from './useContractAttachmentDownload'
import { useContractRequirementPrefill } from './useContractRequirementPrefill'
import {
  ACCEPTED_ATTR,
  ACCEPTED_EXTENSIONS,
  validateAttachmentDraftAmount,
} from '@/shared/contractAttachmentDisplay'
import {
  ATTACHMENT_REVIEW_STATUS,
  CONTRACT_CONTENT_SOURCE,
  attachmentReviewStatusLabel,
  type ContractAttachmentParty,
} from '@/shared/contracts'

export type ContractAttachmentPanelProps = {
  token: string
  contract: ContractDetail
  /** 需求编号（上传 / 拟定都挂在该需求已有的合同行上）。 */
  requirementId: string
  /** 当前用户在这份合同上的身份；非当事人（如后台代看）为 `null`，只读。 */
  party: ContractAttachmentParty | null
  /** 拟定表单「标题」的预填值，缺省用合同标题。 */
  contractTitle?: string
}

/**
 * 自定义合同附件面板的状态与动作（R047 从 `components/ContractAttachmentPanel.vue` 拆出）。
 *
 * 组件不自己拉合同：每次上传 / 拟定 / 撤回都返回后端最新的合同，交给父页面替换本地那份
 * （`onUpdated`），避免「覆盖后页面还停在旧审核态」。
 *
 * 口径与拆出前逐条一致：
 * - 三种写操作前先清提示；后端的中文提示（格式 / 超限 / 已发起签署 409 / 请先发起合同 409）
 *   原样展示，不统一成「请求失败」；
 * - 拟定金额预校验要求「等于需求单预算且大于 0」，拿不到预算时不拦（交给后端）；
 * - 换合同（id / 附件哈希 / 审核态任一变化）就清掉上一份的提示与选中文件；
 * - 需求单信息按需加载一次，只回填空着的预填项，不动用户已经改过的输入。
 */

export function useContractAttachmentPanel(
  options: ContractAttachmentPanelProps,
  onUpdated: (contract: ContractDetail) => void,
) {
  const contentSource = computed(
    () => options.contract.content_source ?? CONTRACT_CONTENT_SOURCE.platform,
  )
  const hasAttachment = computed(() => contentSource.value !== CONTRACT_CONTENT_SOURCE.platform)
  const reviewStatus = computed(
    () => options.contract.attachment_review_status ?? ATTACHMENT_REVIEW_STATUS.none,
  )
  const reviewLabel = computed(() => attachmentReviewStatusLabel(reviewStatus.value))
  const approved = computed(
    () =>
      reviewStatus.value === ATTACHMENT_REVIEW_STATUS.approved &&
      // 放行是「对某个具体版本」放行的：指纹不一致就视为未放行（换过文件、沿用旧放行）。
      Boolean(options.contract.attachment_file_sha256) &&
      options.contract.attachment_approved_sha256 === options.contract.attachment_file_sha256,
  )

  /**
   * 是否已发起爱签签署（渠道合同已创建）。
   *
   * 后端真正的边界是「渠道合同已创建」（`asign_contract_no` 非空，见后端
   * `attachment_editable`），但用户端合同详情没有透出该字段；唯一可靠的替代判据是
   * 签署日志里的 `asign_sign_initiated`——发起签署成功才会落这条日志，与「渠道合同已创建」
   * 一一对应。
   *
   * ⚠️ 不要用「合同状态 ≠ 等待签约 0」判定：需求合同建单时的状态就是「签约中 1」
   * （后端 `create_requirement_contract_by_user` 直接以 `CONTRACT_STATUS_SIGNING` 落库），
   * 照状态判会把「还没发起签署」的合同也当成已发起，准备入口被永久锁死。
   */
  const signingInitiated = computed(() =>
    (options.contract.signing_logs ?? []).some((log) => log.action === 'asign_sign_initiated'),
  )

  /** 能否准备附件：必须是当事人，且渠道合同尚未创建（发起签署后只能作废重签）。 */
  const canPrepare = computed(() => options.party !== null && !signingInitiated.value)

  /** 需求单预填（标题 / 预算 / 验收标准）：拟定表单打开时按需加载一次。 */
  const { requirementInfo, ensureRequirementInfo } = useContractRequirementPrefill({
    token: options.token,
    requirementId: options.requirementId,
    party: options.party,
  })

  /** 附件与空白模板的下载：两个「下载中」标记各自独立，失败只写提示。 */
  const { downloading, templateDownloading, downloadAttachment, downloadTemplate } =
    useContractAttachmentDownload({
      token: options.token,
      contract: options.contract,
      resetMessages,
      fail: (message) => {
        actionError.value = message
      },
    })

  const mode = ref<'upload' | 'draft'>('upload')
  const pickedFile = ref<File | null>(null)
  const busy = ref(false)
  const actionError = ref('')
  const actionSuccess = ref('')

  const draftOpen = ref(false)
  const draft = ref<DraftContractAttachmentPayload>({
    title: '',
    amount: 0,
    payment_terms: '',
    acceptance_criteria: '',
    intellectual_property: '',
    breach_and_dispute: '',
    supplementary_terms: '',
  })

  const requirementInfoLoaded = ref(false)

  function resetMessages() {
    actionError.value = ''
    actionSuccess.value = ''
  }

  /** 换合同（覆盖后父页面替换了本地那份）就清掉上一份的提示与选中文件，别让旧状态串到新版本上。 */
  watch(
    () => [
      options.contract.id,
      options.contract.attachment_file_sha256,
      options.contract.attachment_review_status,
    ],
    () => {
      resetMessages()
      pickedFile.value = null
    },
  )

  function openDraft() {
    mode.value = 'draft'
    if (!draftOpen.value) {
      draftOpen.value = true
      draft.value = {
        title: requirementInfo.value?.title ?? options.contractTitle ?? options.contract.title,
        amount: requirementInfo.value?.budget ?? 0,
        payment_terms: '',
        acceptance_criteria: requirementInfo.value?.acceptance_criteria ?? '',
        intellectual_property: '',
        breach_and_dispute: '',
        supplementary_terms: '',
      }
    }
    void ensureRequirementInfo().then(() => {
      // 需求单信息补上后，只回填空着的预填项，不动用户已经改过的输入。
      const info = requirementInfo.value
      if (!info) return
      if (!draft.value.title.trim()) draft.value.title = info.title
      if (!draft.value.acceptance_criteria.trim())
        draft.value.acceptance_criteria = info.acceptance_criteria
      if (!draft.value.amount && info.budget != null) draft.value.amount = info.budget
    })
  }

  watch(mode, (value) => {
    if (value === 'draft') {
      openDraft()
    }
  })

  function openUpload() {
    mode.value = 'upload'
  }

  function onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement
    resetMessages()
    pickedFile.value = input.files?.[0] ?? null
  }

  async function submitUpload() {
    if (busy.value) return
    const file = pickedFile.value
    if (!file) {
      actionError.value = '请先选择要上传的合同文件（pdf / doc / docx）'
      return
    }
    busy.value = true
    resetMessages()
    try {
      const updated = await uploadContractAttachment(options.token, options.requirementId, file)
      onUpdated(updated)
      pickedFile.value = null
      actionSuccess.value = '附件已提交，等待平台审核'
    } catch (error) {
      // 后端的中文提示（格式 / 超限 / 已发起签署 409 / 请先发起合同 409）原样展示，不统一成「请求失败」。
      actionError.value = error instanceof Error ? error.message : '上传合同附件失败'
    } finally {
      busy.value = false
    }
  }

  async function submitDraft() {
    if (busy.value) return
    if (!draft.value.title.trim()) {
      actionError.value = '请先填写附件标题'
      return
    }
    const amountError = validateAttachmentDraftAmount(
      draft.value.amount,
      requirementInfo.value?.budget ?? null,
    )
    if (amountError) {
      actionError.value = amountError
      return
    }
    busy.value = true
    resetMessages()
    try {
      const updated = await draftContractAttachment(options.token, options.requirementId, {
        ...draft.value,
        title: draft.value.title.trim(),
      })
      onUpdated(updated)
      draftOpen.value = false
      actionSuccess.value = '条款已提交，等待平台审核'
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : '提交合同条款失败'
    } finally {
      busy.value = false
    }
  }

  async function withdrawAttachment() {
    if (busy.value) return
    busy.value = true
    resetMessages()
    try {
      await deleteContractAttachment(options.token, options.contract.id)
      // 撤回后后端把附件字段清空、来源回 platform；本地据此重载合同，避免残留旧附件信息。
      onUpdated({
        ...options.contract,
        content_source: CONTRACT_CONTENT_SOURCE.platform,
        attachment_review_status: ATTACHMENT_REVIEW_STATUS.none,
        attachment_file_name: null,
        attachment_file_sha256: null,
        attachment_approved_sha256: null,
        attachment_review_note: null,
        attachment_prepared_by: null,
        attachment_prepared_at: null,
        attachment_prepared_party: null,
        attachment_file_size: null,
      })
      actionSuccess.value = '附件已撤回'
    } catch (error) {
      actionError.value = error instanceof Error ? error.message : '撤回合同附件失败'
    } finally {
      busy.value = false
    }
  }

  return {
    ACCEPTED_EXTENSIONS,
    ACCEPTED_ATTR,
    contentSource,
    hasAttachment,
    reviewStatus,
    reviewLabel,
    approved,
    signingInitiated,
    canPrepare,
    mode,
    pickedFile,
    busy,
    actionError,
    actionSuccess,
    downloading,
    templateDownloading,
    draftOpen,
    draft,
    requirementInfo,
    openUpload,
    openDraft,
    onFilePicked,
    submitUpload,
    submitDraft,
    withdrawAttachment,
    downloadAttachment,
    downloadTemplate,
  }
}
