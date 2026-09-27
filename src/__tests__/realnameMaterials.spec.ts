import { describe, expect, it } from 'vitest'

import {
  enterpriseOnboardingComplete,
  missingEnterpriseOnboardingLabels,
} from '@/shared/realnameMaterials'

/** 一份齐备的企业进件资料，各用例只改需要缺的那几项。 */
const completeRecord = {
  business_license_file: '/uploads/realname-business-licenses/flow/license.jpg',
  company_prov_code: '0053',
  company_area_code: '5315',
  company_address: '云南省昭通市彝良县角奎街道人民街1号',
  business_scope: '信息技术咨询服务',
  business_license_expires_on: '20991231',
  legal_cert_expires_on: '20991231',
}

describe('企业进件资料的缺口', () => {
  it('资料齐备时没有缺口', () => {
    expect(missingEnterpriseOnboardingLabels(completeRecord)).toEqual([])
    expect(enterpriseOnboardingComplete(completeRecord)).toBe(true)
  })

  it('缺哪一项就点名哪一项，而不是笼统说「资料不全」', () => {
    expect(
      missingEnterpriseOnboardingLabels({ ...completeRecord, business_license_file: '' }),
    ).toEqual(['营业执照文件'])
    expect(missingEnterpriseOnboardingLabels({ ...completeRecord, business_scope: '' })).toEqual([
      '经营范围',
    ])
  })

  it('省市任一项为空都算这项没填，合并成一条提示', () => {
    expect(missingEnterpriseOnboardingLabels({ ...completeRecord, company_prov_code: '' })).toEqual(
      ['企业所在省市'],
    )
    expect(
      missingEnterpriseOnboardingLabels({ ...completeRecord, company_area_code: null }),
    ).toEqual(['企业所在省市'])
  })

  it('六项全缺时按渠道校验顺序列全', () => {
    expect(missingEnterpriseOnboardingLabels({})).toEqual([
      '营业执照文件',
      '企业所在省市',
      '企业注册地址',
      '经营范围',
      '营业执照有效期',
      '法人证件有效期',
    ])
  })

  it('只有空白字符等于没填', () => {
    expect(
      missingEnterpriseOnboardingLabels({ ...completeRecord, company_address: '   ' }),
    ).toEqual(['企业注册地址'])
  })

  it('没有实名记录时视为全部缺失，不报错', () => {
    expect(enterpriseOnboardingComplete(null)).toBe(false)
    expect(missingEnterpriseOnboardingLabels(undefined)).toHaveLength(6)
  })
})
