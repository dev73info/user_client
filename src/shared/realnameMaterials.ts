/**
 * 企业 / 个体工商户的「进件资料」口径。
 *
 * 支付渠道（Adapay）创建企业会员（对公收款账户）时会逐项校验下列资料：营业执照文件、
 * 企业所在省市、注册地址、经营范围、营业执照有效期、法人证件有效期。缺任意一项，整条
 * 对公收款通道都开不了——认证能通过，但之后绑不了对公账户。所以这几项在实名表单里就得
 * 收齐，缺料时也要把「缺哪几项」直接说给用户。
 *
 * 这里只放口径本身，表单渲染与提交留在视图里。
 */

/** 参与进件校验的实名资料字段（个人主体这些字段恒为空，不参与校验）。 */
export type EnterpriseOnboardingRecord = {
  business_license_file?: string | null
  company_prov_code?: string | null
  company_area_code?: string | null
  company_address?: string | null
  business_scope?: string | null
  business_license_expires_on?: string | null
  legal_cert_expires_on?: string | null
}

/** 缺哪几项进件资料，按渠道报错时会点到的顺序给出中文名。 */
export function missingEnterpriseOnboardingLabels(
  record: EnterpriseOnboardingRecord | null | undefined,
): string[] {
  const labels: string[] = []
  if (!record?.business_license_file?.trim()) labels.push('营业执照文件')
  // 省市是一组：渠道两个都校验，任一为空都算这项没填，提示里合并成一条更好读。
  if (!record?.company_prov_code?.trim() || !record?.company_area_code?.trim()) {
    labels.push('企业所在省市')
  }
  if (!record?.company_address?.trim()) labels.push('企业注册地址')
  if (!record?.business_scope?.trim()) labels.push('经营范围')
  if (!record?.business_license_expires_on?.trim()) labels.push('营业执照有效期')
  if (!record?.legal_cert_expires_on?.trim()) labels.push('法人证件有效期')
  return labels
}

/** 进件资料是否齐备：齐备才能按该主体重建对公收款账户。 */
export function enterpriseOnboardingComplete(
  record: EnterpriseOnboardingRecord | null | undefined,
): boolean {
  return missingEnterpriseOnboardingLabels(record).length === 0
}
