<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { HttpError } from '@/api/http'
import {
  closeAccount,
  getBoundProviders,
  getProviderBindUrl,
  getWechatBindAuthorizeUrl,
  getWechatBindQrUrl,
  unbindProvider,
} from '@/api/auth'
import {
  getProfile,
  sendProfileEmailChangeCode,
  sendProfilePasswordCode,
  sendProfileTwoFactorCode,
  updateProfile,
  updateProfileEmail,
  updateProfilePassword,
  updateProfileTwoFactor,
} from '@/api/settings'
import {
  getMyRealnameVerification,
  ocrBusinessLicense,
  recognizeLegalCertPeriod,
  startAsignIdentify,
  startCompanyAsignIdentify,
  submitMyRealnameVerification,
  uploadBusinessLicenseFile,
  uploadGuardianConsentFile,
  uploadLegalCertBackFile,
  uploadLegalCertFrontFile,
  type LegalCertOcrSide,
  type RealnameAuthType,
  type StartAsignIdentifyPayload,
  type StartCompanyIdentifyPayload,
  type SubmitRealnameVerificationPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import {
  createSealMakeOnline,
  getMySeals,
  modifyCompanyInfo,
  modifyMobileByCode,
  modifyUserName,
  sendVerifyCode,
  type MySealsData,
} from '@/api/asignAccount'
import { useAuthStore } from '@/stores/auth'
import RealnameHero from '@/components/RealnameHero.vue'
import WechatBindQrModal from '@/components/WechatBindQrModal.vue'
import AsignDialog from '@/components/account/AsignDialog.vue'
import CloseAccountDialog from '@/components/account/CloseAccountDialog.vue'
import CloseSettleDialog from '@/components/account/CloseSettleDialog.vue'
import EmailDialog from '@/components/account/EmailDialog.vue'
import FaceidDialog from '@/components/account/FaceidDialog.vue'
import PasswordDialog from '@/components/account/PasswordDialog.vue'
import SealDialog from '@/components/account/SealDialog.vue'
import SettlementDialog from '@/components/account/SettlementDialog.vue'
import TwoFactorDialog from '@/components/account/TwoFactorDialog.vue'
import UsernameDialog from '@/components/account/UsernameDialog.vue'
import { getSettlementCities, settlementProvinces } from '@/utils/settlementAccount'
import { useFaceidChallenge } from '@/composables/useFaceidChallenge'
import { useSettlementAccount, type AdapayMemberStatus } from '@/composables/useSettlementAccount'
import {
  TAlert,
  TButton,
  TCard,
  TCheckbox,
  TDatePicker,
  TDialog,
  TForm,
  TFormItem,
  TIcon,
  TInput,
  TMessage,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
  TTag,
  ArrowRight,
  Bell,
  CollectionTag,
  Connection,
  CreditCard,
  Iphone,
  Lock,
  Message,
  OfficeBuilding,
  Postcard,
  Promotion,
  RefreshLeft,
  SwitchButton,
  User,
  Warning,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const profileLoading = ref(false)
const newUsername = ref('')
const usernameLoading = ref(false)
const profileEmail = ref('')
const newEmail = ref('')
const emailCode = ref('')
const emailCodeSending = ref(false)
const emailLoading = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const passwordCode = ref('')
const passwordCodeSending = ref(false)
const passwordLoading = ref(false)
const twoFactorEnabled = ref(false)
const twoFactorTargetEnabled = ref(false)
const twoFactorCode = ref('')
const twoFactorCodeSending = ref(false)
const twoFactorLoading = ref(false)
const wechatBindingLoading = ref(false)
const wechatBound = ref(false)
const boundProviders = ref<string[]>([])
const providerBindingLoading = ref(false)
const accountCloseDialogVisible = ref(false)
const accountCloseConfirmation = ref('')
const accountClosing = ref(false)

const submitting = ref(false)
const realnameDialogVisible = ref(false)
const consentUploading = ref(false)
const consentFileInput = ref<HTMLInputElement | null>(null)
const businessLicenseUploading = ref(false)
/** 营业执照 OCR 进行中（辅助填写，不挡提交）。 */
const businessLicenseOcrLoading = ref(false)
const businessLicenseFileInput = ref<HTMLInputElement | null>(null)
/** 法人身份证人像面 / 国徽面：企业开户进件三张证照里的另外两张（上传即落库）。 */
const legalCertFrontUploading = ref(false)
const legalCertBackUploading = ref(false)
const legalCertFrontFileInput = ref<HTMLInputElement | null>(null)
const legalCertBackFileInput = ref<HTMLInputElement | null>(null)
/** 法人证件有效期 OCR 进行中（辅助填写，不挡提交）。 */
const legalCertOcrLoading = ref(false)
const current = ref<UserRealnameVerification | null>(null)
const adapayMember = ref<AdapayMemberStatus | null>(null)
const reviewerAvatarLoadFailed = ref(false)
/** 核身弹窗的可见性归视图：`faceidAuthUrl` 一变要连带关掉实名弹窗（见下方那条 watch）。 */
const faceidDialogVisible = ref(false)
// 已通过认证后，只有进入「变更主体」模式才解锁表单，用新主体重新认证一遍。
const realnameChangeMode = ref(false)

const isMobile = ref(false)
let mobileMatch: MediaQueryList | null = null
function syncMobileViewport() {
  isMobile.value = Boolean(mobileMatch?.matches)
}

const form = reactive({
  authType: 'IDENTITY_CARD' as RealnameAuthType,
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
 */
const legalCertPeriodEdited = reactive({ begin: false, expires: false })

/** 营业执照长期有效时渠道要的固定截止日（`YYYYMMDD`），与后端同一口径。 */
const LONG_TERM_DATE = '20991231'

/**
 * 渠道（Adapay 企业开户）对进件资料的长度上限：`business_scope` 200 字符、`address` 256 字符。
 *
 * 营业执照上的经营范围动辄两三百字，OCR 直接回填必然超限，所以回填时按这里截断并把
 * 「已截断」如实告诉用户，让他自己确认要不要精简。
 */
const MAX_BUSINESS_SCOPE_LEN = 200
const MAX_COMPANY_ADDRESS_LEN = 200

const redirectTarget = computed(() => {
  const raw = typeof route.query.redirect_to === 'string' ? route.query.redirect_to.trim() : ''
  if (!raw || raw === '/realname') {
    return ''
  }

  if (!raw.startsWith('/') || raw.startsWith('//')) {
    return ''
  }

  return raw
})

const statusText = computed(() => {
  const status = current.value?.status
  if (!status) return '未提交'
  if (status === 'approved') return '已通过'
  if (status === 'pending') return '审核中'
  return '已驳回'
})

const statusTone = computed<'info' | 'warning' | 'success' | 'danger'>(() => {
  const status = current.value?.status
  if (!status) return 'info'
  if (status === 'approved') return 'success'
  if (status === 'pending') return 'warning'
  return 'danger'
})

const identityCardSelected = computed(() => form.authType === 'IDENTITY_CARD')
const enterpriseSelected = computed(() => form.authType === 'ENTERPRISE')
const soleProprietorSelected = computed(() => form.authType === 'SOLE_PROPRIETOR')
const businessSelected = computed(() => enterpriseSelected.value || soleProprietorSelected.value)
const realnameApproved = computed(() => current.value?.status === 'approved')
// 当前认证主体是否为「企业」（用于爱签账户管理按身份区分功能）
const assignEnterprise = computed(
  () => current.value?.auth_type === 'ENTERPRISE' || current.value?.auth_type === 'SOLE_PROPRIETOR',
)
const realnameRejected = computed(() => current.value?.status === 'rejected')
// 已通过且已点「变更主体」：表单解锁，填的是新主体。
const realnameChanging = computed(() => realnameApproved.value && realnameChangeMode.value)
const realnameLocked = computed(
  () =>
    current.value?.status === 'pending' || (realnameApproved.value && !realnameChangeMode.value),
)
const realnamePending = computed(() => current.value?.status === 'pending')
// 本行带着上一份主体的快照：撤回在这个状态下是「取消主体变更、还原原主体」，
// 而不是把账号退回「未提交」。
const realnameChangeBacked = computed(() => Boolean(current.value?.changing_subject))
// 有东西可撤：认证/审核中，或主体变更被驳回后仍可撤回还原成原主体。
const realnameCanWithdraw = computed(
  () => realnamePending.value || (realnameRejected.value && realnameChangeBacked.value),
)
// 当前生效主体的一句话描述，用于「变更认证类型」提示用户换掉的是哪一份资料。
const currentSubjectLabel = computed(() => {
  const record = current.value
  if (!record) return ''
  if (record.auth_type === 'ENTERPRISE') return `企业 ${record.company_name ?? ''}`.trim()
  if (record.auth_type === 'SOLE_PROPRIETOR') {
    return `个体工商户 ${record.company_name ?? ''}`.trim()
  }
  if (record.auth_type === 'IDENTITY_CARD') {
    const idNo = record.id_card_no_masked ?? ''
    return `个人 ${record.real_name ?? ''}${idNo ? `（${idNo}）` : ''}`.trim()
  }
  return `个人 ${record.real_name ?? ''}`.trim()
})
const identityCardRequiredMissing = computed(
  () =>
    identityCardSelected.value &&
    (!form.realName.trim() || !form.idCardNo.trim() || !form.mobile.trim()),
)
/**
 * 企业进件资料里**只由营业执照识别带出、不在表单里展示**的四项。
 *
 * 渠道创建企业会员时这四项逐项必填，但都能从营业执照照片识别（省市编码由识别出的注册地址
 * 经 `matchRegionFromAddress` 映射成渠道编码），所以不再让用户手填。识别不出时用户唯一的
 * 出路是重传一张更清晰的照片，因此校验失败必须指向「重新上传营业执照」，不能指回一个界面上
 * 根本没有的输入框。
 */
const businessLicenseDerivedMissing = computed(() => {
  if (!businessSelected.value) return []
  const missing: string[] = []
  if (!form.companyProvCode.trim() || !form.companyAreaCode.trim()) missing.push('企业所在省市')
  if (!form.companyAddress.trim()) missing.push('企业注册地址')
  if (!form.businessScope.trim()) missing.push('经营范围')
  if (!form.businessLicenseExpiresOn.trim()) missing.push('营业执照有效期')
  return missing
})

const enterpriseRequiredMissing = computed(
  () =>
    businessSelected.value &&
    (!form.companyName.trim() ||
      !form.unifiedSocialCreditCode.trim() ||
      !form.operatorName.trim() ||
      !form.operatorIdCardNo.trim() ||
      !form.mobile.trim() ||
      !form.businessLicenseFile.trim() ||
      // 法人身份证正反面（开户进件三张证照里的另外两张）：缺任一张渠道都建不了企业会员
      !form.legalCertFrontFile.trim() ||
      !form.legalCertBackFile.trim() ||
      // 企业进件资料里有四项不在表单里（见 businessLicenseDerivedMissing）：
      // 缺任一项渠道都会拒绝创建企业会员，之后连对公收款账户都开不了
      businessLicenseDerivedMissing.value.length > 0 ||
      // 法人证件有效期起止两项：OCR 会自动填，填不上就得用户补，缺任一项渠道必拒
      !form.legalCertBeginOn.trim() ||
      !form.legalCertExpiresOn.trim()),
)

/** 企业所在省下面的城市选项；省份未选时为空。 */
const enterpriseCities = computed(() => getSettlementCities(form.companyProvCode))

/**
 * 上面四项的**识别结果摘要**，替代已移除的输入框供用户核对。
 *
 * 不逐字列经营范围——那是几百字的正文，摘出来只会把表单淹没，所以只报字数。
 */
const businessLicenseDerivedSummary = computed(() => {
  const prov = settlementProvinces.find((item) => item.value === form.companyProvCode)?.title ?? ''
  const area =
    enterpriseCities.value.find((item) => item.value === form.companyAreaCode)?.title ?? ''
  const expires =
    form.businessLicenseExpiresOn === LONG_TERM_DATE
      ? '营业执照长期有效'
      : `执照有效期至 ${form.businessLicenseExpiresOn}`
  return [
    `${prov}${area}`,
    form.businessScope ? `经营范围 ${form.businessScope.length} 字` : '',
    form.businessLicenseExpiresOn ? expires : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

/**
 * 上传区下方那一行的文字：识别结果 + 缺失项（有缺就附上出路）。
 *
 * 这四项已不在表单里，所以这一行同时承担两件事：交代「自动填好了什么」（用户要核对），
 * 以及说明「提交按钮为什么是灰的」（缺项时）。
 */
const businessLicenseDerivedNote = computed(() => {
  const summary = businessLicenseDerivedSummary.value
  const missing = businessLicenseDerivedMissing.value
  if (!missing.length) {
    return summary ? `已从营业执照识别：${summary}` : ''
  }
  const tail = `未能识别出${missing.join('、')}，请重新上传更清晰的照片`
  return summary ? `已从营业执照识别：${summary}；${tail}` : tail
})
/**
 * 从营业执照地址里认领渠道省市编码。
 *
 * 渠道省市表的名称是「云南省」「昭通市」这种全称，营业执照地址（"云南省昭通市彝良县…"）
 * 通常包含它们；省份名去掉「省/市/自治区」后缀再比一次，兼容「广西壮族自治区」这类写法。
 * 认不出就返回空，交给用户自己选。
 */
function matchRegionFromAddress(address: string): { prov?: string; area?: string } {
  const text = address.replace(/\s/g, '')
  if (!text) return {}
  const stripSuffix = (title: string) =>
    title.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)$/, '')
  const pickLongest = <T extends { title: string }>(items: T[]) =>
    [...items]
      .filter((item) => text.includes(item.title) || text.includes(stripSuffix(item.title)))
      .sort((a, b) => b.title.length - a.title.length)[0]
  const province = pickLongest(settlementProvinces)
  if (!province) return {}
  const city = pickLongest(province.cities ?? [])
  return { prov: province.value, area: city?.value }
}

/**
 * 用**本人的实名资料**回填「经办人」三项。
 *
 * 企业认证的经办人就是发起认证的本人，平台已经存过他的姓名 / 证件号 / 手机号，
 * 没必要让人再输一遍。只填空字段，不覆盖用户已经填过的内容。
 */
function applyOwnRealnamePrefill(): void {
  const record = current.value
  if (!record) return
  if (!form.operatorName.trim() && record.real_name) form.operatorName = record.real_name
  if (!form.operatorIdCardNo.trim() && record.id_card_no) form.operatorIdCardNo = record.id_card_no
  if (!form.mobile.trim() && record.mobile) form.mobile = record.mobile
}

/// 切到企业 / 个体户时带上本人经办人信息（只在字段为空时补）。
watch(
  () => form.authType,
  (next, previous) => {
    if (next !== previous) applyOwnRealnamePrefill()
  },
)

const minorGuardianRequiredMissing = computed(
  () => isMinor14To18.value && (!form.guardianConsent || !form.guardianConsentFile.trim()),
)
const submitDisabled = computed(
  () =>
    realnameLocked.value ||
    identityCardRequiredMissing.value ||
    enterpriseRequiredMissing.value ||
    isUnder14.value ||
    minorGuardianRequiredMissing.value,
)

function idCardAge(idCardNo: string): number | null {
  const text = idCardNo.trim().toUpperCase()
  if (text.length !== 18) {
    return null
  }
  const birthday = text.slice(6, 14)
  if (!/^\d{8}$/.test(birthday)) {
    return null
  }
  const year = Number(birthday.slice(0, 4))
  const month = Number(birthday.slice(4, 6))
  const day = Number(birthday.slice(6, 8))
  const birth = new Date(year, month - 1, day)
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return null
  }
  const now = new Date()
  let age = now.getFullYear() - year
  const monthDiff = now.getMonth() - (month - 1)
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1
  }
  return age
}

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

const idCardPlaceholder = computed(() => {
  const masked = current.value?.id_card_no_masked
  return masked ? `${masked}` : '请输入证件号'
})

const submitButtonText = computed(() => {
  if (realnameChanging.value) return '提交变更，重新认证'
  if (realnameApproved.value) return '已通过认证'
  if (realnameLocked.value && identityCardSelected.value) return '认证处理中'
  if (identityCardSelected.value) return current.value ? '重新发起实名认证' : '实名认证'
  if (!current.value || realnameRejected.value) return current.value ? '重新提交认证' : '提交认证'
  return '已提交，不能修改'
})

/// 清空实名主体字段，回到「可以填新主体」的空表单（证件类型 radio 不动）。
function resetRealnameSubjectFields() {
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

/// 进入「变更认证类型」：解锁表单并用空表单让用户填新主体，提交后由后端快照原主体，
/// 认证通过前可撤回（撤回即取消变更、还原原来那份主体）。
function startRealnameChange() {
  realnameChangeMode.value = true
  resetRealnameSubjectFields()
  applyOwnRealnamePrefill()
  faceidDialogVisible.value = false
  realnameDialogVisible.value = true
}

/// 放弃「变更认证类型」草稿：什么都没提交，直接回到只读状态。
function cancelRealnameChange() {
  realnameChangeMode.value = false
  if (current.value) {
    patchForm(current.value)
  }
  realnameDialogVisible.value = false
}

function patchForm(record: UserRealnameVerification) {
  // 服务端数据一落地，表单就不再是「变更主体」草稿态（变更已提交或已取消）。
  realnameChangeMode.value = false
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
 * 实名记录落地：状态、头像加载失败标记、表单回填三件事一起做。
 *
 * 人脸核身域里的查询 / 撤回也会走这里（以回调注入 composable），所以三件事必须同进同退——
 * 少做一件就会出现「状态已通过、表单还是旧主体」这类错位。
 */
function applyRealnameRecord(record: UserRealnameVerification) {
  current.value = record
  reviewerAvatarLoadFailed.value = false
  patchForm(record)
}

async function tryRestoreBusinessPage(record?: UserRealnameVerification | null) {
  const target = redirectTarget.value
  if (!target) {
    return
  }

  const status = record?.status ?? current.value?.status
  // 只有已通过才自动返回，审核中需要停留提示用户
  if (status !== 'approved') {
    return
  }

  await router.replace(target)
}

function validate() {
  if (businessSelected.value) {
    if (!form.companyName.trim()) return '请填写企业名称'
    if (!form.unifiedSocialCreditCode.trim()) return '请填写统一社会信用代码'
    if (!form.operatorName.trim()) return '请填写经办人姓名'
    if (!form.operatorIdCardNo.trim()) return '请填写经办人身份证号'
    if (!isValidMobile(form.mobile)) return '请填写正确的手机号'
    if (!form.businessLicenseFile.trim()) return '请上传营业执照'
    // 法人身份证正反面：企业开户进件三张证照里的另外两张，缺哪张提示哪张。
    if (!form.legalCertFrontFile.trim()) return '请上传法人身份证人像面照片'
    if (!form.legalCertBackFile.trim()) return '请上传法人身份证国徽面照片'
    // 企业进件资料里的四项（所在省市 / 注册地址 / 经营范围 / 执照有效期）不在表单里，
    // 只能由营业执照识别带出：缺了就说明照片没识别全，出路是重传，而不是「去填一下」。
    const derivedMissing = businessLicenseDerivedMissing.value
    if (derivedMissing.length) {
      return `未能从营业执照识别出${derivedMissing.join('、')}，请重新上传更清晰的照片`
    }
    // 识别出的经营范围会按渠道上限截断（见 autoFillFromBusinessLicense）；历史记录可能超限，
    // 重传一次营业执照会被重新截断，所以这里的出路同样是重传。
    if (form.businessScope.trim().length > MAX_BUSINESS_SCOPE_LEN) {
      return `营业执照识别出的经营范围超过 ${MAX_BUSINESS_SCOPE_LEN} 字（渠道限制），请重新上传营业执照`
    }
    if (!/^\d{8}$/.test(form.legalCertBeginOn.trim())) return '请选择法人证件有效期起始日'
    if (!/^\d{8}$/.test(form.legalCertExpiresOn.trim())) return '请选择法人证件有效期截止日'
    return ''
  }

  if (!form.realName.trim() || !form.idCardNo.trim()) {
    return '请填写姓名和证件号'
  }
  if (!form.mobile.trim()) return '请填写手机号'
  if (!isValidMobile(form.mobile)) return '请填写正确的手机号'
  if (isUnder14.value) return '未满 14 周岁的未成年人不能进行实名认证'
  if (isMinor14To18.value && !form.guardianConsent) return '请确认已取得监护人同意'
  if (isMinor14To18.value && !form.guardianConsentFile.trim()) return '请上传监护人同意书'

  return ''
}

function isValidMobile(value: string): boolean {
  const text = value.trim()
  return /^1\d{10}$/.test(text)
}

function buildPayload(): SubmitRealnameVerificationPayload {
  const payload: SubmitRealnameVerificationPayload = {
    auth_type: form.authType,
  }

  if (form.realName.trim()) payload.real_name = form.realName.trim()
  if (form.idCardNo.trim()) payload.id_card_no = form.idCardNo.trim()
  if (form.mobile.trim()) payload.mobile = form.mobile.trim()
  if (form.companyName.trim()) payload.company_name = form.companyName.trim()
  if (form.unifiedSocialCreditCode.trim()) {
    payload.unified_social_credit_code = form.unifiedSocialCreditCode.trim()
  }
  if (form.businessLicenseNo.trim()) payload.business_license_no = form.businessLicenseNo.trim()
  if (form.businessLicenseFile.trim())
    payload.business_license_file = form.businessLicenseFile.trim()
  if (form.operatorName.trim()) payload.operator_name = form.operatorName.trim()
  if (form.operatorIdCardNo.trim()) payload.operator_id_card_no = form.operatorIdCardNo.trim()
  // 企业进件资料只在企业 / 个体工商户主体下传；换成个人时后端会把它们清空
  if (businessSelected.value) {
    payload.company_prov_code = form.companyProvCode.trim()
    payload.company_area_code = form.companyAreaCode.trim()
    payload.company_address = form.companyAddress.trim()
    payload.business_scope = form.businessScope.trim()
    payload.business_license_expires_on = form.businessLicenseExpiresOn.trim()
    payload.legal_cert_begin_on = form.legalCertBeginOn.trim()
    payload.legal_cert_expires_on = form.legalCertExpiresOn.trim()
  }
  // 只有 14~18 周岁的未成年人才需要监护人同意；成年人无需传
  if (isMinor14To18.value) {
    payload.guardian_consent = form.guardianConsent
    if (form.guardianConsentFile.trim()) {
      payload.guardian_consent_file = form.guardianConsentFile.trim()
    }
  }

  return payload
}

const MAX_CONSENT_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_CONSENT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'pdf']

function consentFileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) {
    return ''
  }
  return name.slice(dot + 1).toLowerCase()
}

function isAllowedConsentFile(file: File): boolean {
  const ext = consentFileExtension(file.name)
  if (ext && ALLOWED_CONSENT_EXTENSIONS.includes(ext)) {
    return true
  }
  const mime = (file.type || '').toLowerCase()
  return (
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/webp' ||
    mime === 'application/pdf'
  )
}

function openConsentPicker() {
  consentFileInput.value?.click()
}

function openBusinessLicensePicker() {
  businessLicenseFileInput.value?.click()
}

/**
 * 用营业执照 OCR 结果回填企业信息（**辅助填写**，失败只提示、不阻断）。
 *
 * 只回填它能确定的几项：企业名称、统一社会信用代码、注册地址、
 * 经营范围、营业执照有效期；法人姓名表单里没有这个输入项，不回填。
 * 其中注册地址、经营范围、执照有效期（以及由注册地址映射出的企业所在省市）**不再在表单里展示**，
 * 所以识别不出来时用户没法手填，只能重传；成功时靠表单下方的识别结果摘要供用户核对。
 */
async function autoFillFromBusinessLicense(businessLicenseFile: string) {
  if (!businessLicenseFile.trim()) return
  businessLicenseOcrLoading.value = true
  try {
    const ocr = await ocrBusinessLicense(auth.token, businessLicenseFile)
    let filled = 0
    const apply = (value: string | null, assign: (next: string) => void) => {
      if (value && value.trim()) {
        assign(value.trim())
        filled += 1
      }
    }
    apply(ocr.company_name, (next) => (form.companyName = next))
    apply(ocr.unified_social_credit_code, (next) => (form.unifiedSocialCreditCode = next))
    let truncated = false
    const clip = (value: string, max: number) => {
      if (value.length <= max) return value
      truncated = true
      return value.slice(0, max)
    }
    apply(
      ocr.company_address,
      (next) => (form.companyAddress = clip(next, MAX_COMPANY_ADDRESS_LEN)),
    )
    apply(ocr.business_scope, (next) => (form.businessScope = clip(next, MAX_BUSINESS_SCOPE_LEN)))
    apply(ocr.business_license_expires_on, (next) => (form.businessLicenseExpiresOn = next))
    // 地址拿到了就把「企业所在省市」按渠道省市表认领填好（认不出则留给用户选）
    const region = matchRegionFromAddress(form.companyAddress)
    if (region.prov) {
      form.companyProvCode = region.prov
      form.companyAreaCode = region.area ?? ''
    }
    // 「未认出所在省市」不在这里提醒：表单下方那条识别结果摘要会一直挂着它，提交也会被拦。
    const notes = [
      truncated ? `经营范围超过 ${MAX_BUSINESS_SCOPE_LEN} 字，已按渠道上限截断` : '',
    ].filter(Boolean)
    if (filled > 0) {
      const message = `已按营业执照自动填入企业信息${notes.length ? `（${notes.join('；')}）` : ''}`
      if (truncated) {
        TMessage.warning(message)
      } else {
        TMessage.success(message)
      }
    } else {
      TMessage.warning('营业执照未识别出可用信息，请重新上传更清晰的照片')
    }
  } catch (err) {
    TMessage.warning(
      err instanceof Error ? err.message : '营业执照识别失败，请重新上传更清晰的照片',
    )
  } finally {
    businessLicenseOcrLoading.value = false
  }
}

async function handleBusinessLicenseFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAllowedConsentFile(file)) {
    TMessage.warning('营业执照仅支持 PNG、JPG、WEBP 图片或 PDF 文件')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    TMessage.warning('营业执照文件不能超过 10MB')
    return
  }
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  businessLicenseUploading.value = true
  try {
    const result = await uploadBusinessLicenseFile(auth.token, file)
    form.businessLicenseFile = result.business_license_file
    TMessage.success('营业执照已上传')
    // 上传成功后顺手让后端 OCR 识别一次，把企业信息回填；失败不影响上传结果。
    await autoFillFromBusinessLicense(result.business_license_file)
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '上传营业执照失败')
  } finally {
    businessLicenseUploading.value = false
  }
}

/** 法人身份证证件照只收图片（渠道 `pictureUpload` 不认 PDF），单张 10MB 以内，与后端同一口径。 */
const MAX_LEGAL_CERT_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_LEGAL_CERT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

function isAllowedLegalCertFile(file: File): boolean {
  const ext = consentFileExtension(file.name)
  if (ext && ALLOWED_LEGAL_CERT_EXTENSIONS.includes(ext)) {
    return true
  }
  const mime = (file.type || '').toLowerCase()
  return (
    mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/webp'
  )
}

function openLegalCertFrontPicker() {
  legalCertFrontFileInput.value?.click()
}

function openLegalCertBackPicker() {
  legalCertBackFileInput.value?.click()
}

/**
 * 上传法人身份证**人像面**（企业开户进件三张证照之一）。
 *
 * 与营业执照不同：后端上传即落库（`realname_legal_cert.front_file`），
 * 所以只记文件名供界面回显，**不**往提交实名的 payload 里塞。
 */
async function handleLegalCertFrontFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAllowedLegalCertFile(file)) {
    TMessage.warning('法人身份证人像面仅支持 PNG、JPG、WEBP 图片')
    return
  }
  if (file.size > MAX_LEGAL_CERT_FILE_SIZE) {
    TMessage.warning('法人身份证人像面文件不能超过 10MB')
    return
  }
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  legalCertFrontUploading.value = true
  try {
    const result = await uploadLegalCertFrontFile(auth.token, file)
    form.legalCertFrontFile = result.front_file
    TMessage.success('法人身份证人像面已上传')
    // 上传成功后顺手识别证件有效期并回填；识别失败静默降级，不挡提交。
    void autoFillLegalCertPeriod()
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '上传法人身份证人像面失败')
  } finally {
    legalCertFrontUploading.value = false
  }
}

/** 上传法人身份证**国徽面**（与上面同一套处理，落库到 `realname_legal_cert.back_file`）。 */
async function handleLegalCertBackFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isAllowedLegalCertFile(file)) {
    TMessage.warning('法人身份证国徽面仅支持 PNG、JPG、WEBP 图片')
    return
  }
  if (file.size > MAX_LEGAL_CERT_FILE_SIZE) {
    TMessage.warning('法人身份证国徽面文件不能超过 10MB')
    return
  }
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }
  legalCertBackUploading.value = true
  try {
    const result = await uploadLegalCertBackFile(auth.token, file)
    form.legalCertBackFile = result.back_file
    TMessage.success('法人身份证国徽面已上传')
    // 同上：有效期一般印在国徽面，上传这一面后立刻识别一次。
    void autoFillLegalCertPeriod()
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '上传法人身份证国徽面失败')
  } finally {
    legalCertBackUploading.value = false
  }
}

/** 用户动了起始日（手选 / 清除）：记下来，OCR 就不再回填它。 */
function markLegalCertBeginEdited() {
  legalCertPeriodEdited.begin = true
}

/** 用户动了截止日（手选 / 清除）：同上。 */
function markLegalCertExpiresEdited() {
  legalCertPeriodEdited.expires = true
}

/**
 * 「长期有效」捷径：把截止日设成渠道约定的长期日期。
 *
 * 这算用户自己做的选择，同步打上「改动过」标记，与手选一个日期同等对待——
 * 之后的 OCR 回填一律不碰它（长期证件确实存在，不能因为识别出一个日期就改回来）。
 * 起始日仍要用户填（或由 OCR 填）：长期证件同样有发证日。
 */
function applyLongTermLegalCert() {
  form.legalCertExpiresOn = LONG_TERM_DATE
  legalCertPeriodEdited.expires = true
}

/**
 * 静默 OCR 回填「法人证件有效期」起止两项。
 *
 * 触发点：两张证件照**上传成功后**，以及**表单打开时本地已存有证件照**（关掉弹窗再打开可重试）。
 * 规矩：
 * - 只往「空且用户没动过」的项里写（`legalCertPeriodEdited` + 空值双重判定），用户填过的一律保留；
 * - 两面各调一次（人像面一般认不出有效期、国徽面才有），任一面出错都吞掉，不弹错、不阻断提交；
 * - 只有**两项都没拿到**时才给一条「请手工填写」的轻提示，拿到至少一项就不打扰。
 */
async function autoFillLegalCertPeriod(options: { silent?: boolean } = {}) {
  // 只读态（审核中 / 已通过且未进变更）：输入与上传都锁着，填了也没法用，不白跑一趟
  if (realnameLocked.value) return
  auth.hydrate()
  if (!auth.token.trim()) return
  // 只对已经上传过的那几面调识别（后端按 side 取已落库的照片，没传就会回 400）
  const sides: LegalCertOcrSide[] = []
  if (form.legalCertFrontFile.trim()) sides.push('front')
  if (form.legalCertBackFile.trim()) sides.push('back')
  if (!sides.length) return
  // 两项都已有值（或用户动过），没有可回填的余地，不必麻烦后端
  if (legalCertPeriodSettled()) return

  legalCertOcrLoading.value = true
  try {
    const results = await Promise.all(
      sides.map((side) => recognizeLegalCertPeriod(auth.token, side).catch(() => null)),
    )
    let filled = 0
    for (const result of results) {
      if (!result) continue
      filled += applyLegalCertPeriod(result.cert_begin_on, result.cert_expires_on)
    }
    if (filled === 0 && !options.silent) {
      TMessage.warning('未能自动识别法人证件有效期，请手工填写')
    }
  } finally {
    legalCertOcrLoading.value = false
  }
}

/** 两项都已经有值、或用户明确动过（含「长期有效」）时为真。 */
function legalCertPeriodSettled(): boolean {
  const beginSet = legalCertPeriodEdited.begin || !!form.legalCertBeginOn.trim()
  const expiresSet = legalCertPeriodEdited.expires || !!form.legalCertExpiresOn.trim()
  return beginSet && expiresSet
}

/**
 * 把一次识别结果写进空项，返回实际写了几项。
 *
 * 只接受 `YYYYMMDD`（8 位数字，与后端同一口径）；OCR 给的其它形态一律丢弃，
 * 宁可不填也不能把非法值塞进表单——提交时校验只认这 8 位。
 */
function applyLegalCertPeriod(beginOn: string | null, expiresOn: string | null): number {
  let filled = 0
  const begin = (beginOn ?? '').trim()
  const expires = (expiresOn ?? '').trim()
  if (/^\d{8}$/.test(begin) && !legalCertPeriodEdited.begin && !form.legalCertBeginOn.trim()) {
    form.legalCertBeginOn = begin
    filled += 1
  }
  if (
    /^\d{8}$/.test(expires) &&
    !legalCertPeriodEdited.expires &&
    !form.legalCertExpiresOn.trim()
  ) {
    form.legalCertExpiresOn = expires
    filled += 1
  }
  return filled
}

async function handleConsentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  if (!isAllowedConsentFile(file)) {
    TMessage.warning('同意书仅支持 PNG、JPG、WEBP 图片或 PDF 文件')
    return
  }
  if (file.size > MAX_CONSENT_FILE_SIZE) {
    TMessage.warning('同意书文件不能超过 5MB')
    return
  }

  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  consentUploading.value = true
  try {
    const result = await uploadGuardianConsentFile(auth.token, file)
    form.guardianConsentFile = result.guardian_consent_file
    TMessage.success('监护人同意书已上传')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '上传监护人同意书失败')
  } finally {
    consentUploading.value = false
  }
}

async function startWechatFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (realnameApproved.value && !realnameChanging.value) {
    TMessage.success('实名认证已通过，无需重复核身')
    return
  }

  if (realnameLocked.value && !realnameRejected.value) {
    TMessage.warning('实名认证正在处理中，请稍后查询结果')
    return
  }

  const msg = validate()
  if (msg) {
    TMessage.warning(msg)
    return
  }

  faceidStarting.value = true
  try {
    const payload: StartAsignIdentifyPayload = {
      real_name: form.realName.trim(),
      id_card_no: form.idCardNo.trim(),
      mobile: form.mobile.trim() || null,
    }
    if (isMinor14To18.value) {
      payload.guardian_consent = form.guardianConsent
      payload.guardian_consent_file = form.guardianConsentFile.trim()
    }
    const result = await startAsignIdentify(auth.token, payload)
    if (result.manual_review || !result.auth_url) {
      // 非大陆身份证个人证件：爱签不提供实名认证服务，后端已转入人工审核。
      applyRealnameRecord(await getMyRealnameVerification(auth.token))
      TMessage.success('个人实名认证已提交，等待管理员审核')
      return
    }
    // 核身链接交给 composable：出二维码、开始轮询都在那边
    await beginChallenge(result.auth_url)
    // 重新加载当前实名状态（后端已创建 pending 记录）
    applyRealnameRecord(await getMyRealnameVerification(auth.token))
    TMessage.success('爱签实名认证已发起')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发起爱签实名认证失败')
  } finally {
    faceidStarting.value = false
  }
}

async function startEnterpriseAsign() {
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  if (realnameLocked.value && !realnameRejected.value) {
    TMessage.warning('实名认证正在处理中，请稍后查询结果')
    return
  }

  const msg = validate()
  if (msg) {
    TMessage.warning(msg)
    return
  }

  faceidStarting.value = true
  try {
    const payload: StartCompanyIdentifyPayload = {
      company_name: form.companyName.trim(),
      unified_social_credit_code: form.unifiedSocialCreditCode.trim(),
      operator_name: form.operatorName.trim(),
      operator_id_card_no: form.operatorIdCardNo.trim(),
      mobile: form.mobile.trim(),
      business_license_file: form.businessLicenseFile.trim(),
      company_prov_code: form.companyProvCode.trim(),
      company_area_code: form.companyAreaCode.trim(),
      company_address: form.companyAddress.trim(),
      business_scope: form.businessScope.trim(),
      business_license_expires_on: form.businessLicenseExpiresOn.trim(),
      legal_cert_begin_on: form.legalCertBeginOn.trim(),
      legal_cert_expires_on: form.legalCertExpiresOn.trim(),
    }
    const result = await startCompanyAsignIdentify(auth.token, payload)
    await beginChallenge(result.auth_url)
    applyRealnameRecord(await getMyRealnameVerification(auth.token))
    TMessage.success('企业实名认证已发起，请完成认证')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发起爱签企业实名认证失败')
  } finally {
    faceidStarting.value = false
  }
}

// ── 人脸核身（challenge）域 ──────────────────────────────────
/**
 * 启停、轮询、查询、恢复、撤回都在 `useFaceidChallenge` 里（定时器绑 `onScopeDispose`）。
 * 这里只注入三样视图才有的东西：实名记录、记录落地（含表单回填）与两个弹窗的可见性。
 * 实名表单的发起仍在上面：它读的是本页的表单与校验。
 */
const {
  faceidAuthUrl,
  faceidQrDataUrl,
  faceidStarting,
  faceidChecking,
  faceidRestoring,
  withdrawing,
  beginChallenge,
  checkWechatFaceidResult,
  openWechatFaceidPage,
  restoreFaceidChallengeIfNeeded,
  handleWithdraw,
} = useFaceidChallenge({
  realname: current,
  applyRecord: (record) => applyRealnameRecord(record),
  clearRecord: () => {
    current.value = null
    reviewerAvatarLoadFailed.value = false
    // 重置表单回到「未提交」的可编辑状态
    form.authType = 'IDENTITY_CARD'
    resetRealnameSubjectFields()
  },
  formAuthType: () => form.authType,
  restoreBusinessPage: (record) => tryRestoreBusinessPage(record),
  afterWithdraw: () => {
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
  },
})

/**
 * 核身二维码出现时自动弹出核身弹窗，并收起「提交认证信息」弹窗，避免双弹窗叠放。
 *
 * 只做可见性——**两个弹窗互相关闭这件事必须留在视图**：`realnameDialogVisible` 是表单草稿的
 * 生命周期开关（关掉就丢弃变更草稿），不能让 composable 或子组件去改它。
 * 轮询由 composable 自己盯着 `faceidAuthUrl` 起停，与这里无关。
 */
watch(faceidAuthUrl, (url) => {
  if (url) {
    faceidDialogVisible.value = true
    realnameDialogVisible.value = false
    return
  }
  faceidDialogVisible.value = false
})

// 关掉「提交认证信息」弹窗即放弃变更草稿：没提交过的变更，下次打开不该还是解锁态。
watch(realnameDialogVisible, (visible) => {
  if (!visible) {
    realnameChangeMode.value = false
    return
  }
  // 表单打开、本地已存有证件照时补一次识别（上传那次的识别可能失败过，重开弹窗即重试）。
  // 静默：不再重复弹「未能识别」——这条提示在上传后已经给过一次了。
  void autoFillLegalCertPeriod({ silent: true })
})

// ── 账户入口：两张卡片共用同一套「分组 + 行」结构 ────────────────
/// 标签语气。`ui_73info` 的 `TTag` 收的是语义 `tone`，与 Element 的 `type` 同词；
/// 这里的取值正好都在 `Tone` 里，所以字段名跟着改成 `tone`，模板写 `:tone`。
type AccountEntryStatus = { text: string; tone: 'success' | 'warning' | 'danger' | 'info' }
type AccountEntry = {
  key: string
  title: string
  desc: string
  icon: Component
  status?: AccountEntryStatus
  danger?: boolean
  loading?: boolean
  /** 审核期间不放开入口：点了只给原因，不打开登记弹窗（视觉上也是禁用态）。 */
  locked?: boolean
}
type AccountEntryGroup = { title: string; entries: AccountEntry[] }

/// 实名认证入口的文案：按当前状态说清点进去能做什么，别让「审核中」还写着「开始认证」。
const realnameEntryCopy = computed(() => {
  const status = current.value?.status
  if (status === 'pending') {
    return { title: '查看认证进度', desc: '认证审核中，可查看进度或撤回本次申请' }
  }
  if (status === 'rejected') {
    return {
      title: '重新提交认证',
      desc: current.value?.review_note || '上次认证未通过，请核对信息后重新提交',
    }
  }
  if (status === 'approved') {
    return { title: '查看认证信息', desc: `当前主体：${currentSubjectLabel.value}` }
  }
  return { title: '开始认证', desc: '提交真实身份信息，通过后可签署合同' }
})

/// 「认证管理」卡片：实名认证（按认证类型给不同入口） / 收款与结算 两组。
/// 认证类型对应的入口集合见下方 `identity` 的注释。
const realnameEntryGroups = computed<AccountEntryGroup[]>(() => {
  const identity: AccountEntry[] = [
    {
      key: 'realname',
      title: realnameEntryCopy.value.title,
      desc: realnameEntryCopy.value.desc,
      icon: Postcard,
      status: { text: `实名认证：${statusText.value}`, tone: statusTone.value },
    },
  ]
  if (realnamePending.value) {
    identity.push({
      key: 'faceid',
      title: '继续人脸核身',
      desc: '扫码完成人脸核验，也可在这里查询核验结果',
      icon: Promotion,
      loading: faceidRestoring.value,
    })
  }
  if (realnameCanWithdraw.value) {
    identity.push({
      key: 'withdraw',
      title: realnameChangeBacked.value ? '取消变更，还原原主体' : '撤回认证',
      desc: '撤回后可重新填写主体信息',
      icon: RefreshLeft,
      danger: true,
      loading: withdrawing.value,
    })
  }
  // 已通过认证后的可维护入口：按认证类型给不同集合（2026-10-04 起把原「电子签约账户」
  // 那组并进来，避免同一件事分散在两个分组里）
  //   个人：修改手机号、修改个人信息、变更认证类型
  //   企业 / 个体工商户：修改法人、修改手机号、修改企业信息、变更认证类型
  if (realnameApproved.value) {
    if (assignEnterprise.value) {
      identity.push({
        key: 'legalPerson',
        title: '修改法人',
        desc: '变更企业法人姓名与身份证号，需重新核验',
        icon: User,
      })
    }
    identity.push({
      key: 'mobile',
      title: '修改手机号（验证码方式）',
      desc: '接收签署短信的手机号，用短信验证码改绑',
      icon: Iphone,
    })
    identity.push(
      assignEnterprise.value
        ? {
            key: 'company',
            title: '修改企业信息',
            desc: '变更企业名称会自动重新生成印章',
            icon: OfficeBuilding,
          }
        : {
            key: 'personal',
            title: '修改姓名',
            desc: '修正爱签签署侧登记的姓名，需过一次三要素核验',
            icon: User,
          },
    )
    // 印章是企业主体在爱签侧的用章对象（个人主体没有企业印章），
    // 所以只在企业 / 个体工商户主体下出现，放在语义最近的「修改企业信息」之后。
    if (assignEnterprise.value) {
      identity.push({
        key: 'seal',
        title: '印章管理',
        desc: '查看企业电子印章，可在线制作新印章',
        icon: CollectionTag,
      })
    }
    identity.push({
      key: 'changeSubject',
      title: '变更认证类型',
      desc: '个人 / 企业 / 个体工商户之间切换，需重新认证',
      icon: SwitchButton,
    })
  }

  const settle: AccountEntry[] = [
    {
      key: 'settle',
      title: '结算账户',
      desc:
        settleStage.value === 'reviewing'
          ? settleUnderReviewText.value
          : settleStage.value === 'failed'
            ? `渠道已拒绝开通收款账户，点进去看原因并按提示整改`
            : settleSubjectMismatch.value
              ? settleMaterialMissing.value
                ? `实名资料缺${settleMaterialMissingText.value}，补齐后才能重新绑定收款账户`
                : '实名主体已变更，原银行卡需按新主体重新绑定'
              : settleStage.value === 'bound'
                ? '收款银行卡已绑定，可查看或更换'
                : settleStage.value === 'ready'
                  ? `认证已完成，绑定${settleAccountWord.value}后即可收取合同款`
                  : realnameApproved.value
                    ? settleProviderError.value
                      ? '收款账户开通失败，点进去看渠道给的原因并补齐资料'
                      : '正在自动开通收款账户，稍后刷新查看'
                    : '完成实名认证后会自动开通收款账户',
      icon: CreditCard,
      // 渠道会员还在审核时**不放开入口**：这时候点进去也绑不上，
      // 只会撞渠道的 member_not_exists，徒增一次失败与一次限流。
      locked: settleUnderReview.value,
      // 标签按 settleStage 的四态如实写：已绑卡才是「已设置」，会员还在渠道那边写审核中，
      // 会员好了但没绑卡写「待绑卡」（差的是用户那一步），连会员都还没建写「待认证」。
      // 不这么分的话，「未设置」会把「系统还没办完」和「用户还没绑卡」混成一句，
      // 用户不知道自己该等还是该动手。
      // （历史口径：更早是「收款认证：已认证」，读的是渠道会员状态，未绑卡也显示绿色，
      //   会把人误导成「已能收款」，2026-10-04 改回绑卡口径。）
      status:
        settleStage.value === 'reviewing'
          ? { text: '收款账户：渠道审核中', tone: 'warning' }
          : settleStage.value === 'failed'
            ? {
                text: settleCorporateLocked.value
                  ? '收款账户：渠道审核未通过'
                  : '收款账户：开通被拒',
                tone: 'danger',
              }
            : settleSubjectMismatch.value
              ? { text: '收款账户：待重绑', tone: 'warning' }
              : settleStage.value === 'bound'
                ? { text: '结算账户：已设置', tone: 'success' }
                : settleStage.value === 'ready'
                  ? { text: '收款账户：待绑卡', tone: 'warning' }
                  : { text: '收款账户：待认证', tone: 'info' },
    },
  ]
  // 注销只在已绑卡时有意义；属破坏性动作，用 danger 标记。
  if (settleBound.value) {
    settle.push({
      key: 'closeSettle',
      title: '注销结算账户',
      desc: '解绑收款银行卡，注销后合同款无法入账',
      icon: Warning,
      danger: true,
    })
  }

  return [
    { title: '实名认证', entries: identity },
    { title: '收款与结算', entries: settle },
  ]
})

/// 「账号与安全」卡片：登录凭证 / 第三方账号 / 危险操作三组入口。
const accountEntryGroups = computed<AccountEntryGroup[]>(() => {
  const providerEntry = (provider: 'github' | 'gitee' | 'qq'): AccountEntry => {
    const bound = isProviderBound(provider)
    return {
      key: `bind:${provider}`,
      title: providerLabel(provider),
      desc: bound ? '已绑定，点击可解除绑定' : '绑定后可扫码快捷登录',
      icon: Connection,
      status: { text: bound ? '已绑定' : '未绑定', tone: bound ? 'success' : 'info' },
      loading: providerBindingLoading.value,
    }
  }

  return [
    {
      title: '登录凭证',
      entries: [
        {
          key: 'email',
          title: '修改邮箱',
          desc: profileEmail.value ? `当前邮箱：${profileEmail.value}` : '用于接收验证码与通知',
          icon: Message,
        },
        { key: 'password', title: '修改密码', desc: '修改后其它设备需重新登录', icon: Lock },
        {
          key: 'username',
          title: '修改用户名',
          desc: '用户名同时是登录名，修改后请用新用户名登录',
          icon: User,
        },
        {
          key: 'twoFactor',
          title: '两步验证',
          desc: '登录时额外校验一次邮箱验证码',
          icon: Bell,
          status: {
            text: twoFactorEnabled.value ? '已开启' : '未开启',
            tone: twoFactorEnabled.value ? 'success' : 'info',
          },
        },
      ],
    },
    {
      title: '第三方账号',
      entries: [
        {
          key: 'bind:wechat',
          title: '微信',
          desc: wechatBound.value ? '已绑定，点击可解除绑定' : '绑定后可扫码快捷登录',
          icon: Connection,
          status: {
            text: wechatBound.value ? '已绑定' : '未绑定',
            tone: wechatBound.value ? 'success' : 'info',
          },
          loading: wechatBindingLoading.value,
        },
        providerEntry('github'),
        providerEntry('gitee'),
        providerEntry('qq'),
      ],
    },
    {
      title: '危险操作',
      entries: [
        {
          key: 'close',
          title: '注销账号',
          desc: '注销后账号与数据不可恢复',
          icon: Warning,
          danger: true,
        },
      ],
    },
  ]
})

/// 统一入口分发：模板只渲染，动作都在这里对号入座。
function openAccountEntry(key: string) {
  switch (key) {
    case 'realname':
      realnameDialogVisible.value = true
      return
    case 'faceid':
      void continueFaceid()
      return
    case 'withdraw':
      void handleWithdraw()
      return
    case 'changeSubject':
      startRealnameChange()
      return
    case 'settle':
      if (settleUnderReview.value) {
        TMessage.warning(settleUnderReviewText.value)
        return
      }
      void openSettleDialog()
      return
    case 'closeSettle':
      openCloseSettleDialog()
      return
    case 'mobile':
      openMobileDialog()
      return
    case 'legalPerson':
    case 'company':
    case 'personal':
      asignDialogKind.value = key
      asignDialogVisible.value = true
      return
    case 'seal':
      openSealDialog()
      return
    case 'email':
      emailDialogVisible.value = true
      return
    case 'password':
      passwordDialogVisible.value = true
      return
    case 'username':
      usernameDialogVisible.value = true
      return
    case 'twoFactor':
      twoFactorDialogVisible.value = true
      return
    case 'close':
      openAccountCloseDialog()
      return
  }

  if (key.startsWith('bind:')) {
    const provider = key.slice('bind:'.length)
    if (provider === 'wechat') {
      void handleWechatBinding()
    } else if (provider === 'github' || provider === 'gitee' || provider === 'qq') {
      void handleProviderBinding(provider)
    }
  }
}

/// 审核中继续人脸核身：先找回刷新后丢失的爱签核身链接，再打开核身弹窗。
async function continueFaceid() {
  if (!faceidAuthUrl.value) {
    await restoreFaceidChallengeIfNeeded()
  }
  if (!faceidAuthUrl.value) {
    TMessage.warning('暂时拿不到人脸核身链接，可撤回本次认证后重新提交')
    return
  }
  faceidDialogVisible.value = true
}

// ── 爱签账户管理（为电子签署准备） ──────────────────────────────
const asignDialogVisible = ref(false)
const asignDialogKind = ref('')

/// 修改手机号：只保留短信验证码方式（运营商三要素那条路 2026-10-04 已删）。
function openMobileDialog() {
  asignDialogKind.value = 'mobile'
  asignDialogVisible.value = true
}

// ── 企业印章管理 ────────────────────────────────────────────
/**
 * 印章列表**按需加载**：点开弹窗才查爱签，不在账号页加载时预取。
 * 账号页每次进来都会打一串接口，再多一次爱签查询只为渲染一句「已生成 / 待生成」不值当；
 * 状态胶囊因此也不做，入口行与「修改法人」等同组行一致，只有图标 + 主标题 + 副说明。
 */
const sealDialogVisible = ref(false)
const sealLoading = ref(false)
const sealError = ref('')
const sealData = ref<MySealsData | null>(null)
const sealMakeLoading = ref(false)

function openSealDialog() {
  sealDialogVisible.value = true
  sealData.value = null
  sealError.value = ''
  void loadMySeals()
}

async function loadMySeals() {
  if (!requireToken()) return
  sealLoading.value = true
  sealError.value = ''
  try {
    const res = await getMySeals(auth.token)
    if (res.success) {
      sealData.value = res.data ?? null
    } else {
      sealError.value = '暂时查不到企业印章，请稍后重试'
    }
  } catch (err) {
    sealError.value = err instanceof Error ? err.message : '查询企业印章失败'
  } finally {
    sealLoading.value = false
  }
}

/// 在线制作新印章：后端只生成爱签制章链接，真正制章由用户在爱签页面完成。
/// 不传 sealNo，新增印章不会覆盖企业现有印章；制章完成后回本页刷新即可看到。
async function handleSealMakeOnline() {
  if (!requireToken()) return
  sealMakeLoading.value = true
  try {
    const res = await createSealMakeOnline(auth.token, {})
    const url = res.data?.trim()
    if (res.success && url) {
      window.open(url, '_blank', 'noopener,noreferrer')
      TMessage.success('已打开爱签制章页面，完成后回本页刷新查看')
    } else {
      TMessage.warning('暂时拿不到制章链接，请稍后重试')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '生成制章链接失败')
  } finally {
    sealMakeLoading.value = false
  }
}

/// 从印章管理切到「修改企业信息」（改名会自动重新生成印章），两个入口语义相邻。
function openCompanyFromSeal() {
  sealDialogVisible.value = false
  asignDialogKind.value = 'company'
  asignDialogVisible.value = true
}

// ── Adapay 结算账户（状态与动作都在 composable 里，这里只接线） ──────────
/**
 * `current`（实名记录）与 `adapayMember`（渠道会员）是跨 hero / 入口卡 / 结算 / onMounted
 * 四块共用的状态，注入进 composable；`isEnterpriseSubject` 复用这里那份 `assignEnterprise`，
 * 同一个判断不在两处各算一遍。
 */
const {
  settleDialogVisible,
  settleSaving,
  settleLoading,
  settleForm,
  settleBound,
  settleStage,
  settleCorporateLocked,
  settleSubjectLabel,
  settleAccountWord,
  settleSubjectMismatch,
  settleMaterialMissing,
  settleMaterialMissingText,
  settleUnderReview,
  settleUnderReviewText,
  settleRejected,
  settleProviderError,
  settleCities,
  settleCardPlaceholder,
  setSettleProvince,
  refreshAdapayMember,
  openSettleDialog,
  closeSettleDialog,
  saveSettleAccount,
  closeSettleDialogVisible,
  closeSettleConfirmation,
  closeSettleReady,
  closeSettleLoading,
  openCloseSettleDialog,
  handleCloseSettleAccount,
} = useSettlementAccount({
  realname: current,
  adapayMember,
  isEnterpriseSubject: () => assignEnterprise.value,
})

/** 缺企业资料时不去重绑：关掉结算弹窗、打开实名表单让用户补企业进件资料。 */
function goFixSettleMaterial() {
  settleDialogVisible.value = false
  realnameDialogVisible.value = true
  startRealnameChange()
}

const asign = reactive({
  mobileByCode: { mobile: '', code: '', ctoken: '' },
  legalPerson: { name: '', idCard: '' },
  company: { companyName: '', legalName: '', legalIdCard: '' },
  personal: { personalName: '', mobile: '' },
})
const asignLoading = reactive({
  sendCode: false,
  mobileByCode: false,
  legalPerson: false,
  company: false,
  personal: false,
})

function requireToken(): boolean {
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return false
  }
  return true
}

async function handleSendVerifyCode() {
  if (!requireToken()) return
  if (!asign.mobileByCode.mobile.trim()) {
    TMessage.warning('请先填写新手机号')
    return
  }
  asignLoading.sendCode = true
  try {
    const res = await sendVerifyCode(auth.token, { mobile: asign.mobileByCode.mobile.trim() })
    if (res.success) {
      asign.mobileByCode.ctoken = res.data?.codeToken ?? ''
      TMessage.success('验证码已发送，请查收短信')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送验证码失败')
  } finally {
    asignLoading.sendCode = false
  }
}

async function handleModifyMobileByCode() {
  if (!requireToken()) return
  if (
    !asign.mobileByCode.mobile.trim() ||
    !asign.mobileByCode.code.trim() ||
    !asign.mobileByCode.ctoken.trim()
  ) {
    TMessage.warning('请填写手机号与验证码（需先发送验证码）')
    return
  }
  asignLoading.mobileByCode = true
  try {
    const res = await modifyMobileByCode(auth.token, {
      mobile: asign.mobileByCode.mobile.trim(),
      code: asign.mobileByCode.code.trim(),
      ctoken: asign.mobileByCode.ctoken.trim(),
    })
    if (res.success) {
      TMessage.success('手机号已修改')
      asign.mobileByCode.mobile = ''
      asign.mobileByCode.code = ''
      asign.mobileByCode.ctoken = ''
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改手机号失败')
  } finally {
    asignLoading.mobileByCode = false
  }
}

/// 修改法人：爱签侧与「修改企业信息」同接口（`/user/modifyCompanyInfo`），
/// 只是这时法人三要素必须齐全（姓名 + 身份证号 + 证件类型 1=身份证）。
async function handleModifyLegalPerson() {
  if (!requireToken()) return
  if (!asign.legalPerson.name.trim() || !asign.legalPerson.idCard.trim()) {
    TMessage.warning('请填写法人姓名与身份证号')
    return
  }
  asignLoading.legalPerson = true
  try {
    const res = await modifyCompanyInfo(auth.token, {
      name: asign.legalPerson.name.trim(),
      idCard: asign.legalPerson.idCard.trim(),
      idCardType: 1,
    })
    if (res.success) {
      TMessage.success('法人信息已修改')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改法人失败')
  } finally {
    asignLoading.legalPerson = false
  }
}

async function handleModifyCompanyInfo() {
  if (!requireToken()) return
  if (!asign.company.companyName.trim() && !asign.company.legalName.trim()) {
    TMessage.warning('请填写企业名称或法人信息')
    return
  }
  asignLoading.company = true
  try {
    const res = await modifyCompanyInfo(auth.token, {
      companyName: asign.company.companyName.trim() || undefined,
      name: asign.company.legalName.trim() || undefined,
      idCard: asign.company.legalIdCard.trim() || undefined,
      idCardType: 1,
    })
    if (res.success) {
      TMessage.success(res.data ? '企业信息已修改，新印章已生成' : '企业信息已修改')
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改企业信息失败')
  } finally {
    asignLoading.company = false
  }
}

async function handleModifyUserName() {
  if (!requireToken()) return
  if (!asign.personal.personalName.trim()) {
    TMessage.warning('请填写姓名')
    return
  }
  if (!asign.personal.mobile.trim()) {
    TMessage.warning('请填写本人手机号（用于运营商三要素核验）')
    return
  }
  asignLoading.personal = true
  try {
    // 核验方式固定三要素；手机号用用户本次输入的（不再让他选四要素）
    const res = await modifyUserName(auth.token, {
      name: asign.personal.personalName.trim(),
      identifyType: 2,
      mobile: asign.personal.mobile.trim(),
    })
    if (res.success) {
      TMessage.success('姓名已修改')
      asign.personal.personalName = ''
      asign.personal.mobile = ''
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改姓名失败')
  } finally {
    asignLoading.personal = false
  }
}

async function submitRealname() {
  auth.hydrate()
  if (!auth.token.trim()) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  // 个人走爱签人脸核身（后端自动分流大陆/港澳台）；企业走爱签企业实名认证。
  if (identityCardSelected.value) {
    await startWechatFaceid()
    return
  }

  if (enterpriseSelected.value) {
    await startEnterpriseAsign()
    return
  }

  if (realnameLocked.value) {
    TMessage.warning('实名认证审核中或已通过时不能修改')
    return
  }

  const msg = validate()
  if (msg) {
    TMessage.warning(msg)
    return
  }

  submitting.value = true
  try {
    const updated = await submitMyRealnameVerification(auth.token, buildPayload())
    applyRealnameRecord(updated)
    TMessage.success(
      updated.status === 'approved' ? '实名认证信息已更新' : '实名认证信息已提交，请等待审核',
    )
    await tryRestoreBusinessPage(updated)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '提交实名认证失败')
  } finally {
    submitting.value = false
  }
}

async function loadCurrentRealname() {
  auth.hydrate()
  if (!auth.token.trim()) {
    return
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    applyRealnameRecord(record)
    await tryRestoreBusinessPage(record)
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      return
    }

    TMessage.error(err instanceof Error ? err.message : '加载实名认证状态失败')
  }
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    github: 'GitHub',
    gitee: 'Gitee',
    qq: 'QQ',
    wechat: '微信',
    alipay: '支付宝',
  }
  return labels[provider] ?? provider
}

function isProviderBound(provider: string): boolean {
  return boundProviders.value.includes(provider)
}

const accountCloseReady = computed(() => accountCloseConfirmation.value.trim() === '注销账号')

function openAccountCloseDialog() {
  accountCloseConfirmation.value = ''
  accountCloseDialogVisible.value = true
}

async function handleCloseAccount() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后注销账号')
    return
  }
  if (!accountCloseReady.value) {
    TMessage.warning('请输入“注销账号”确认操作')
    return
  }

  accountClosing.value = true
  try {
    await closeAccount(auth.token)
    accountCloseDialogVisible.value = false
    auth.logout()
    TMessage.success('账号已注销，第三方绑定已释放')
    await router.replace({ name: 'home' })
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '注销账号失败')
  } finally {
    accountClosing.value = false
  }
}

async function loadBoundProviders() {
  if (!auth.isAuthed) {
    return
  }
  try {
    const result = await getBoundProviders(auth.token)
    boundProviders.value = result.providers ?? []
  } catch {
    boundProviders.value = []
  }
}

async function handleProviderBinding(provider: 'github' | 'gitee' | 'qq') {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再绑定')
    return
  }
  if (providerBindingLoading.value) {
    return
  }
  if (isProviderBound(provider)) {
    providerBindingLoading.value = true
    try {
      await unbindProvider(auth.token, provider)
      boundProviders.value = boundProviders.value.filter((item) => item !== provider)
      TMessage.success(`${providerLabel(provider)} 已解除绑定`)
    } catch (err) {
      TMessage.error(
        err instanceof Error ? err.message : `解除 ${providerLabel(provider)} 绑定失败`,
      )
    } finally {
      providerBindingLoading.value = false
    }
    return
  }

  providerBindingLoading.value = true
  try {
    const { url } = await getProviderBindUrl(auth.token, provider, window.location.href)
    if (!url.trim()) {
      throw new Error('绑定地址为空')
    }
    window.location.assign(url)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : `发起 ${providerLabel(provider)} 绑定失败`)
    providerBindingLoading.value = false
  }
}

// 设置弹窗可见性
const emailDialogVisible = ref(false)
const passwordDialogVisible = ref(false)
const usernameDialogVisible = ref(false)
const twoFactorDialogVisible = ref(false)

const accountEmailLabel = computed(() => profileEmail.value || '未绑定邮箱')
const twoFactorChanged = computed(() => twoFactorTargetEnabled.value !== twoFactorEnabled.value)

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  profileLoading.value = true
  try {
    const profile = await getProfile(auth.token)
    newUsername.value = profile.username
    profileEmail.value = profile.email ?? ''
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
    wechatBound.value = profile.wechat_bound ?? false
    if (!newEmail.value) {
      newEmail.value = profile.email ?? ''
    }
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '加载个人资料失败')
  } finally {
    profileLoading.value = false
  }
}

async function updateUsername() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改用户名')
    return
  }

  const trimmed = newUsername.value.trim()
  if (trimmed.length === 0) {
    TMessage.error('请输入一个新的用户名')
    return
  }
  if (trimmed === auth.username) {
    TMessage.info('用户名未发生变化')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = auth.username
    TMessage.success('用户名已更新')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改用户名失败')
  } finally {
    usernameLoading.value = false
  }
}

async function sendEmailVerificationCode() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改邮箱')
    return
  }

  const trimmed = newEmail.value.trim()
  if (!trimmed) {
    TMessage.error('请输入新的邮箱地址')
    return
  }
  if (trimmed === profileEmail.value) {
    TMessage.warning('新邮箱不能与当前邮箱相同')
    return
  }

  emailCodeSending.value = true
  try {
    await sendProfileEmailChangeCode(auth.token, trimmed)
    TMessage.success('验证码已发送到新邮箱，请查收')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送邮箱验证码失败')
  } finally {
    emailCodeSending.value = false
  }
}

async function submitEmailChange() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改邮箱')
    return
  }

  const trimmedEmail = newEmail.value.trim()
  const trimmedCode = emailCode.value.trim()
  if (!trimmedEmail) {
    TMessage.error('请输入新的邮箱地址')
    return
  }
  if (trimmedCode.length !== 6) {
    TMessage.error('请输入 6 位邮箱验证码')
    return
  }

  emailLoading.value = true
  try {
    const profile = await updateProfileEmail(auth.token, trimmedEmail, trimmedCode)
    profileEmail.value = profile.email ?? ''
    newEmail.value = profile.email ?? ''
    emailCode.value = ''
    TMessage.success('邮箱已更新')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改邮箱失败')
  } finally {
    emailLoading.value = false
  }
}

async function sendPasswordVerificationCode() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改密码')
    return
  }
  if (!profileEmail.value) {
    TMessage.error('请先绑定邮箱后再修改密码')
    return
  }

  passwordCodeSending.value = true
  try {
    await sendProfilePasswordCode(auth.token)
    TMessage.success('验证码已发送到当前绑定邮箱，请查收')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送密码验证码失败')
  } finally {
    passwordCodeSending.value = false
  }
}

async function submitPasswordChange() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改密码')
    return
  }

  const trimmedPassword = newPassword.value.trim()
  const trimmedConfirm = confirmPassword.value.trim()
  const trimmedCode = passwordCode.value.trim()

  if (trimmedPassword.length < 6) {
    TMessage.error('新密码至少 6 位')
    return
  }
  if (trimmedPassword !== trimmedConfirm) {
    TMessage.error('两次输入的新密码不一致')
    return
  }
  if (trimmedCode.length !== 6) {
    TMessage.error('请输入 6 位邮箱验证码')
    return
  }

  passwordLoading.value = true
  try {
    await updateProfilePassword(auth.token, trimmedPassword, trimmedCode)
    newPassword.value = ''
    confirmPassword.value = ''
    passwordCode.value = ''
    TMessage.success('密码已更新，请使用新密码登录')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '修改密码失败')
  } finally {
    passwordLoading.value = false
  }
}

async function sendTwoFactorVerificationCode() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改两步验证')
    return
  }
  if (!profileEmail.value) {
    TMessage.error('请先绑定邮箱后再修改两步验证')
    return
  }
  if (!twoFactorChanged.value) {
    TMessage.info('两步验证设置未发生变化')
    return
  }

  twoFactorCodeSending.value = true
  try {
    await sendProfileTwoFactorCode(auth.token)
    TMessage.success('验证码已发送到当前绑定邮箱，请查收')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发送两步验证验证码失败')
  } finally {
    twoFactorCodeSending.value = false
  }
}

/// 拨动「邮箱验证码保护」开关：`enabled` 是新勾选状态（由弹窗从 change 事件里取出来回传）。
/// 第一次打开时顺手发一次验证码，并把上一次填的验证码清掉。
async function handleTwoFactorTargetChange(enabled: boolean) {
  twoFactorTargetEnabled.value = enabled
  twoFactorCode.value = ''

  if (enabled && !twoFactorEnabled.value && !twoFactorCodeSending.value) {
    await sendTwoFactorVerificationCode()
  }
}

async function submitTwoFactorChange() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后修改两步验证')
    return
  }
  if (!profileEmail.value) {
    TMessage.error('请先绑定邮箱后再修改两步验证')
    return
  }
  if (!twoFactorChanged.value) {
    TMessage.info('两步验证设置未发生变化')
    return
  }

  const trimmedCode = twoFactorCode.value.trim()
  if (trimmedCode.length !== 6) {
    TMessage.error('请输入 6 位邮箱验证码')
    return
  }

  twoFactorLoading.value = true
  try {
    const profile = await updateProfileTwoFactor(
      auth.token,
      twoFactorTargetEnabled.value,
      trimmedCode,
    )
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
    twoFactorCode.value = ''
    await auth.fetchProfile(true).catch(() => undefined)
    TMessage.success(twoFactorEnabled.value ? '两步验证已开启' : '两步验证已关闭')
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '更新两步验证失败')
  } finally {
    twoFactorLoading.value = false
  }
}

// PC 端扫码绑定：展示二维码并轮询绑定结果。
const wechatBindQr = reactive({ visible: false, url: '', state: '' })

function isWechatBrowser() {
  return /MicroMessenger/i.test(navigator.userAgent)
}

async function openWechatBinding() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再绑定微信')
    return
  }
  if (wechatBindingLoading.value) {
    return
  }
  wechatBindingLoading.value = true
  try {
    // 微信内（移动端）：跳转服务号网页授权；PC 端：展示二维码扫码绑定。
    if (isWechatBrowser()) {
      const { url } = await getWechatBindAuthorizeUrl(auth.token, window.location.href)
      if (!url.trim()) {
        throw new Error('微信授权地址为空')
      }
      window.location.assign(url)
      return
    }

    const qr = await getWechatBindQrUrl(auth.token, window.location.href)
    if (!qr.url.trim() || !qr.state.trim()) {
      throw new Error('微信绑定二维码地址为空')
    }
    wechatBindQr.url = qr.url
    wechatBindQr.state = qr.state
    wechatBindQr.visible = true
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '发起微信绑定失败')
  } finally {
    wechatBindingLoading.value = false
  }
}

async function unbindWechat() {
  if (!auth.isAuthed) {
    TMessage.error('请先登录后再解除微信绑定')
    return
  }
  if (wechatBindingLoading.value) {
    return
  }

  wechatBindingLoading.value = true
  try {
    await unbindProvider(auth.token, 'wechat')
    wechatBound.value = false
    TMessage.success('微信已解除绑定')
    await auth.fetchProfile(true).catch(() => undefined)
  } catch (err) {
    TMessage.error(err instanceof Error ? err.message : '解除微信绑定失败')
  } finally {
    wechatBindingLoading.value = false
  }
}

async function handleWechatBinding() {
  if (wechatBound.value) {
    await unbindWechat()
    return
  }
  await openWechatBinding()
}

function closeWechatBindQr() {
  wechatBindQr.visible = false
  wechatBindQr.url = ''
  wechatBindQr.state = ''
}

async function handleWechatBound(result: { success: boolean; error?: string }) {
  closeWechatBindQr()
  if (result.success) {
    wechatBound.value = true
    TMessage.success('微信绑定成功')
    await auth.fetchProfile(true).catch(() => undefined)
  } else {
    TMessage.error(`微信绑定失败：${result.error ?? '未完成'}`)
  }
}

function consumeWechatBindResult() {
  const result = typeof route.query.wechat_bind === 'string' ? route.query.wechat_bind.trim() : ''
  const error =
    typeof route.query.wechat_bind_error === 'string' ? route.query.wechat_bind_error.trim() : ''
  if (result === 'success') {
    TMessage.success('微信绑定成功')
  } else if (error) {
    TMessage.error(`微信绑定失败：${error}`)
  }
  if (result || error) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_bind
    delete nextQuery.wechat_bind_error
    void router.replace({ query: nextQuery })
  }
}

function consumeProviderBindResult() {
  const result = typeof route.query.bind === 'string' ? route.query.bind.trim() : ''
  const error = typeof route.query.bind_error === 'string' ? route.query.bind_error.trim() : ''
  if (result === 'success') {
    TMessage.success('第三方账号绑定成功')
    void loadBoundProviders()
  } else if (error) {
    TMessage.error(`第三方账号绑定失败：${error}`)
  }
  if (result || error) {
    const nextQuery = { ...route.query }
    delete nextQuery.bind
    delete nextQuery.bind_error
    void router.replace({ query: nextQuery })
  }
}

onMounted(async () => {
  auth.hydrate()
  newUsername.value = auth.username
  consumeWechatBindResult()
  consumeProviderBindResult()
  await loadProfile()
  await loadBoundProviders()

  mobileMatch = window.matchMedia('(max-width: 720px)')
  syncMobileViewport()
  mobileMatch.addEventListener('change', syncMobileViewport)

  await loadCurrentRealname()
  if (redirectTarget.value && !realnameApproved.value) {
    realnameDialogVisible.value = true
  }
  // 会员状态走 composable 里那份刷新（失败置空，界面退化为「未绑定」）
  await refreshAdapayMember()
  // 钱包页的「去绑定收款银行卡」入口：带 settle=1 直接打开结算账户弹窗
  if (route.query.settle === '1') {
    void openSettleDialog()
    const nextQuery = { ...route.query }
    delete nextQuery.settle
    void router.replace({ query: nextQuery })
  }
  // 只有「处理中」才需要问结果：流水号由后端从库里取，前端不再持有任何渠道凭证。
  // 已通过 / 已驳回时不必再打这个接口——它是一次「回查」，每次打开账户页都往渠道跑一趟
  // 没有意义（该端点在历史版本里会连带重放「实名通过」的副作用，把企业开户一遍遍送审）。
  if (!current.value || current.value.status === 'pending') {
    await checkWechatFaceidResult({ silent: true })
  }
  // 刷新后尝试恢复丢失的爱签二维码（若仍未完成人脸核身）
  await restoreFaceidChallengeIfNeeded()
})

onBeforeUnmount(() => {
  mobileMatch?.removeEventListener('change', syncMobileViewport)
  mobileMatch = null
  // 人脸轮询的定时器由 `useFaceidChallenge` 绑在 onScopeDispose 上，这里不用管
})
</script>

<template>
  <main class="page-shell custom-page-shell profile-page account-coupons-page">
    <div class="account-realname-hero">
      <RealnameHero :verification="current" :adapay-member="adapayMember" />
    </div>

    <section class="wallet-section account-settings-section">
      <div class="realname-form__head">
        <h3>账号与安全</h3>
      </div>
      <div v-for="group in accountEntryGroups" :key="group.title" class="entry-group">
        <p class="entry-group__title">{{ group.title }}</p>
        <div class="entry-grid">
          <TButton
            v-for="entry in group.entries"
            :key="entry.key"
            class="entry-row"
            :class="{ 'entry-row--danger': entry.danger, 'entry-row--locked': entry.locked }"
            :aria-disabled="entry.locked ? 'true' : undefined"
            :loading="Boolean(entry.loading)"
            @click="openAccountEntry(entry.key)"
          >
            <span class="entry-row__icon">
              <TIcon><component :is="entry.icon" /></TIcon>
            </span>
            <span class="entry-row__copy">
              <span class="entry-row__title">{{ entry.title }}</span>
              <small class="entry-row__desc">{{ entry.desc }}</small>
              <TTag
                v-if="entry.status"
                :tone="entry.status.tone"
                size="sm"
                class="entry-row__status"
              >
                {{ entry.status.text }}
              </TTag>
            </span>
            <TIcon class="entry-row__arrow"><ArrowRight /></TIcon>
          </TButton>
        </div>
      </div>
    </section>

    <section id="account-realname" class="account-realname-section">
      <div class="realname-page-shell">
        <TDialog
          v-model:open="realnameDialogVisible"
          title="提交认证信息"
          class="realname-dialog"
          width="620px"
        >
          <TAlert
            v-if="realnamePending && realnameChangeBacked"
            tone="info"
            :closable="false"
            show-icon
            title="主体变更认证中"
          >
            认证通过前账号实名状态为「认证中」，可点下方「取消变更，还原原主体」回到变更前的实名主体。
          </TAlert>

          <TForm label-position="top" class="realname-form">
            <TFormItem label="证件类型">
              <TRadioGroup v-model="form.authType" :disabled="realnameLocked">
                <TRadio value="IDENTITY_CARD">个人</TRadio>
                <TRadio value="ENTERPRISE">企业认证</TRadio>
                <TRadio value="SOLE_PROPRIETOR">个体工商户</TRadio>
              </TRadioGroup>
            </TFormItem>

            <template v-if="businessSelected">
              <TFormItem :label="soleProprietorSelected ? '个体工商户名称' : '企业名称'" required>
                <TInput
                  v-model="form.companyName"
                  :maxlength="120"
                  placeholder="请输入企业名称"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="统一社会信用代码" required>
                <TInput
                  v-model="form.unifiedSocialCreditCode"
                  :maxlength="64"
                  placeholder="请输入统一社会信用代码"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="营业执照号">
                <TInput
                  v-model="form.businessLicenseNo"
                  :maxlength="64"
                  placeholder="请输入营业执照号（可选）"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="营业执照文件" required>
                <div class="realname-consent-upload">
                  <input
                    ref="businessLicenseFileInput"
                    class="realname-consent-upload__native"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                    @change="handleBusinessLicenseFileChange"
                  />
                  <TButton
                    variant="outline"
                    :loading="businessLicenseUploading"
                    :disabled="realnameLocked"
                    @click="openBusinessLicensePicker"
                  >
                    选择文件上传
                  </TButton>
                  <span v-if="businessLicenseOcrLoading" class="realname-consent-upload__hint">
                    正在识别营业执照，自动填写企业信息…
                  </span>
                  <span v-else-if="form.businessLicenseFile" class="realname-consent-upload__name">
                    已上传：{{ form.businessLicenseFile.split('/').pop() || '营业执照' }}
                  </span>
                  <span v-else class="realname-consent-upload__hint">
                    请上传营业执照扫描件或照片（图片或 PDF，10MB 以内）
                  </span>
                </div>
                <!-- 企业进件资料里有四项不在表单里，只能来自营业执照识别：把识别结果（或缺失项）
                     挂在照片下面，既交代「自动填好了什么」，也是提交按钮被置灰时的原因。 -->
                <p
                  v-if="
                    businessSelected &&
                    form.businessLicenseFile &&
                    !businessLicenseOcrLoading &&
                    businessLicenseDerivedNote
                  "
                  class="realname-consent-upload__derived"
                  :class="{ 'is-missing': businessLicenseDerivedMissing.length > 0 }"
                >
                  {{ businessLicenseDerivedNote }}
                </p>
              </TFormItem>
              <!-- 企业开户进件要求三张证照：营业执照 + 法人身份证人像面 + 国徽面。
                   后两张与营业执照同一套上传控件，上传即落库，不进提交实名 payload。 -->
              <TFormItem label="法人身份证人像面" required>
                <div class="realname-consent-upload">
                  <input
                    ref="legalCertFrontFileInput"
                    class="realname-consent-upload__native"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    @change="handleLegalCertFrontFileChange"
                  />
                  <TButton
                    variant="outline"
                    :loading="legalCertFrontUploading"
                    :disabled="realnameLocked"
                    @click="openLegalCertFrontPicker"
                  >
                    选择文件上传
                  </TButton>
                  <span v-if="form.legalCertFrontFile" class="realname-consent-upload__name">
                    已上传：{{ form.legalCertFrontFile.split('/').pop() || '法人身份证人像面' }}
                  </span>
                  <span v-else class="realname-consent-upload__hint">
                    请上传法人身份证人像面照片（图片，10MB 以内）
                  </span>
                </div>
              </TFormItem>
              <TFormItem label="法人身份证国徽面" required>
                <div class="realname-consent-upload">
                  <input
                    ref="legalCertBackFileInput"
                    class="realname-consent-upload__native"
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    @change="handleLegalCertBackFileChange"
                  />
                  <TButton
                    variant="outline"
                    :loading="legalCertBackUploading"
                    :disabled="realnameLocked"
                    @click="openLegalCertBackPicker"
                  >
                    选择文件上传
                  </TButton>
                  <span v-if="form.legalCertBackFile" class="realname-consent-upload__name">
                    已上传：{{ form.legalCertBackFile.split('/').pop() || '法人身份证国徽面' }}
                  </span>
                  <span v-else class="realname-consent-upload__hint">
                    请上传法人身份证国徽面照片（图片，10MB 以内）
                  </span>
                </div>
              </TFormItem>
              <TFormItem label="经办人姓名" required>
                <TInput
                  v-model="form.operatorName"
                  :maxlength="120"
                  placeholder="请输入经办人姓名"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="经办人身份证号" required>
                <TInput
                  v-model="form.operatorIdCardNo"
                  :maxlength="64"
                  placeholder="请输入经办人身份证号"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="手机号" required>
                <TInput
                  v-model="form.mobile"
                  :maxlength="11"
                  :placeholder="
                    current?.mobile_masked
                      ? `请输入经办人手机号（当前 ${current.mobile_masked}）`
                      : '请输入经办人手机号（用于电子签署）'
                  "
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <!-- 企业进件资料里的「所在省市 / 注册地址 / 经营范围 / 营业执照有效期」不再让用户手填：
                   这四项都能从营业执照照片识别（省市编码由识别出的注册地址映射成渠道编码），
                   所以这里只留上传入口，识别结果与缺失项由上传区下方那行提示给出。 -->
              <!-- 法人证件有效期：起止两项。起始日以前是缺的（渠道标 Y 却一直是空串），
                   现在在上传法人身份证后人像面 / 国徽面 OCR 自动回填；手填或改过的一律保留。 -->
              <TFormItem label="法人证件有效期" required>
                <div class="realname-date-row">
                  <TDatePicker
                    v-model="form.legalCertBeginOn"
                    type="date"
                    value-format="YYYYMMDD"
                    format="YYYY-MM-DD"
                    placeholder="证件有效期起始日"
                    :disabled="realnameLocked"
                    @change="markLegalCertBeginEdited"
                  />
                  <TDatePicker
                    v-model="form.legalCertExpiresOn"
                    type="date"
                    value-format="YYYYMMDD"
                    format="YYYY-MM-DD"
                    placeholder="证件有效期截止日"
                    :disabled="realnameLocked"
                    @change="markLegalCertExpiresEdited"
                  />
                  <TButton
                    variant="text"
                    tone="accent"
                    :disabled="realnameLocked"
                    @click="applyLongTermLegalCert"
                  >
                    长期有效
                  </TButton>
                </div>
                <p v-if="legalCertOcrLoading" class="realname-consent-upload__derived">
                  正在按法人身份证识别证件有效期，自动填写起止日期…
                </p>
              </TFormItem>
              <TFormItem>
                <TAlert
                  tone="info"
                  :closable="false"
                  show-icon
                  title="企业认证信息提交后将由平台审核，审核通过后可用于合同签署。"
                />
              </TFormItem>
            </template>

            <template v-else>
              <TFormItem label="证件类型">
                <TSelect v-model="form.idCardType" :disabled="realnameLocked" style="width: 100%">
                  <TOption label="居民身份证" :value="1" />
                  <TOption label="台湾居民来往大陆通行证" :value="2" disabled />
                  <TOption label="港澳居民来往内地通行证" :value="3" disabled />
                </TSelect>
              </TFormItem>
              <TFormItem label="姓名" required>
                <TInput
                  v-model="form.realName"
                  :maxlength="120"
                  placeholder="请输入真实姓名"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="证件号" required>
                <TInput
                  v-model="form.idCardNo"
                  :maxlength="64"
                  :placeholder="idCardPlaceholder"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="手机号" required>
                <TInput
                  v-model="form.mobile"
                  :maxlength="11"
                  :placeholder="
                    current?.mobile_masked
                      ? `请输入本人手机号（当前 ${current.mobile_masked}）`
                      : '请输入本人手机号（用于电子签署）'
                  "
                  :disabled="realnameLocked"
                />
              </TFormItem>
            </template>

            <TFormItem v-if="isUnder14">
              <TAlert
                tone="danger"
                :closable="false"
                show-icon
                title="未满 14 周岁的未成年人不能进行实名认证"
              />
            </TFormItem>

            <TFormItem v-if="isMinor14To18">
              <TCheckbox v-model="form.guardianConsent" :disabled="realnameLocked">
                我已取得监护人同意
              </TCheckbox>
            </TFormItem>

            <TFormItem v-if="isMinor14To18 && form.guardianConsent" label="监护人同意书" required>
              <div class="realname-consent-upload">
                <input
                  ref="consentFileInput"
                  class="realname-consent-upload__native"
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                  @change="handleConsentFileChange"
                />
                <TButton
                  variant="outline"
                  :loading="consentUploading"
                  :disabled="realnameLocked"
                  @click="openConsentPicker"
                >
                  选择文件上传
                </TButton>
                <span v-if="form.guardianConsentFile" class="realname-consent-upload__name">
                  已上传：{{ form.guardianConsentFile.split('/').pop() || '同意书' }}
                </span>
                <span v-else class="realname-consent-upload__hint">
                  请上传监护人签署的同意书（图片或 PDF，5MB 以内）
                </span>
                <a
                  class="realname-consent-template"
                  href="/guardian-consent-template.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  下载监护人同意书模板
                </a>
              </div>
            </TFormItem>

            <TFormItem v-if="isAdult">
              <TAlert
                tone="info"
                :closable="false"
                show-icon
                title="您已年满 18 周岁，无需上传监护人同意书"
              />
            </TFormItem>

            <div class="realname-form__actions">
              <TButton
                variant="outline"
                tone="danger"
                v-if="realnameCanWithdraw"
                :loading="withdrawing"
                @click="handleWithdraw"
              >
                {{ realnameChangeBacked ? '取消变更，还原原主体' : '撤回认证' }}
              </TButton>
              <TButton
                variant="outline"
                v-if="realnameChanging"
                :disabled="submitting || faceidStarting"
                @click="cancelRealnameChange"
              >
                放弃变更
              </TButton>
              <TButton
                variant="solid"
                tone="accent"
                class="realname-submit-btn"
                :loading="submitting || faceidStarting"
                :disabled="submitDisabled"
                @click="submitRealname"
              >
                <TIcon v-if="identityCardSelected">
                  <Promotion />
                </TIcon>
                {{ submitButtonText }}
              </TButton>
            </div>
          </TForm>
        </TDialog>

        <TCard class="realname-card asign-account-card">
          <div class="realname-form__head">
            <h3>认证管理</h3>
          </div>
          <div v-for="group in realnameEntryGroups" :key="group.title" class="entry-group">
            <p class="entry-group__title">{{ group.title }}</p>
            <div class="entry-grid">
              <TButton
                v-for="entry in group.entries"
                :key="entry.key"
                class="entry-row"
                :class="{ 'entry-row--danger': entry.danger, 'entry-row--locked': entry.locked }"
                :aria-disabled="entry.locked ? 'true' : undefined"
                :loading="Boolean(entry.loading)"
                @click="openAccountEntry(entry.key)"
              >
                <span class="entry-row__icon">
                  <TIcon><component :is="entry.icon" /></TIcon>
                </span>
                <span class="entry-row__copy">
                  <span class="entry-row__title">{{ entry.title }}</span>
                  <small class="entry-row__desc">{{ entry.desc }}</small>
                  <TTag
                    v-if="entry.status"
                    :tone="entry.status.tone"
                    size="sm"
                    class="entry-row__status"
                  >
                    {{ entry.status.text }}
                  </TTag>
                </span>
                <TIcon class="entry-row__arrow"><ArrowRight /></TIcon>
              </TButton>
            </div>
          </div>
        </TCard>

        <!-- 收款银行卡：渠道原话 / 主体变更与缺资料提示 + 银行卡表单，模板与样式都在组件里 -->
        <SettlementDialog
          v-model:visible="settleDialogVisible"
          :loading="settleLoading"
          :saving="settleSaving"
          :bound="settleBound"
          :corporate-locked="settleCorporateLocked"
          :subject-mismatch="settleSubjectMismatch"
          :subject-label="settleSubjectLabel"
          :material-missing="settleMaterialMissing"
          :material-missing-text="settleMaterialMissingText"
          :provider-error="settleProviderError"
          :rejected="settleRejected"
          :card-placeholder="settleCardPlaceholder"
          :card-id="settleForm.card_id"
          :bank-code="settleForm.bank_code"
          :prov-code="settleForm.prov_code"
          :area-code="settleForm.area_code"
          :bank-acct-type="settleForm.bank_acct_type"
          :cities="settleCities"
          @update:card-id="settleForm.card_id = $event"
          @update:bank-code="settleForm.bank_code = $event"
          @update:prov-code="setSettleProvince"
          @update:area-code="settleForm.area_code = $event"
          @update:bank-acct-type="settleForm.bank_acct_type = $event"
          @submit="saveSettleAccount"
          @cancel="closeSettleDialog"
          @fix-material="goFixSettleMaterial"
        />

        <CloseSettleDialog
          v-model:visible="closeSettleDialogVisible"
          :confirmation="closeSettleConfirmation"
          :ready="closeSettleReady"
          :saving="closeSettleLoading"
          @update:value="closeSettleConfirmation = $event"
          @submit="handleCloseSettleAccount"
        />

        <!-- 人脸核身：二维码 / 三步指引 / 三个动作，模板与样式都在组件里；
             可见性仍由本页持有（它还要连带关掉实名弹窗） -->
        <FaceidDialog
          v-model:visible="faceidDialogVisible"
          :enterprise="enterpriseSelected"
          :mobile="isMobile"
          :qr-data-url="faceidQrDataUrl"
          :checking="faceidChecking"
          :withdrawing="withdrawing"
          :change-backed="realnameChangeBacked"
          @withdraw="handleWithdraw"
          @open-page="openWechatFaceidPage"
          @check="checkWechatFaceidResult()"
        />

        <AsignDialog
          v-model:visible="asignDialogVisible"
          :kind="asignDialogKind"
          :mobile="asign.mobileByCode.mobile"
          :code="asign.mobileByCode.code"
          :legal-person-name="asign.legalPerson.name"
          :legal-person-id-card="asign.legalPerson.idCard"
          :company-name="asign.company.companyName"
          :company-legal-name="asign.company.legalName"
          :company-legal-id-card="asign.company.legalIdCard"
          :personal-name="asign.personal.personalName"
          :personal-mobile="asign.personal.mobile"
          :loading="asignLoading"
          :mobile-masked="current?.mobile_masked ?? ''"
          @update:mobile="asign.mobileByCode.mobile = $event"
          @update:code="asign.mobileByCode.code = $event"
          @update:legal-person-name="asign.legalPerson.name = $event"
          @update:legal-person-id-card="asign.legalPerson.idCard = $event"
          @update:company-name="asign.company.companyName = $event"
          @update:company-legal-name="asign.company.legalName = $event"
          @update:company-legal-id-card="asign.company.legalIdCard = $event"
          @update:personal-name="asign.personal.personalName = $event"
          @update:personal-mobile="asign.personal.mobile = $event"
          @send-code="handleSendVerifyCode"
          @modify-mobile="handleModifyMobileByCode"
          @modify-legal-person="handleModifyLegalPerson"
          @modify-company="handleModifyCompanyInfo"
          @modify-user-name="handleModifyUserName"
        />

        <!-- 印章管理：企业电子印章由爱签生成，用于合同盖章；只读展示 + 在线制章链接 -->
        <SealDialog
          v-model:visible="sealDialogVisible"
          :loading="sealLoading"
          :error="sealError"
          :data="sealData"
          :making="sealMakeLoading"
          @reload="loadMySeals"
          @make-online="handleSealMakeOnline"
          @open-company="openCompanyFromSeal"
        />
      </div>
    </section>

    <EmailDialog
      v-model:visible="emailDialogVisible"
      :initial-email="newEmail"
      :initial-code="emailCode"
      :saving="emailLoading"
      :code-sending="emailCodeSending"
      @update:email="newEmail = $event"
      @update:code="emailCode = $event"
      @send-code="sendEmailVerificationCode"
      @submit="submitEmailChange"
    />

    <PasswordDialog
      v-model:visible="passwordDialogVisible"
      :initial-password="newPassword"
      :initial-confirm="confirmPassword"
      :initial-code="passwordCode"
      :saving="passwordLoading"
      :code-sending="passwordCodeSending"
      :email-bound="Boolean(profileEmail)"
      @update:password="newPassword = $event"
      @update:confirm="confirmPassword = $event"
      @update:code="passwordCode = $event"
      @send-code="sendPasswordVerificationCode"
      @submit="submitPasswordChange"
    />

    <UsernameDialog
      v-model:visible="usernameDialogVisible"
      :initial="newUsername"
      :saving="usernameLoading"
      @update:value="newUsername = $event"
      @submit="updateUsername"
    />

    <TwoFactorDialog
      v-model:visible="twoFactorDialogVisible"
      :target-enabled="twoFactorTargetEnabled"
      :code="twoFactorCode"
      :saving="twoFactorLoading"
      :code-sending="twoFactorCodeSending"
      :changed="twoFactorChanged"
      :email-bound="Boolean(profileEmail)"
      :email-label="accountEmailLabel"
      @update:code="twoFactorCode = $event"
      @toggle="handleTwoFactorTargetChange"
      @send-code="sendTwoFactorVerificationCode"
      @submit="submitTwoFactorChange"
    />

    <CloseAccountDialog
      v-model:visible="accountCloseDialogVisible"
      :confirmation="accountCloseConfirmation"
      :ready="accountCloseReady"
      :saving="accountClosing"
      @update:value="accountCloseConfirmation = $event"
      @submit="handleCloseAccount"
    />

    <WechatBindQrModal
      :visible="wechatBindQr.visible"
      :url="wechatBindQr.url"
      :state="wechatBindQr.state"
      @close="closeWechatBindQr"
      @bound="handleWechatBound"
    />
  </main>
</template>

<style scoped>
.account-coupons-page {
  min-height: calc(100vh - 185px);
  gap: 16px;
}

.account-realname-hero {
  margin-bottom: 4px;
}

.account-realname-section {
  margin-top: 4px;
}

/* ── 账户入口：分组 + 行（「认证管理」「账号与安全」两张卡共用） ── */

/* TButton 的基础样式是固定 36px 高 + 左右 16px 内边距；这里的行内是 40px 图标底衬 + 两行文案，
   36px 会让图标上下顶出边框（实测内容高 37px > 内容框 34px）。账户入口行必须放开高度：
   高度自适应 + 上下 8px，内容 40px 时整行 58px，图标与描边之间留出呼吸位。 */
/* 审核期间不放开的入口：看着就是不能点，但点了会告诉你为什么（不是死链接）。 */
.entry-row--locked {
  opacity: 0.62;
  cursor: not-allowed;
}

.entry-row {
  height: auto;
  min-height: 56px;
  padding-top: 8px;
  padding-bottom: 8px;
  /* TButton 默认 justify-content: center，会把「图标 + 文案 + 箭头」整块居中
     （实测左边空出 56px）；入口行要从左往右排。 */
  justify-content: flex-start;
  text-align: left;
}

/* TButton 把 slot 包在 .t73-button__label 里，而它是 flex: 0 1 auto——只包住内容宽，
   于是整块被按钮居中。这里让它撑满整行、并从头排，文案区（flex: 1）再吃掉剩余宽度，
   箭头就落到最右。min-width: 0 是长文案能收省略号的前提。 */
.entry-row :deep(.t73-button__label) {
  flex: 1 1 auto;
  justify-content: flex-start;
  min-width: 0;
}

/* 双保险：即使文案区没吃满，箭头也贴右 */
.entry-row__arrow {
  margin-left: auto;
}

.entry-group {
  display: grid;
  gap: 10px;
}

.realname-form__head + .entry-group {
  margin-top: 12px;
}

.entry-group + .entry-group {
  margin-top: 18px;
}

.entry-group__title {
  margin: 0;
  color: var(--profile-text-sub);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.entry-row__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  /* 40px 底衬配 20px 图标：底衬要跟两行文案（14px 标题 + 12px 描述 ≈ 40px）站得住，
     36px/18px 时图标看着缩在角落、整行发空 */
  width: 40px;
  height: 40px;
  border-radius: 12px;
  /* 图标与文案之间的横向间距，标题与副标题共用同一列、因此两者到图标的距离一致。
     用 margin 而不是父层 gap：TButton 会给标签、图标、箭头各包一层 span，
     gap 会同时给箭头也加一份，白白吃掉文案宽度。值与右侧 .entry-row__status 的 margin-right 对齐，一行左右两处留白同宽 */
  margin-right: 12px;
  background: var(--profile-accent-soft);
  color: var(--profile-accent);
  font-size: 20px;
}

/* 文案区：标题与描述占左列，状态标签独占右列；标签列只在有标签时才有宽度，
   没有标签的行（列宽 0）不因此少掉一个像素。
   两行必须显式写出来：没有显式行时 grid-row 的 -1 会退化到第一行，
   跨行失效、标签又贴回标题线上 */
.entry-row__copy {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  row-gap: 2px;
  min-width: 0;
}

.entry-row__title {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--profile-text-main);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-row__desc {
  grid-column: 1;
  grid-row: 2;
  /* 描述是单行副标题：长文本（企业主体名等）必须自己收口，
     否则会溢出到右列状态标签下面（实测 245px 的格子放 279px 文案）。 */
  min-width: 0;
  overflow: hidden;
  color: var(--profile-text-sub);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态标签：跨标题与描述两行、在整块文案里垂直居中，于是它和图标、箭头共用一条中线；
   胶囊内部的文案再显式居中一次（水平 + 垂直），不依赖 TTag 自身的对齐实现。
   左边与文案留 12px、右边与箭头留 12px——既不贴标题、也不顶到箭头上，且与
   .entry-row__icon 的 margin-right 同宽。这两份间距写在标签自己的 margin 上，
   没有标签的行（标签列宽 0）不会被它吃掉宽度 */
.entry-row__status {
  grid-column: 2;
  grid-row: 1 / -1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 12px;
  margin-right: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.entry-row__arrow {
  flex: 0 0 auto;
  color: var(--profile-text-soft);
  font-size: 16px;
  transition: transform 0.2s ease;
}
/* 弹窗样式：八个弹窗已全部搬进 `components/account/`，各自带一份 scoped 样式
   （父级 scoped 对子组件节点不命中，搬出去就必须跟着走）。这里只剩页面本身的样式。 */

/* 账户实名外壳按内容高度排：末张「认证说明」卡片已移除，右列无需再撑满、
   也不再与左侧工作台菜单对齐底边，避免卡片下方留出成片空白 */
.realname-page-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.realname-form__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.realname-form__head h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.realname-form {
  min-width: 0;
}

.realname-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* 两个日期选择器并排：让它们能收缩到比内容窄，否则 TDatePicker 的 100% 宽会把行顶出去。 */
.realname-date-row > * {
  min-width: 0;
}

.realname-form__actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.realname-consent-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.realname-consent-upload__native {
  display: none;
}

.realname-consent-upload__name {
  color: #15803d;
  font-size: 13px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.realname-consent-upload__hint {
  color: #64748b;
  font-size: 12px;
}

/* 营业执照识别结果那一行（识别出什么 / 缺了什么）：不在上传按钮那一行里，所以要自己带外边距。 */
.realname-consent-upload__derived {
  display: block;
  margin: 6px 0 0;
  color: var(--73-ink-muted);
  font-size: 12px;
  line-height: 1.6;
}

/* 有缺项时用警示色：这一行同时是「提交按钮为什么点不了」的原因。 */
.realname-consent-upload__derived.is-missing {
  color: var(--73-warning);
}

.realname-consent-template {
  color: #d97706;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.realname-consent-template:hover {
  color: #b45309;
  opacity: 1;
}

/* 账户入口行在窄屏改单列：900 是标准档，也与工作台外壳（`.user-workbench` 在 ≤900px
   收成单列）同一处拐点，不再自留 780 这一档。 */
@media (max-width: 900px) {
  .entry-grid {
    grid-template-columns: 1fr;
  }
}
</style>
