import { describe, expect, it } from 'vitest'

import { TODAY, draft, enterpriseDraft } from '@/__tests__/realnameDraftFixtures'
import {
  LONG_TERM_DATE,
  buildRealnamePayload,
  idCardAge,
  idCardAgeBand,
  isValidMobile,
  validateRealnameDraft,
} from '@/shared/realnameForm'

describe('手机号与身份证年龄', () => {
  it('手机号必须是 1 开头的 11 位数字', () => {
    expect(isValidMobile('13800000000')).toBe(true)
    expect(isValidMobile(' 13800000000 ')).toBe(true)
    expect(isValidMobile('23800000000')).toBe(false)
    expect(isValidMobile('1380000000')).toBe(false)
  })

  it('生日非法与位数不对都算不出年龄', () => {
    expect(idCardAge('110101199002301234', TODAY)).toBeNull()
    expect(idCardAge('110101900101123', TODAY)).toBeNull()
    expect(idCardAge('', TODAY)).toBeNull()
  })

  it('14 岁与 18 岁的边界按生日当天计算', () => {
    const idCard = '110101201005101234'
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2024, 4, 9))).toBe('under14')
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2024, 4, 10))).toBe('minor')
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2028, 4, 10))).toBe('adult')
  })
})

describe('材料认证表单校验', () => {
  it('个人只拦身份证、手机号和认证方式，不拦手填姓名与证件号', () => {
    expect(validateRealnameDraft(draft({ realName: '', idCardNo: '' }))).toBe('')
    expect(validateRealnameDraft(draft({ legalCertFrontFile: '' }))).toBe('请上传身份证人像面照片')
    expect(validateRealnameDraft(draft({ mobile: '' }))).toBe('请填写正确的手机号')
    expect(validateRealnameDraft(draft({ mobile: '138' }))).toBe('请填写正确的手机号')
    expect(validateRealnameDraft(draft({ identifyType: 351 }))).toBe('请选择个人认证方式')
  })

  it('需要监护人材料时才校验同意与同意书', () => {
    expect(validateRealnameDraft(draft({ guardianRequired: true }))).toBe('请确认已取得监护人同意')
    expect(validateRealnameDraft(draft({ guardianRequired: true, guardianConsent: true }))).toBe(
      '请上传监护人同意书',
    )
    expect(
      validateRealnameDraft(
        draft({
          guardianRequired: true,
          guardianConsent: true,
          guardianConsentFile: '/uploads/consent.pdf',
        }),
      ),
    ).toBe('')
  })

  it('企业只拦本次三张证照与认证方式，工商信息留给后端 OCR', () => {
    expect(validateRealnameDraft(enterpriseDraft())).toBe('')
    expect(validateRealnameDraft(enterpriseDraft({ identifyType: 153 }))).toBe('请选择企业认证方式')
    expect(validateRealnameDraft(enterpriseDraft({ legalCertFrontFile: '' }))).toBe(
      '请上传身份证人像面照片',
    )
    expect(validateRealnameDraft(enterpriseDraft({ legalCertBackFile: '' }))).toBe(
      '请上传法人身份证国徽面照片',
    )
    expect(validateRealnameDraft(enterpriseDraft({ businessLicenseFile: '' }))).toBe(
      '请上传营业执照',
    )
    expect(
      validateRealnameDraft(
        enterpriseDraft({ companyName: '', companyAddress: '', businessScope: '' }),
      ),
    ).toBe('')
  })
})

describe('旧实名提交载荷', () => {
  it('空字段不进载荷，个人主体不带企业资料', () => {
    expect(buildRealnamePayload(draft({ businessLicenseNo: '  ' }), TODAY)).toEqual({
      auth_type: 'IDENTITY_CARD',
      real_name: '张三',
      id_card_no: '110101199001011234',
      mobile: '13800000000',
    })
  })

  it('未成年人的监护人材料仍按身份证年龄决定', () => {
    const minor = draft({ idCardNo: '110101201005101234' })
    expect(buildRealnamePayload(minor, TODAY)).toMatchObject({ guardian_consent: false })
    const consented = {
      ...minor,
      guardianConsent: true,
      guardianConsentFile: '/uploads/consent.pdf',
    }
    expect(buildRealnamePayload(consented, TODAY)).toMatchObject({
      guardian_consent: true,
      guardian_consent_file: '/uploads/consent.pdf',
    })
    expect(buildRealnamePayload(draft(), TODAY)).not.toHaveProperty('guardian_consent')
  })

  it('企业资料保留给旧的提交端点，并统一 trim', () => {
    expect(buildRealnamePayload(enterpriseDraft(), TODAY)).toMatchObject({
      auth_type: 'ENTERPRISE',
      company_name: '示例科技有限公司',
      company_prov_code: '0011',
      legal_cert_expires_on: LONG_TERM_DATE,
    })
    expect(buildRealnamePayload(draft({ realName: ' 张三 ' }), TODAY).real_name).toBe('张三')
  })
})
