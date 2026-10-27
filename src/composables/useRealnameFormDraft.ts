import { computed, reactive } from 'vue'

import type { UserRealnameVerification } from '@/api/realname'
import {
  isEnterpriseDraftMissing,
  isIdentityCardDraftMissing,
  validateRealnameDraft,
  type RealnameDraftFields,
} from '@/shared/realnameForm'

export function useRealnameFormDraft() {
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
    return validateRealnameDraft(form)
  }

  return {
    form,
    identityCardSelected,
    enterpriseSelected,
    soleProprietorSelected,
    businessSelected,
    identityCardRequiredMissing,
    enterpriseRequiredMissing,
    resetSubjectFields,
    prefill,
    validate,
  }
}
