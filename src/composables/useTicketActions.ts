import { ref, type Ref } from 'vue'

import {
  closeTicket,
  createTicket,
  downloadTicketAttachment,
  isReopenExpiredError,
  listTicketCategories,
  rateTicket,
  reopenTicket,
  replyTicket,
  uploadTicketAttachment,
  type CreateTicketPayload,
  type SatisfactionPayload,
  type TicketAttachment,
  type TicketCategory,
  type TicketDetail,
} from '@/api/tickets'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export type TicketListBridge = {
  selectedId: Ref<string>
  applyDetail: (detail: TicketDetail) => void
  reload: () => Promise<void>
  selectTicket: (ticketId: string) => Promise<void>
}

const REOPEN_EXPIRED_TEXT = '已超过 7 天，请新建工单'

/** 工单写操作：创建、回复、关闭、重开、满意度、附件。列表刷新交给 useTicketList。 */
export function useTicketActions(list: TicketListBridge) {
  const auth = useAuthStore()
  const categories = ref<TicketCategory[]>([])
  const categoriesLoaded = ref(false)
  const creating = ref(false)
  const replying = ref(false)
  const closing = ref(false)
  const reopening = ref(false)
  const rating = ref(false)
  const createError = ref('')
  const replyError = ref('')
  const actionError = ref('')
  const composeOpen = ref(false)
  const satisfactionOpen = ref(false)

  async function loadCategories() {
    if (categoriesLoaded.value) return
    try {
      categories.value = (await listTicketCategories(auth.token)).filter((item) => item.active)
      categoriesLoaded.value = true
    } catch {
      categories.value = []
    }
  }

  function openCompose() {
    createError.value = ''
    composeOpen.value = true
    void loadCategories()
  }

  async function submitCreate(payload: CreateTicketPayload): Promise<boolean> {
    createError.value = ''
    if (!payload.subject.trim()) {
      createError.value = '请填写工单标题'
      return false
    }
    if (!payload.content.trim()) {
      createError.value = '请填写问题描述'
      return false
    }
    creating.value = true
    try {
      const created = await createTicket(auth.token, {
        ...payload,
        subject: payload.subject.trim(),
        content: payload.content.trim(),
      })
      composeOpen.value = false
      TMessage.success('工单已提交')
      await list.reload()
      await list.selectTicket(created.ticket_id)
      return true
    } catch (err) {
      createError.value = describeBackendError(err, '创建工单失败')
      return false
    } finally {
      creating.value = false
    }
  }

  async function submitReply(content: string, attachmentIds: number[]): Promise<boolean> {
    const ticketId = list.selectedId.value
    if (!ticketId) return false
    replyError.value = ''
    if (!content.trim() && attachmentIds.length === 0) {
      replyError.value = '请输入回复内容'
      return false
    }
    replying.value = true
    try {
      const detail = await replyTicket(auth.token, ticketId, {
        content: content.trim(),
        attachment_ids: attachmentIds,
      })
      list.applyDetail(detail)
      await list.reload()
      return true
    } catch (err) {
      replyError.value = isReopenExpiredError(err)
        ? REOPEN_EXPIRED_TEXT
        : describeBackendError(err, '回复工单失败')
      return false
    } finally {
      replying.value = false
    }
  }

  async function submitClose() {
    const ticketId = list.selectedId.value
    if (!ticketId) return
    actionError.value = ''
    closing.value = true
    try {
      await closeTicket(auth.token, ticketId)
      TMessage.success('工单已关闭')
      await list.reload()
    } catch (err) {
      actionError.value = describeBackendError(err, '关闭工单失败')
    } finally {
      closing.value = false
    }
  }

  async function submitReopen() {
    const ticketId = list.selectedId.value
    if (!ticketId) return
    actionError.value = ''
    reopening.value = true
    try {
      await reopenTicket(auth.token, ticketId)
      TMessage.success('工单已重新打开')
      await list.reload()
    } catch (err) {
      actionError.value = isReopenExpiredError(err)
        ? REOPEN_EXPIRED_TEXT
        : describeBackendError(err, '重开工单失败')
    } finally {
      reopening.value = false
    }
  }

  async function submitSatisfaction(payload: SatisfactionPayload): Promise<boolean> {
    const ticketId = list.selectedId.value
    if (!ticketId) return false
    actionError.value = ''
    rating.value = true
    try {
      await rateTicket(auth.token, ticketId, payload)
      TMessage.success('评价已提交')
      satisfactionOpen.value = false
      await list.reload()
      return true
    } catch (err) {
      actionError.value = describeBackendError(err, '提交评价失败')
      return false
    } finally {
      rating.value = false
    }
  }

  async function uploadAttachment(file: File): Promise<TicketAttachment> {
    return uploadTicketAttachment(auth.token, file)
  }

  async function downloadAttachment(attachment: TicketAttachment) {
    try {
      const blob = await downloadTicketAttachment(auth.token, attachment.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.file_name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      TMessage.error(describeBackendError(err, '下载附件失败'))
    }
  }

  return {
    categories,
    creating,
    replying,
    closing,
    reopening,
    rating,
    createError,
    replyError,
    actionError,
    composeOpen,
    satisfactionOpen,
    loadCategories,
    openCompose,
    submitCreate,
    submitReply,
    submitClose,
    submitReopen,
    submitSatisfaction,
    uploadAttachment,
    downloadAttachment,
  }
}
