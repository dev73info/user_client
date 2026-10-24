import { describe, expect, it } from 'vitest'

import { draft, enterpriseDraft } from '@/__tests__/realnameDraftFixtures'
import {
  derivedEnterpriseMissing,
  isEnterpriseDraftMissing,
  isIdentityCardDraftMissing,
  isMinorGuardianMissing,
} from '@/shared/realnameForm'

/**
 * 必填缺失清单（纯函数层）：提交按钮为什么是灰的、提示里点名缺哪几项，都从这里来。
 *
 * 每个清单只算自己那个主体的账：个人不看企业进件资料，企业不看个人三项——
 * 少了这道门，两边的提交按钮都会被对方的清单一直按着。
 */
describe('必填缺失清单', () => {
  it('个人三项：姓名 / 证件号 / 手机号，缺一项就算缺', () => {
    const personal = draft({ idCardNo: '110101199001011234' })
    expect(isIdentityCardDraftMissing(personal)).toBe(false)
    expect(isIdentityCardDraftMissing({ ...personal, mobile: ' ' })).toBe(true)
  })

  it('清单只看自己那个主体：个人不算企业四项，企业也不算个人三项', () => {
    // 企业主体：个人三项本来就空着，不该把它算成「缺个人资料」（否则企业提交按钮永远点不动）
    expect(isIdentityCardDraftMissing(enterpriseDraft())).toBe(false)
    // 个人主体：企业进件四项也空着，不该算成「缺企业资料」
    expect(derivedEnterpriseMissing(draft())).toEqual([])
    expect(
      derivedEnterpriseMissing({
        ...draft(),
        companyProvCode: '',
        companyAreaCode: '',
        companyAddress: '',
        businessScope: '',
        businessLicenseExpiresOn: '',
      }),
    ).toEqual([])
    // 港澳台居住证走个人口径，同理
    expect(derivedEnterpriseMissing(enterpriseDraft({ authType: 'RESIDENCE_HK_MC' }))).toEqual([])
  })

  it('企业四项「只能靠识别」的进件资料按固定顺序点名', () => {
    expect(derivedEnterpriseMissing(enterpriseDraft())).toEqual([])
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

  it('企业必填项含法人身份证两面与法人证件有效期', () => {
    expect(isEnterpriseDraftMissing(enterpriseDraft())).toBe(false)
    expect(isEnterpriseDraftMissing(enterpriseDraft({ legalCertFrontFile: '' }))).toBe(true)
    expect(isEnterpriseDraftMissing(enterpriseDraft({ legalCertBackFile: '' }))).toBe(true)
    expect(isEnterpriseDraftMissing(enterpriseDraft({ legalCertExpiresOn: '' }))).toBe(true)
    expect(isEnterpriseDraftMissing(enterpriseDraft({ companyAddress: '' }))).toBe(true)
  })

  it('个体工商户与企业同一套口径', () => {
    const sole = enterpriseDraft({ authType: 'SOLE_PROPRIETOR' })
    expect(isEnterpriseDraftMissing(sole)).toBe(false)
    expect(isEnterpriseDraftMissing({ ...sole, businessLicenseFile: '' })).toBe(true)
  })

  it('监护人两项（同意 + 同意书）缺一不可', () => {
    expect(isMinorGuardianMissing(draft())).toBe(true)
    expect(isMinorGuardianMissing(draft({ guardianConsent: true }))).toBe(true)
    expect(
      isMinorGuardianMissing({
        ...draft(),
        guardianConsent: true,
        guardianConsentFile: 'https://cdn.example.com/c.pdf',
      }),
    ).toBe(false)
  })
})
