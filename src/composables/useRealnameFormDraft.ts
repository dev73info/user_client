import { computed, reactive, ref } from 'vue'

import type { UserRealnameVerification } from '@/api/realname'
import {
  isEnterpriseDraftMissing,
  isIdentityCardDraftMissing,
  manualRealnameMissing,
  validateManualRealnameDraft,
  validateRealnameDraft,
  type RealnameDraftFields,
} from '@/shared/realnameForm'

/** 认证路径：OCR 上传认证（爱签扫码核身）/ 手动填写认证（平台人工审核）。 */
export type RealnameAuthMode = 'ocr' | 'manual'

export function useRealnameFormDraft() {
  /** 当前认证路径：两条路径共用同一份字段，提交载荷与校验按它分流。 */
  const mode = ref<RealnameAuthMode>('ocr')
  const form = reactive<RealnameDraftFields>({
    authType: 'IDENTITY_CARD',
    identifyType: 153,
    idCardType: 1,
    realName: '',
    idCardNo: '',
    mobile: '',
    companyName: '',
    unifiedSocialCreditCode: '',
    businessLicenseNo: '',
    operatorName: '',
    operatorIdCardNo: '',
    operatorIdentifyType: 153,
    operatorCertFrontFile: '',
    operatorMobile: '',
    guardianRequired: false,
    guardianConsent: false,
    guardianConsentFile: '',
    businessLicenseFile: '',
    legalCertFrontFile: '',
    legalCertBackFile: '',
    companyProvCode: '',
    companyAreaCode: '',
    companyAddress: '',
    businessScope: '',
    businessLicenseExpiresOn: '',
    legalCertBeginOn: '',
    legalCertExpiresOn: '',
  })

  const identityCardSelected = computed(() => form.authType === 'IDENTITY_CARD')
  const enterpriseSelected = computed(() => form.authType === 'ENTERPRISE')
  const soleProprietorSelected = computed(() => form.authType === 'SOLE_PROPRIETOR')
  const businessSelected = computed(() => enterpriseSelected.value || soleProprietorSelected.value)
  const identityCardRequiredMissing = computed(() => isIdentityCardDraftMissing(form))
  const enterpriseRequiredMissing = computed(
    () => businessSelected.value && isEnterpriseDraftMissing(form),
  )
  /** 手动路径的必填缺失：与 OCR 路径不同，个人不要求身份证照片。 */
  const manualRequiredMissing = computed(() => manualRealnameMissing(form).length > 0)

  function resetSubjectFields() {
    form.identifyType = form.authType === 'IDENTITY_CARD' ? 153 : 369
    form.idCardType = 1
    form.realName = ''
    form.idCardNo = ''
    form.mobile = ''
    form.companyName = ''
    form.unifiedSocialCreditCode = ''
    form.businessLicenseNo = ''
    form.businessLicenseFile = ''
    form.legalCertFrontFile = ''
    form.legalCertBackFile = ''
    form.operatorName = ''
    form.operatorIdCardNo = ''
    form.operatorIdentifyType = 153
    form.operatorCertFrontFile = ''
    form.operatorMobile = ''
    form.guardianRequired = false
    form.guardianConsent = false
    form.guardianConsentFile = ''
    form.companyProvCode = ''
    form.companyAreaCode = ''
    form.companyAddress = ''
    form.businessScope = ''
    form.businessLicenseExpiresOn = ''
    form.legalCertBeginOn = ''
    form.legalCertExpiresOn = ''
  }

  function prefill(record: UserRealnameVerification) {
    form.authType = record.auth_type
    resetSubjectFields()
  }

  function validate(): string {
    return mode.value === 'manual' ? validateManualRealnameDraft(form) : validateRealnameDraft(form)
  }

  return {
    mode,
    form,
    identityCardSelected,
    enterpriseSelected,
    soleProprietorSelected,
    businessSelected,
    identityCardRequiredMissing,
    enterpriseRequiredMissing,
    manualRequiredMissing,
    resetSubjectFields,
    prefill,
    validate,
  }
}
