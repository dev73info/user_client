import { ref } from 'vue'

import { uploadGuardianConsentFile } from '@/api/realname'
import type { RealnameDraftFields } from '@/shared/realnameForm'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export type RealnameMaterialsOptions = {
  form: RealnameDraftFields
}

const MAX_CONSENT_FILE_SIZE = 5 * 1024 * 1024
const MAX_MATERIAL_FILE_SIZE = 10 * 1024 * 1024
const DOCUMENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

function isAllowedFile(file: File): boolean {
  const dot = file.name.lastIndexOf('.')
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase()
  if (ext && DOCUMENT_EXTENSIONS.includes(ext)) return true
  return IMAGE_MIMES.includes((file.type || '').toLowerCase())
}

/**
 * 证照选择域：只把 `File` 留在草稿里，提交时随 quick-start 的 multipart 一次性发给后端。
 *
 * 证件/营业执照图片**不再上传到服务器**；只有监护人同意书仍走加密上传接口。
 */
export function useRealnameMaterials(options: RealnameMaterialsOptions) {
  const auth = useAuthStore()
  const consentUploading = ref(false)
  const businessLicenseUploading = ref(false)
  const legalCertFrontUploading = ref(false)
  const legalCertBackUploading = ref(false)
  const operatorCertFrontUploading = ref(false)

  function ensureToken(): boolean {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }
    return true
  }

  function validateFile(file: File, label: string): boolean {
    if (!isAllowedFile(file)) {
      TMessage.warning(`${label}仅支持 PNG、JPG、WEBP 图片`)
      return false
    }
    if (file.size > MAX_MATERIAL_FILE_SIZE) {
      TMessage.warning(`${label}文件不能超过 10MB`)
      return false
    }
    return ensureToken()
  }

  function handleBusinessLicenseFile(file: File) {
    if (!validateFile(file, '营业执照')) return
    options.form.businessLicenseFile = file
  }

  function handleLegalCertFrontFile(file: File) {
    if (!validateFile(file, '身份证人像面')) return
    options.form.legalCertFrontFile = file
  }

  function handleLegalCertBackFile(file: File) {
    if (!validateFile(file, '身份证国徽面')) return
    options.form.legalCertBackFile = file
  }

  function handleOperatorCertFrontFile(file: File) {
    if (!validateFile(file, '经办人身份证人像面')) return
    options.form.operatorCertFrontFile = file
  }

  async function handleConsentFile(file: File) {
    if (!isAllowedFile(file) && file.type !== 'application/pdf') {
      TMessage.warning('监护人同意书仅支持 PNG、JPG、WEBP 图片或 PDF')
      return
    }
    if (file.size > MAX_CONSENT_FILE_SIZE) {
      TMessage.warning('监护人同意书文件不能超过 5MB')
      return
    }
    if (!ensureToken()) return
    consentUploading.value = true
    try {
      const result = await uploadGuardianConsentFile(auth.token, file)
      options.form.guardianConsentFile = result.guardian_consent_file
      TMessage.success('监护人同意书已上传')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传监护人同意书失败')
    } finally {
      consentUploading.value = false
    }
  }

  return {
    consentUploading,
    businessLicenseUploading,
    legalCertFrontUploading,
    legalCertBackUploading,
    operatorCertFrontUploading,
    handleBusinessLicenseFile,
    handleLegalCertFrontFile,
    handleLegalCertBackFile,
    handleOperatorCertFrontFile,
    handleConsentFile,
  }
}
