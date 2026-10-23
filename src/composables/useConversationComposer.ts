import { computed, ref } from 'vue'
import { TMessage } from 'ui_73info'

import * as conversationApi from '@/api/conversations'
import type { RequirementConversationDetail } from '@/api/conversations'
import {
  MAX_ATTACHMENT_BYTES,
  defaultAttachmentName,
  formatBytes,
  mimeTypeFromName,
} from '@/shared/attachmentFile'

/** 作曲器里待发送的截图附件：预览地址由 URL.createObjectURL 生成，移除或卸载时要 revoke。 */ export type ConversationAttachmentDraft =
  {
    file: File
    previewUrl: string
    name: string
    mimeType: string
    sizeLabel: string
  }

type ComposerSources = {
  token: string
  /** 会话 id：未载入完成时为空，此时不能发消息。 */
  conversationId?: string
  /** 作曲器是否只读（会话已关闭或需求已到期归档）。 */
  locked: boolean
  /** 需求是否已到期归档：仅用于「点了发不出去」时给出对应的提示。 */
  archived: boolean
  loading: boolean
  /** 消息发出去之后交给父组件：替换详情并 emit，父组件不再另存一份。 */
  onSent: (detail: RequirementConversationDetail) => void
  /** 发送成功后收起表情面板（父组件持有面板开关）。 */
  closeEmojiPanel: () => void
  scrollToBottom: () => Promise<void>
}

/**
 * 会话作曲器：草稿、发送、截图附件。
 *
 * 从 `RequirementConversationModal.vue` 抽出。发送失败只写 `sendError`，不动时间线与草稿；
 * 归档只读期的守卫与 `submitMessage` 同口径（判 `locked`，不只判 `conversationClosed`）。
 */
export function useConversationComposer(readSources: () => ComposerSources) {
  const draft = ref('')
  const sending = ref(false)
  /** 发送失败的提示：只贴在作曲器上方，时间线保持原样，草稿也留着让用户重发。 */
  const sendError = ref('')
  const attachmentError = ref('')
  const attachmentDraft = ref<ConversationAttachmentDraft | null>(null)

  const canSend = computed(() => {
    const sources = readSources()
    return (
      (draft.value.trim().length > 0 || Boolean(attachmentDraft.value)) &&
      !sending.value &&
      !sources.loading &&
      !sources.locked
    )
  })

  async function submitMessage() {
    const sources = readSources()
    if (sending.value || sources.loading || sources.locked) {
      if (sources.archived) {
        TMessage.warning(
          '合同有效期已届满，会话在资料保留期内只读：不能发消息或传附件，历史内容仍可查看与下载',
        )
      }
      return
    }

    const content = draft.value.trim()
    const activeAttachment = attachmentDraft.value
    const conversationId = sources.conversationId
    if ((!content && !activeAttachment) || !conversationId || !sources.token) {
      return
    }

    sending.value = true
    // 只清上一次的发送失败提示；载入失败由会话自身管，这里不动它
    sendError.value = ''
    attachmentError.value = ''
    try {
      const detail = await conversationApi.sendRequirementConversationMessage(
        sources.token,
        conversationId,
        content,
        activeAttachment?.file,
      )
      readSources().onSent(detail)
      if (draft.value.trim() === content) {
        draft.value = ''
      }
      if (activeAttachment && attachmentDraft.value?.previewUrl === activeAttachment.previewUrl) {
        clearAttachmentDraft()
      }
      readSources().closeEmojiPanel()
      await readSources().scrollToBottom()
    } catch (error) {
      // 发送失败只提示、不动时间线：详情保持原值（草稿已在成功分支之外，也不会被清）
      sendError.value = error instanceof Error ? error.message : '发送消息失败'
    } finally {
      sending.value = false
    }
  }

  /** 清空草稿与两类提示（换会话 / 关闭弹窗时用）。 */
  function resetComposer() {
    draft.value = ''
    sendError.value = ''
    attachmentError.value = ''
    clearAttachmentDraft()
  }

  function clearAttachmentDraft() {
    if (attachmentDraft.value) {
      URL.revokeObjectURL(attachmentDraft.value.previewUrl)
    }
    attachmentDraft.value = null
  }

  function applyAttachmentFile(file: File) {
    const mimeType = file.type || mimeTypeFromName(file.name)
    if (!mimeType.startsWith('image/')) {
      attachmentError.value = '仅支持图片附件'
      return
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      attachmentError.value = '图片不能超过 8MB'
      return
    }

    clearAttachmentDraft()
    const name = file.name?.trim() || defaultAttachmentName(mimeType)
    const uploadFile = file.name?.trim() ? file : new File([file], name, { type: mimeType })
    attachmentDraft.value = {
      file: uploadFile,
      previewUrl: URL.createObjectURL(uploadFile),
      name,
      mimeType,
      sizeLabel: formatBytes(uploadFile.size),
    }
    attachmentError.value = ''
  }

  return {
    draft,
    sending,
    sendError,
    attachmentError,
    attachmentDraft,
    canSend,
    submitMessage,
    resetComposer,
    clearAttachmentDraft,
    applyAttachmentFile,
  }
}

/** 从粘贴板里挑出第一张图片（截图粘贴成附件用）：先看 items，再看 files。 */
export function findClipboardImage(data: DataTransfer | null) {
  if (!data) {
    return null
  }

  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) {
      return file
    }
  }

  return null
}
