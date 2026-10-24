import { computed, reactive } from 'vue'

import type { SubmitRealnameVerificationPayload, UserRealnameVerification } from '@/api/realname'
import {
  businessLicenseDerivedNote as summarizeDerivedNote,
  businessLicenseDerivedSummary as summarizeDerivedFields,
} from '@/shared/realnameDisplay'
import {
  buildRealnamePayload,
  derivedEnterpriseMissing,
  idCardAge,
  isEnterpriseDraftMissing,
  isIdentityCardDraftMissing,
  isMinorGuardianMissing,
  validateRealnameDraft,
  type RealnameDraftFields,
} from '@/shared/realnameForm'

/**
 * 实名表单草稿域：`form`（22 个字段）、法人证件有效期的「用户动过」标记、主体切换回填、
 * 提交前校验与载荷组装。
 *
 * `form` 是**一整块**迁过来的——校验、载荷、回填都按整表读写，按字段切只会切出一堆
 * 半张表单，改一个字段还要在两处对齐。
 *
 * 规则与文案的纯函数都在 `@/shared/`：字段形状 / 常量 / 必填缺失清单 / 校验 / 载荷在
 * `realnameForm`，状态与识别结果的文案在 `realnameDisplay`（单向依赖前者），两边都有单测。
 * 本层只做「把 reactive 表单接上去」。
 *
 * 三件**不**在这里的事：
 * 1. `watch(form.authType)` 切主体时补经办人信息——它要读实名记录，属于跨域接线，留在视图；
 * 2. 「变更主体」模式开关 `realnameChangeMode`——它是实名身份的派生输入，归 `useRealnameIdentity`；
 * 3. 弹窗可见性——归视图（关掉弹窗就丢弃变更草稿那条 watch 必须在视图里）。
 */
export function useRealnameFormDraft() {
  const form = reactive<RealnameDraftFields>({
    authType: 'IDENTITY_CARD',
    idCardType: 1,
    realName: '',
    idCardNo: '',
    mobile: '',
    companyName: '',
    unifiedSocialCreditCode: '',
    businessLicenseNo: '',
    operatorName: '',
    operatorIdCardNo: '',
    guardianConsent: false,
    guardianConsentFile: '',
    businessLicenseFile: '',
    // 企业开户进件的另外两张证照（法人身份证正反面）：上传即落库，不参与实名提交 payload。
    legalCertFrontFile: '',
    legalCertBackFile: '',
    // 企业进件资料：支付渠道创建企业会员（对公收款账户）时逐项必填，企业 / 个体工商户主体要收齐。
    companyProvCode: '',
    companyAreaCode: '',
    companyAddress: '',
    businessScope: '',
    businessLicenseExpiresOn: '',
    legalCertBeginOn: '',
    legalCertExpiresOn: '',
  })

  /**
   * 法人证件有效期两项有没有被**用户自己动过**（手选 / 清除 / 点「长期有效」）。
   *
   * OCR 回填只往「空且没被动过」的项里写：OCR 会错，用户改过的值不能被它盖掉。
   * 用显式标记而不是「字段是否为空」——用户填了又清空也属于动过，不该被自动填回去。
   * 上传与识别那几个动作还在视图（下一轮搬 `useRealnameMaterials` / `useLegalCertPeriod`），
   * 标记本身属于草稿状态，所以留在这儿并对外暴露。
   */
  const legalCertPeriodEdited = reactive({ begin: false, expires: false })

  const identityCardSelected = computed(() => form.authType === 'IDENTITY_CARD')
  const enterpriseSelected = computed(() => form.authType === 'ENTERPRISE')
  const soleProprietorSelected = computed(() => form.authType === 'SOLE_PROPRIETOR')
  const businessSelected = computed(() => enterpriseSelected.value || soleProprietorSelected.value)

  // 仅在选中个人且证件号为 18 位（大陆身份证）时计算年龄
  const idCardAgeValue = computed(() =>
    identityCardSelected.value ? idCardAge(form.idCardNo) : null,
  )
  // 未满 14 周岁：禁止实名
  const isUnder14 = computed(() => idCardAgeValue.value !== null && idCardAgeValue.value < 14)
  // 14~18 周岁：需要监护人同意
  const isMinor14To18 = computed(
    () => idCardAgeValue.value !== null && idCardAgeValue.value >= 14 && idCardAgeValue.value < 18,
  )
  // 已满 18 周岁：无需监护人同意
  const isAdult = computed(() => idCardAgeValue.value !== null && idCardAgeValue.value >= 18)

  const identityCardRequiredMissing = computed(() => isIdentityCardDraftMissing(form))
  const businessLicenseDerivedMissing = computed(() => derivedEnterpriseMissing(form))
  const enterpriseRequiredMissing = computed(
    () => businessSelected.value && isEnterpriseDraftMissing(form),
  )
  const minorGuardianRequiredMissing = computed(
    () => isMinor14To18.value && isMinorGuardianMissing(form),
  )
  const businessLicenseDerivedSummary = computed(() => summarizeDerivedFields(form))
  const businessLicenseDerivedNote = computed(() => summarizeDerivedNote(form))

  /// 清空实名主体字段，回到「可以填新主体」的空表单（证件类型 radio 不动）。
  function resetSubjectFields() {
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
    form.guardianConsent = false
    form.guardianConsentFile = ''
    form.companyProvCode = ''
    form.companyAreaCode = ''
    form.companyAddress = ''
    form.businessScope = ''
    form.businessLicenseExpiresOn = ''
    form.legalCertBeginOn = ''
    form.legalCertExpiresOn = ''
    // 空表单：两项都还没被用户动过，OCR 可以回填
    legalCertPeriodEdited.begin = false
    legalCertPeriodEdited.expires = false
  }

  /**
   * 用服务端记录回填表单（原来叫 `patchForm`）。
   *
   * 「服务端数据一落地就不再是变更主体草稿态」这一条 `realnameChangeMode = false` 挪到了
   * `useRealnameIdentity.applyRealnameRecord`——那个标记归它持有，这里只管字段。
   */
  function prefill(record: UserRealnameVerification) {
    form.authType = record.auth_type
    form.realName = record.real_name ?? ''
    form.idCardNo = ''
    form.mobile = ''
    form.companyName = record.company_name ?? ''
    form.unifiedSocialCreditCode = record.unified_social_credit_code ?? ''
    form.businessLicenseNo = record.business_license_no ?? ''
    form.businessLicenseFile = record.business_license_file ?? ''
    form.operatorName = record.operator_name ?? ''
    form.operatorIdCardNo = ''
    form.guardianConsent = record.guardian_consent ?? false
    form.guardianConsentFile = record.guardian_consent_file ?? ''
    form.companyProvCode = record.company_prov_code ?? ''
    form.companyAreaCode = record.company_area_code ?? ''
    form.companyAddress = record.company_address ?? ''
    form.businessScope = record.business_scope ?? ''
    form.businessLicenseExpiresOn = record.business_license_expires_on ?? ''
    form.legalCertBeginOn = record.legal_cert_begin_on ?? ''
    form.legalCertExpiresOn = record.legal_cert_expires_on ?? ''
    // 回显的是服务端已存的值，不算用户改动；但两个非空项也不该被 OCR 覆盖，
    // 回填判定里「字段非空」这一条会挡住，所以这里只需把「用户改动」标记清干净。
    legalCertPeriodEdited.begin = false
    legalCertPeriodEdited.expires = false
  }

  /**
   * 用**本人的实名资料**回填「经办人」三项。
   *
   * 企业认证的经办人就是发起认证的本人，平台已经存过他的姓名 / 证件号 / 手机号，
   * 没必要让人再输一遍。只填空字段，不覆盖用户已经填过的内容。
   */
  function applyOperatorPrefill(record: UserRealnameVerification | null) {
    if (!record) return
    if (!form.operatorName.trim() && record.real_name) form.operatorName = record.real_name
    if (!form.operatorIdCardNo.trim() && record.id_card_no) {
      form.operatorIdCardNo = record.id_card_no
    }
    if (!form.mobile.trim() && record.mobile) form.mobile = record.mobile
  }

  /** 提交前校验：返回要提示给用户的那句话，空串表示可以提交。 */
  function validate(): string {
    return validateRealnameDraft(form)
  }

  function buildPayload(): SubmitRealnameVerificationPayload {
    return buildRealnamePayload(form)
  }

  return {
    form,
    legalCertPeriodEdited,
    identityCardSelected,
    enterpriseSelected,
    soleProprietorSelected,
    businessSelected,
    idCardAgeValue,
    isUnder14,
    isMinor14To18,
    isAdult,
    identityCardRequiredMissing,
    businessLicenseDerivedMissing,
    enterpriseRequiredMissing,
    minorGuardianRequiredMissing,
    businessLicenseDerivedSummary,
    businessLicenseDerivedNote,
    resetSubjectFields,
    prefill,
    applyOperatorPrefill,
    validate,
    buildPayload,
  }
}
