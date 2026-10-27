import { describe, expect, it } from 'vitest'

import { draft, enterpriseDraft } from '@/__tests__/realnameDraftFixtures'
import {
  derivedEnterpriseMissing,
  isEnterpriseDraftMissing,
  isIdentityCardDraftMissing,
  isMinorGuardianMissing,
} from '@/shared/realnameForm'

describe('实名材料必填清单', () => {
  it('个人只要求本次身份证与手机号，不要求手填姓名和证件号', () => {
    expect(isIdentityCardDraftMissing(draft({ realName: '', idCardNo: '' }))).toBe(false)
    expect(isIdentityCardDraftMissing(draft({ legalCertFrontFile: '' }))).toBe(true)
    expect(isIdentityCardDraftMissing(draft({ mobile: ' ' }))).toBe(true)
  })

  it('个人不检查企业材料；企业也不检查个人姓名与证件号', () => {
    expect(isIdentityCardDraftMissing(enterpriseDraft())).toBe(false)
    expect(derivedEnterpriseMissing(draft())).toEqual([])
    expect(derivedEnterpriseMissing(enterpriseDraft({ authType: 'RESIDENCE_HK_MC' }))).toEqual([])
  })

  it('收款资料缺失仍单独列出，不与认证材料校验混合', () => {
    expect(
      derivedEnterpriseMissing(
        enterpriseDraft({
          companyProvCode: '',
          companyAreaCode: '',
          companyAddress: '',
          businessScope: '',
          businessLicenseExpiresOn: '',
        }),
      ),
    ).toEqual(['企业所在省市', '企业注册地址', '经营范围', '营业执照有效期'])
  })

  it('企业要求法人、经办人材料及各自手机号', () => {
    expect(isEnterpriseDraftMissing(enterpriseDraft())).toBe(false)
    for (const patch of [
      { legalCertFrontFile: '' },
      { legalCertBackFile: '' },
      { businessLicenseFile: '' },
      { operatorCertFrontFile: '' },
      { mobile: '' },
      { operatorMobile: '' },
    ]) {
      expect(isEnterpriseDraftMissing(enterpriseDraft(patch))).toBe(true)
    }
  })

  it('个体工商户与企业同一套材料口径', () => {
    expect(isEnterpriseDraftMissing(enterpriseDraft({ authType: 'SOLE_PROPRIETOR' }))).toBe(false)
  })

  it('监护人同意与同意书缺一不可', () => {
    expect(isMinorGuardianMissing(draft())).toBe(true)
    expect(isMinorGuardianMissing(draft({ guardianConsent: true }))).toBe(true)
    expect(
      isMinorGuardianMissing(
        draft({ guardianConsent: true, guardianConsentFile: '/uploads/consent.pdf' }),
      ),
    ).toBe(false)
  })
})
