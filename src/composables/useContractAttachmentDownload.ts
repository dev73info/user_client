import { ref } from 'vue'

import {
  downloadBlankContractTemplate,
  downloadContractAttachment,
  type ContractDetail,
} from '@/api/contracts'

export type ContractAttachmentDownloadOptions = {
  token: string
  contract: ContractDetail
  /** 下载前清掉上一条成功 / 失败提示（与上传、拟定、撤回同一套收口）。 */
  resetMessages: () => void
  /** 失败文案交给面板统一展示。 */
  fail: (message: string) => void
}

/**
 * 合同附件与空白模板的下载（R047 从 `components/ContractAttachmentPanel.vue` 拆出）。
 *
 * 下载是纯读操作：两个「下载中」标记各自独立（可以一边下附件模板一边下已有附件），
 * 失败只写提示、不影响附件状态；落地用 `<a download>` 触发，1 秒后回收 object URL。
 */
export function useContractAttachmentDownload(options: ContractAttachmentDownloadOptions) {
  const downloading = ref(false)
  const templateDownloading = ref(false)

  function saveBlob(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob)
    try {
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = fileName || '下载文件'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    }
  }

  async function downloadAttachment() {
    if (downloading.value) return
    downloading.value = true
    options.resetMessages()
    try {
      const file = await downloadContractAttachment(
        options.token,
        options.contract.id,
        options.contract.attachment_file_name ?? '合同附件',
      )
      saveBlob(file.blob, file.fileName)
    } catch (error) {
      options.fail(error instanceof Error ? error.message : '下载合同附件失败')
    } finally {
      downloading.value = false
    }
  }

  async function downloadTemplate() {
    if (templateDownloading.value) return
    templateDownloading.value = true
    options.resetMessages()
    try {
      const file = await downloadBlankContractTemplate(options.token)
      saveBlob(file.blob, file.fileName)
    } catch (error) {
      options.fail(error instanceof Error ? error.message : '下载合同模板失败')
    } finally {
      templateDownloading.value = false
    }
  }

  return { downloading, templateDownloading, downloadAttachment, downloadTemplate }
}
