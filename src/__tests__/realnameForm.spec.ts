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

/**
 * 实名表单的校验与载荷（纯函数层）。
 *
 * 这个页面原来零覆盖，而它的规则最容易「改一处、悄悄坏一处」：年龄 14/18 岁的边界、
 * 必填项提示顺序、企业进件资料只在企业主体下传。所以这里按规则逐条钉住。
 * 必填缺失清单的用例在 `realnameRequiredFields.spec.ts`（同样是这份纯函数层）。
 */
describe('手机号与身份证年龄', () => {
  it('手机号必须是 1 开头的 11 位数字', () => {
    expect(isValidMobile('13800000000')).toBe(true)
    expect(isValidMobile(' 13800000000 ')).toBe(true)
    expect(isValidMobile('23800000000')).toBe(false)
    expect(isValidMobile('1380000000')).toBe(false)
    expect(isValidMobile('')).toBe(false)
  })

  it('生日非法（2 月 30 日）与位数不对都算不出年龄', () => {
    expect(idCardAge('110101199002301234', TODAY)).toBeNull()
    expect(idCardAge('110101900101123', TODAY)).toBeNull()
    expect(idCardAge('', TODAY)).toBeNull()
  })

  it('14 岁与 18 岁的边界按「生日当天」算，差一天就换档', () => {
    const idCard = '110101201005101234' // 2010-05-10 生
    // 13 岁 364 天：未满 14
    expect(idCardAge(idCard, new Date(2024, 4, 9))).toBe(13)
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2024, 4, 9))).toBe('under14')
    // 生日当天满 14：进入「需监护人同意」那一档
    expect(idCardAge(idCard, new Date(2024, 4, 10))).toBe(14)
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2024, 4, 10))).toBe('minor')
    // 17 岁 364 天仍是未成年
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2028, 4, 9))).toBe('minor')
    // 生日当天满 18：成年
    expect(idCardAge(idCard, new Date(2028, 4, 10))).toBe(18)
    expect(idCardAgeBand('IDENTITY_CARD', idCard, new Date(2028, 4, 10))).toBe('adult')
  })

  it('企业主体、空证件号都算不出年龄段', () => {
    expect(idCardAgeBand('ENTERPRISE', '110101201005101234', TODAY)).toBe('unknown')
    expect(idCardAgeBand('IDENTITY_CARD', '', TODAY)).toBe('unknown')
  })
})

describe('提交前校验：个人主体', () => {
  it('姓名/证件号缺失先拦，其次才是手机号', () => {
    expect(validateRealnameDraft(draft({ realName: '  ' }), TODAY)).toBe('请填写姓名和证件号')
    expect(validateRealnameDraft(draft({ idCardNo: '' }), TODAY)).toBe('请填写姓名和证件号')
    expect(validateRealnameDraft(draft({ mobile: '' }), TODAY)).toBe('请填写手机号')
    expect(validateRealnameDraft(draft({ mobile: '138' }), TODAY)).toBe('请填写正确的手机号')
  })

  it('未满 14 周岁禁止实名；14~18 周岁要同意 + 同意书', () => {
    const under14 = draft({ idCardNo: '110101201505101234' }) // 2026 年时 11 岁
    expect(validateRealnameDraft(under14, TODAY)).toBe('未满 14 周岁的未成年人不能进行实名认证')

    const minor = draft({ idCardNo: '110101201005101234' }) // 2026 年时 16 岁
    expect(validateRealnameDraft(minor, TODAY)).toBe('请确认已取得监护人同意')
    expect(validateRealnameDraft({ ...minor, guardianConsent: true }, TODAY)).toBe(
      '请上传监护人同意书',
    )
    expect(
      validateRealnameDraft(
        { ...minor, guardianConsent: true, guardianConsentFile: 'https://cdn.example.com/c.pdf' },
        TODAY,
      ),
    ).toBe('')
  })

  it('成年人不需要监护人同意也能过', () => {
    expect(validateRealnameDraft(draft(), TODAY)).toBe('')
  })
})

describe('提交前校验：企业主体', () => {
  it('填齐的企业草稿可以提交', () => {
    expect(validateRealnameDraft(enterpriseDraft(), TODAY)).toBe('')
  })

  it('缺营业执照、法人身份证两面时逐项提示', () => {
    expect(validateRealnameDraft(enterpriseDraft({ businessLicenseFile: '' }), TODAY)).toBe(
      '请上传营业执照',
    )
    expect(validateRealnameDraft(enterpriseDraft({ legalCertFrontFile: '' }), TODAY)).toBe(
      '请上传法人身份证人像面照片',
    )
    expect(validateRealnameDraft(enterpriseDraft({ legalCertBackFile: '' }), TODAY)).toBe(
      '请上传法人身份证国徽面照片',
    )
  })

  it('四项「只能靠识别」的进件资料缺失时指向重传，而不是让用户去填不存在的输入框', () => {
    // 省份与城市是一组：任一为空都算这项没填，提示里合并成一条
    expect(validateRealnameDraft(enterpriseDraft({ companyProvCode: '' }), TODAY)).toBe(
      '未能从营业执照识别出企业所在省市，请重新上传更清晰的照片',
    )
    // 四项全空时按固定顺序一起点名
    expect(
      validateRealnameDraft(
        enterpriseDraft({
          companyProvCode: '',
          companyAreaCode: '',
          companyAddress: '',
          businessScope: '',
          businessLicenseExpiresOn: '',
        }),
        TODAY,
      ),
    ).toBe(
      '未能从营业执照识别出企业所在省市、企业注册地址、经营范围、营业执照有效期，请重新上传更清晰的照片',
    )
    expect(validateRealnameDraft(enterpriseDraft({ companyAddress: '' }), TODAY)).toBe(
      '未能从营业执照识别出企业注册地址，请重新上传更清晰的照片',
    )
  })

  it('经营范围超过渠道上限也要求重传（截断逻辑在 OCR 那侧）', () => {
    expect(validateRealnameDraft(enterpriseDraft({ businessScope: '技'.repeat(201) }), TODAY)).toBe(
      '营业执照识别出的经营范围超过 200 字（渠道限制），请重新上传营业执照',
    )
    expect(validateRealnameDraft(enterpriseDraft({ businessScope: '技'.repeat(200) }), TODAY)).toBe(
      '',
    )
  })

  it('法人证件有效期必须是可以回传后端的 8 位日期，长期有效填约定值', () => {
    expect(validateRealnameDraft(enterpriseDraft({ legalCertBeginOn: '' }), TODAY)).toBe(
      '请选择法人证件有效期起始日',
    )
    expect(validateRealnameDraft(enterpriseDraft({ legalCertExpiresOn: '长期有效' }), TODAY)).toBe(
      '请选择法人证件有效期截止日',
    )
    expect(
      validateRealnameDraft(
        enterpriseDraft({ legalCertBeginOn: '20240101', legalCertExpiresOn: LONG_TERM_DATE }),
        TODAY,
      ),
    ).toBe('')
    expect(LONG_TERM_DATE).toBe('20991231')
  })
})

describe('提交载荷', () => {
  it('空字段不进载荷，个人主体不带任何企业进件资料', () => {
    expect(buildRealnamePayload(draft({ businessLicenseNo: '  ' }), TODAY)).toEqual({
      auth_type: 'IDENTITY_CARD',
      real_name: '张三',
      id_card_no: '110101199001011234',
      mobile: '13800000000',
    })
  })

  it('14~18 周岁的未成年人才传监护人同意：没勾也给 false，成年人与企业一概不带', () => {
    const minor = draft({ idCardNo: '110101201005101234' })
    // 未成年人一律带上这个布尔（没勾就是 false），同意书只在填了之后才传
    expect(buildRealnamePayload(minor, TODAY)).toMatchObject({ guardian_consent: false })
    expect(buildRealnamePayload(minor, TODAY)).not.toHaveProperty('guardian_consent_file')

    const consented = {
      ...minor,
      guardianConsent: true,
      guardianConsentFile: 'https://cdn.example.com/c.pdf',
    }
    expect(buildRealnamePayload(consented, TODAY)).toMatchObject({
      guardian_consent: true,
      guardian_consent_file: 'https://cdn.example.com/c.pdf',
    })

    // 成年人（上面的 draft() 默认 1990 年生）不带这两项
    expect(buildRealnamePayload(draft(), TODAY)).not.toHaveProperty('guardian_consent')
  })

  it('企业主体带上七项进件资料（哪怕为空也占位，由后端按缺失处理）', () => {
    const payload = buildRealnamePayload(enterpriseDraft(), TODAY)
    expect(payload).toMatchObject({
      auth_type: 'ENTERPRISE',
      company_name: '示例科技有限公司',
      unified_social_credit_code: '91310000MA1K35Q64U',
      business_license_file: 'https://cdn.example.com/bl.jpg',
      operator_name: '张三',
      operator_id_card_no: '110101199001011234',
      company_prov_code: '0011',
      company_area_code: '1100',
      company_address: '北京市朝阳区某路 1 号',
      business_scope: '技术开发、技术咨询',
      business_license_expires_on: LONG_TERM_DATE,
      legal_cert_begin_on: '20200101',
      legal_cert_expires_on: LONG_TERM_DATE,
    })
    // 企业主体不传监护人同意（那两项只属于未成年个人）
    expect(payload).not.toHaveProperty('guardian_consent')

    const blank = buildRealnamePayload(enterpriseDraft({ companyAddress: '' }), TODAY)
    expect(blank.company_address).toBe('')
  })

  it('提交前一律 trim，避免把首尾空格带进接口参数', () => {
    const payload = buildRealnamePayload(
      draft({ realName: ' 张三 ', mobile: ' 13800000000 ' }),
      TODAY,
    )
    expect(payload.real_name).toBe('张三')
    expect(payload.mobile).toBe('13800000000')
  })
})
