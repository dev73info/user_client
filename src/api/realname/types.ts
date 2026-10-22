export type RealnameAuthType =
  | 'IDENTITY_CARD'
  | 'ENTERPRISE'
  | 'SOLE_PROPRIETOR'
  | 'RESIDENCE_HK_MC'
  | 'RESIDENCE_TAIWAN'
export type UserRealnameStatus = 'pending' | 'approved' | 'rejected'

export type UserRealnameVerification = {
  username: string
  auth_type: RealnameAuthType
  status: UserRealnameStatus
  real_name?: string | null
  /** 本人证件号（**仅本人可见**，管理端接口会清空）：企业认证回填「经办人身份证号」用 */
  id_card_no?: string | null
  id_card_no_masked?: string | null
  birthday?: string | null
  mobile_masked?: string | null
  /** 本人手机号（**仅本人可见**）：企业认证回填「经办人手机号」用 */
  mobile?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  business_license_file?: string | null
  operator_name?: string | null
  operator_id_card_no_masked?: string | null
  /**
   * 企业进件资料：支付渠道创建企业会员（对公收款账户）时逐项必填，
   * 缺任意一项整条对公收款通道都开不了，所以企业主体提交实名时就要收齐。
   */
  company_prov_code?: string | null
  company_area_code?: string | null
  company_address?: string | null
  business_scope?: string | null
  business_license_expires_on?: string | null
  /** 法人证件有效期起始日，`YYYYMMDD`。 */
  legal_cert_begin_on?: string | null
  legal_cert_expires_on?: string | null
  guardian_consent?: boolean | null
  guardian_consent_file?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_by_avatar_url?: string | null
  reviewed_at?: string | null
  created_at: string
  updated_at: string
  /** 爱签实名认证流水号：仅走爱签核身的主体才有，用于「重新实名认证」。 */
  /** 是否处于「主体变更」：本行正在替换一份已通过的主体，撤回即取消变更、还原原主体。 */
  changing_subject?: boolean
}

export type SubmitRealnameVerificationPayload = {
  auth_type: RealnameAuthType
  real_name?: string | null
  id_card_no?: string | null
  mobile?: string | null
  company_name?: string | null
  unified_social_credit_code?: string | null
  business_license_no?: string | null
  business_license_file?: string | null
  operator_name?: string | null
  operator_id_card_no?: string | null
  /** 企业进件资料：企业 / 个体工商户主体必填（渠道逐项校验），个人主体不传。 */
  company_prov_code?: string | null
  company_area_code?: string | null
  company_address?: string | null
  business_scope?: string | null
  /** 营业执照有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  business_license_expires_on?: string | null
  /** 法人证件有效期起始日，`YYYYMMDD`。 */
  legal_cert_begin_on?: string | null
  /** 法人证件有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  legal_cert_expires_on?: string | null
  guardian_consent?: boolean | null
  guardian_consent_file?: string | null
}

export type SubmitRealnameVerificationResponse = UserRealnameVerification

export type StartWechatFaceidVerificationResponse = {
  verification: UserRealnameVerification
  order_no: string
  biz_token: string
  auth_url: string
  expires_in_seconds: number
}

export type CompleteWechatFaceidVerificationPayload = {
  order_no?: string | null
  biz_token?: string | null
}

export type WithdrawRealnameVerificationResponse = {
  withdrawn: boolean
  /** 本次撤回是「取消主体变更」：账号已还原成变更前那份实名主体，而不是回到未提交。 */
  restored: boolean
}

export type StartAsignIdentifyPayload = {
  real_name: string
  id_card_no: string
  mobile?: string | null
  guardian_consent?: boolean | null
  guardian_consent_file?: string | null
}

export type StartAsignIdentifyResponse = {
  auth_url: string
  /** 业务 ID，用于查询人脸活体认证结果 */
  biz_id?: string | null
  /** 是否为人工审核（非大陆身份证个人证件，爱签不提供实名认证服务时） */
  manual_review?: boolean
}

export type StartCompanyIdentifyPayload = {
  company_name: string
  unified_social_credit_code: string
  operator_name: string
  operator_id_card_no: string
  mobile: string
  business_license_file: string
  /** 企业所在省份 / 城市（渠道省市编码表，非国标行政区划码），企业进件必填。 */
  company_prov_code: string
  company_area_code: string
  company_address: string
  business_scope: string
  /** 营业执照有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  business_license_expires_on: string
  /** 法人证件有效期起始日，`YYYYMMDD`（与截止日同口径）。 */
  legal_cert_begin_on: string
  /** 法人证件有效期截止日，`YYYYMMDD`，长期填 20991231。 */
  legal_cert_expires_on: string
}

export type StartCompanyIdentifyResponse = {
  auth_url: string
  /** 业务 ID（发起认证时返回） */
  biz_id?: string | null
}

export type GuardianConsentUploadResponse = {
  guardian_consent_file: string
}

export type BusinessLicenseUploadResponse = {
  business_license_file: string
}

export type LegalCertFrontUploadResponse = {
  front_file: string
}

export type LegalCertBackUploadResponse = {
  back_file: string
}

/** 营业执照 OCR 识别结果：只包含可回填表单的白名单字段。 */
export type BusinessLicenseOcrResult = {
  company_name: string | null
  unified_social_credit_code: string | null
  company_address: string | null
  business_scope: string | null
  legal_person: string | null
  /** 有效期截止 `YYYYMMDD`（「长期」已由后端归一为 20991231） */
  business_license_expires_on: string | null
}

/** 法人身份证的哪一面：`front` = 人像面，`back` = 国徽面（与两个上传端点一一对应）。 */
export type LegalCertOcrSide = 'front' | 'back'

/**
 * 法人证件有效期 OCR 结果：只回有效期起止（`YYYYMMDD`），识别不到的项为 `null`。
 *
 * 与营业执照 OCR 同口径的白名单：身份证号、姓名等敏感字段后端一律不外露。
 */
export type LegalCertOcrResult = {
  cert_begin_on: string | null
  cert_expires_on: string | null
}
