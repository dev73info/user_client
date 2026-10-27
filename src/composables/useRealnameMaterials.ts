import { ref } from 'vue'

import {
  uploadBusinessLicenseFile,
  uploadGuardianConsentFile,
  uploadLegalCertBackFile,
  uploadLegalCertFrontFile,
} from '@/api/realname'
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

function isAllowedFile(file: File, allowPdf = false): boolean {
  const dot = file.name.lastIndexOf('.')
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase()
  if (ext && DOCUMENT_EXTENSIONS.includes(ext)) return true
  if (allowPdf && (ext === 'pdf' || file.type === 'application/pdf')) return true
  return IMAGE_MIMES.includes((file.type || '').toLowerCase())
}

export function useRealnameMaterials(options: RealnameMaterialsOptions) {
  const auth = useAuthStore()
  const consentUploading = ref(false)
  const businessLicenseUploading = ref(false)
  const legalCertFrontUploading = ref(false)
  const legalCertBackUploading = ref(false)

  function ensureToken(): boolean {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return false
    }
    return true
  }

  function validateFile(file: File, label: string, allowPdf = false): boolean {
    if (!isAllowedFile(file, allowPdf)) {
      TMessage.warning(`${label}仅支持 PNG、JPG、WEBP 图片${allowPdf ? '或 PDF' : ''}`)
      return false
    }
    if (file.size > MAX_MATERIAL_FILE_SIZE) {
      TMessage.warning(`${label}文件不能超过 10MB`)
      return false
    }
    return ensureToken()
  }

  async function handleBusinessLicenseFile(file: File) {
    if (!validateFile(file, '营业执照')) return
    businessLicenseUploading.value = true
    try {
      const result = await uploadBusinessLicenseFile(auth.token, file)
      options.form.businessLicenseFile = result.business_license_file
      TMessage.success('营业执照已上传')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传营业执照失败')
    } finally {
      businessLicenseUploading.value = false
    }
  }

  async function handleLegalCertFrontFile(file: File) {
    if (!validateFile(file, '身份证人像面')) return
    legalCertFrontUploading.value = true
    try {
      const result = await uploadLegalCertFrontFile(auth.token, file)
      options.form.legalCertFrontFile = result.front_file
      TMessage.success('身份证人像面已上传')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传身份证人像面失败')
    } finally {
      legalCertFrontUploading.value = false
    }
  }

  async function handleLegalCertBackFile(file: File) {
    if (!validateFile(file, '身份证国徽面')) return
    legalCertBackUploading.value = true
    try {
      const result = await uploadLegalCertBackFile(auth.token, file)
      options.form.legalCertBackFile = result.back_file
      TMessage.success('身份证国徽面已上传')
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '上传身份证国徽面失败')
    } finally {
      legalCertBackUploading.value = false
    }
  }

  async function handleConsentFile(file: File) {
    if (!validateFile(file, '监护人同意书', true)) return
    if (file.size > MAX_CONSENT_FILE_SIZE) {
      TMessage.warning('监护人同意书文件不能超过 5MB')
      return
    }
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
    handleBusinessLicenseFile,
    handleLegalCertFrontFile,
    handleLegalCertBackFile,
    handleConsentFile,
  }
}
