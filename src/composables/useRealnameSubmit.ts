import { ref, type Ref } from 'vue'

import { HttpError } from '@/api/http'
import {
  getMyRealnameVerification,
  REALNAME_ERROR_CODES,
  quickStartAsignIdentify,
  type QuickStartIdentifyPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import type { RealnameDraftFields } from '@/shared/realnameForm'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export type RealnameSubmitOptions = {
  form: RealnameDraftFields
  validate: () => string
  locked: Ref<boolean>
  rejected: Ref<boolean>
  applyRecord: (record: UserRealnameVerification) => void
  beginChallenge: (authUrl: string) => Promise<void>
  faceidStarting: Ref<boolean>
}

export function useRealnameSubmit(options: RealnameSubmitOptions) {
  const auth = useAuthStore()
  const submitting = ref(false)

  async function submitRealname() {
    auth.hydrate()
    if (!auth.token.trim()) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }
    if (options.locked.value && !options.rejected.value) {
      TMessage.warning('实名认证正在处理中，请稍后查询结果')
      return
    }
    const validationError = options.validate()
    if (validationError) {
      TMessage.warning(validationError)
      return
    }

    submitting.value = true
    options.faceidStarting.value = true
    try {
      const form = options.form
      const payload: QuickStartIdentifyPayload = {
        auth_type: form.authType,
        identify_type: form.identifyType,
        mobile: form.mobile.trim(),
        legal_cert_front_file: form.legalCertFrontFile,
      }
      if (form.authType !== 'IDENTITY_CARD') {
        payload.legal_cert_back_file = form.legalCertBackFile
        payload.business_license_file = form.businessLicenseFile
      }
      if (form.guardianConsentFile) {
        payload.guardian_consent = form.guardianConsent
        payload.guardian_consent_file = form.guardianConsentFile
      }
      const result = await quickStartAsignIdentify(auth.token, payload)
      if (!result.auth_url) throw new Error('爱签未返回认证链接，请稍后重试')
      options.applyRecord(await getMyRealnameVerification(auth.token))
      await options.beginChallenge(result.auth_url)
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.code === REALNAME_ERROR_CODES.guardianConsentRequired
      ) {
        options.form.guardianRequired = true
      }
      TMessage.error(error instanceof Error ? error.message : '发起实名认证失败')
    } finally {
      submitting.value = false
      options.faceidStarting.value = false
    }
  }

  return { submitting, submitRealname }
}
