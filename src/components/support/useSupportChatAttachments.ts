import { computed, ref } from 'vue'

import { uploadSupportAttachment, type SupportAttachment } from '@/api/support'

export const MAX_SUPPORT_ATTACHMENTS = 5
export const MAX_SUPPORT_ATTACHMENT_BYTES = 20 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'zip',
])

export function useSupportChatAttachments(token: () => string) {
  const pending = ref<SupportAttachment[]>([])
  const uploading = ref(0)
  const error = ref('')
  const busy = computed(() => uploading.value > 0)

  function validate(file: File): string | null {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return '仅支持图片、PDF、Office、txt 与 zip 文件'
    }
    if (file.size <= 0 || file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
      return '单个附件不能为空且不能超过 20MB'
    }
    return null
  }

  async function upload(files: FileList | File[]) {
    const authToken = token().trim()
    if (!authToken) {
      error.value = '请先登录后再上传附件'
      return
    }
    const remaining = MAX_SUPPORT_ATTACHMENTS - pending.value.length
    if (remaining <= 0) {
      error.value = `单条消息最多 ${MAX_SUPPORT_ATTACHMENTS} 个附件`
      return
    }
    error.value = ''
    const queue = Array.from(files).slice(0, remaining)
    if (Array.from(files).length > remaining) {
      error.value = `单条消息最多 ${MAX_SUPPORT_ATTACHMENTS} 个附件`
    }
    for (const file of queue) {
      const invalid = validate(file)
      if (invalid) {
        error.value = invalid
        continue
      }
      uploading.value += 1
      try {
        const attachment = await uploadSupportAttachment(authToken, file)
        if (token().trim() === authToken) pending.value.push(attachment)
      } catch (cause) {
        error.value = cause instanceof Error ? cause.message : '上传附件失败'
      } finally {
        uploading.value -= 1
      }
    }
  }

  function remove(id: number) {
    pending.value = pending.value.filter((attachment) => attachment.id !== id)
    error.value = ''
  }

  function clear() {
    pending.value = []
    error.value = ''
  }

  return { pending, uploading: busy, error, upload, remove, clear }
}
