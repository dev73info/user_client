<script setup lang="ts">
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  changeMyAdapaySettlementAccount,
  closeMyAdapaySettlementAccount,
  createMyAdapaySettlementAccount,
  getMyAdapayMember,
  getMySettlementAccountSnapshot,
  type MySettlementAccountSnapshot,
} from '@/api/adapay'
import { HttpError, apiUrl } from '@/api/http'
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
  uploadProfileAvatar,
} from '@/api/settings'
import {
  completeAsignIdentify,
  getMyRealnameVerification,
  resumeAsignIdentify,
  resumeCompanyAsignIdentify,
  ocrBusinessLicense,
  startAsignIdentify,
  startCompanyAsignIdentify,
  submitMyRealnameVerification,
  uploadBusinessLicenseFile,
  uploadGuardianConsentFile,
  withdrawMyRealnameVerification,
  type RealnameAuthType,
  type StartAsignIdentifyPayload,
  type StartCompanyIdentifyPayload,
  type SubmitRealnameVerificationPayload,
  type UserRealnameVerification,
} from '@/api/realname'
import {
  modifyCompanyInfo,
  modifyMobileByCode,
  modifyUserName,
  sendVerifyCode,
} from '@/api/asignAccount'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import RealnameHero from '@/components/RealnameHero.vue'
import WechatBindQrModal from '@/components/WechatBindQrModal.vue'
import { missingEnterpriseOnboardingLabels } from '@/shared/realnameMaterials'
import {
  getSettlementCities,
  prepareSettlementAccount,
  settlementBanks,
  settlementProvinces,
} from '@/utils/settlementAccount'
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
  TLoading,
  TOption,
  TRadio,
  TRadioGroup,
  TSelect,
  TTag,
  ArrowRight,
  Bell,
  Connection,
  CreditCard,
  Iphone,
  Lock,
  Message,
  OfficeBuilding,
  Postcard,
  Promotion,
  RefreshLeft,
  RefreshRight,
  SwitchButton,
  User,
  Warning,
} from 'ui_73info'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const profileLoading = ref(false)
const newUsername = ref('')
const usernameLoading = ref(false)
const avatarUrl = ref('')
const failedAvatarUrls = ref<Set<string>>(new Set())
const avatarFileInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
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
const twoFactorMethod = ref<'email' | 'mobile'>('email')
const wechatBindingLoading = ref(false)
const wechatBound = ref(false)
const boundProviders = ref<string[]>([])
const providerBindingLoading = ref(false)
const accountCloseDialogVisible = ref(false)
const accountCloseConfirmation = ref('')
const accountClosing = ref(false)

const submitting = ref(false)
const realnameDialogVisible = ref(false)
const faceidStarting = ref(false)
const faceidChecking = ref(false)
const faceidRestoring = ref(false)
const consentUploading = ref(false)
const consentFileInput = ref<HTMLInputElement | null>(null)
const businessLicenseUploading = ref(false)
/** 营业执照 OCR 进行中（辅助填写，不挡提交）。 */
const businessLicenseOcrLoading = ref(false)
const businessLicenseFileInput = ref<HTMLInputElement | null>(null)
const current = ref<UserRealnameVerification | null>(null)
const adapayMember = ref<{
  onboardingStatus: string
  memberType?: string | null
  settleAccountId?: string | null
  /** 渠道最近一次拒绝的原话，用来告诉用户下一步该补什么。 */
  providerError?: string | null
} | null>(null)
const reviewerAvatarLoadFailed = ref(false)
const faceidAuthUrl = ref('')
const faceidQrDataUrl = ref('')
const faceidDialogVisible = ref(false)
const withdrawing = ref(false)
// 已通过认证后，只有进入「变更主体」模式才解锁表单，用新主体重新认证一遍。
const realnameChangeMode = ref(false)
const FACEID_POLL_INTERVAL_MS = 10_000

const isMobile = ref(false)
let mobileMatch: MediaQueryList | null = null
function syncMobileViewport() {
  isMobile.value = Boolean(mobileMatch?.matches)
}

let faceidPollTimer: number | null = null
let faceidCheckInFlight = false

type FaceidCheckOptions = {
  background?: boolean
  silent?: boolean
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
  // 企业进件资料：支付渠道创建企业会员（对公收款账户）时逐项必填，企业 / 个体工商户主体要收齐。
  companyProvCode: '',
  companyAreaCode: '',
  companyAddress: '',
  businessScope: '',
  businessLicenseExpiresOn: '',
  legalCertExpiresOn: '',
})

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

const realnameSubmitted = computed(() => Boolean(current.value))
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
const enterpriseRequiredMissing = computed(
  () =>
    businessSelected.value &&
    (!form.companyName.trim() ||
      !form.unifiedSocialCreditCode.trim() ||
      !form.operatorName.trim() ||
      !form.operatorIdCardNo.trim() ||
      !form.mobile.trim() ||
      !form.businessLicenseFile.trim() ||
      // 企业进件资料：缺任一项，渠道都会拒绝创建企业会员，之后连对公收款账户都开不了
      !form.companyProvCode.trim() ||
      !form.companyAreaCode.trim() ||
      !form.companyAddress.trim() ||
      !form.businessScope.trim() ||
      !form.businessLicenseExpiresOn.trim() ||
      !form.legalCertExpiresOn.trim()),
)

/** 企业所在省下面的城市选项；省份未选时为空。 */
const enterpriseCities = computed(() => getSettlementCities(form.companyProvCode))

/** 换省份时清掉不属于该省的城市；只有一个城市（直辖市）时直接选中。 */
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
  const stripSuffix = (title: string) => title.replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区)$/, '')
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

function changeEnterpriseProvince() {
  const cities = enterpriseCities.value
  form.companyAreaCode = cities.length === 1 ? (cities[0]?.value ?? '') : ''
}
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
  form.operatorName = ''
  form.operatorIdCardNo = ''
  form.guardianConsent = false
  form.guardianConsentFile = ''
  form.companyProvCode = ''
  form.companyAreaCode = ''
  form.companyAddress = ''
  form.businessScope = ''
  form.businessLicenseExpiresOn = ''
  form.legalCertExpiresOn = ''
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
  form.legalCertExpiresOn = record.legal_cert_expires_on ?? ''
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
    // 企业进件资料：这些是开通对公收款账户的前置，缺失时认证能通过但钱收不到
    if (!form.companyProvCode.trim()) return '请选择企业所在省份'
    if (!/^\d{4}$/.test(form.companyProvCode.trim())) return '企业所在省份编码不正确'
    if (!enterpriseCities.value.some((city) => city.value === form.companyAreaCode)) {
      return '请选择企业所在城市'
    }
    if (!form.companyAddress.trim()) return '请填写企业注册地址'
    if (!form.businessScope.trim()) return '请填写企业经营范围'
    if (form.businessScope.trim().length > MAX_BUSINESS_SCOPE_LEN) {
      return `经营范围不能超过 ${MAX_BUSINESS_SCOPE_LEN} 字（渠道限制），请精简后再提交`
    }
    if (!/^\d{8}$/.test(form.businessLicenseExpiresOn.trim())) return '请选择营业执照有效期'
    if (!/^\d{8}$/.test(form.legalCertExpiresOn.trim())) return '请选择法人证件有效期'
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

async function renderFaceidQrCode(url: string) {
  faceidQrDataUrl.value = await QRCode.toDataURL(url, {
    width: 220,
    margin: 1,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  })
}

function stopFaceidAutoPolling() {
  if (faceidPollTimer === null) {
    return
  }

  window.clearInterval(faceidPollTimer)
  faceidPollTimer = null
}

function startFaceidAutoPolling() {
  stopFaceidAutoPolling()
  if (!faceidAuthUrl.value || realnameApproved.value) {
    return
  }

  faceidPollTimer = window.setInterval(() => {
    void checkWechatFaceidResult({ background: true, silent: true })
  }, FACEID_POLL_INTERVAL_MS)
}

function clearFaceidChallenge() {
  stopFaceidAutoPolling()
  faceidAuthUrl.value = ''
  faceidQrDataUrl.value = ''
}

function openWechatFaceidPage() {
  if (!faceidAuthUrl.value) {
    return
  }
  window.open(faceidAuthUrl.value, '_blank', 'noopener,noreferrer')
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
 * 用户上传的就是他自己的证照，所以直接覆盖已有值并提示核对；识别不出来就保持原样。
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
    apply(ocr.company_address, (next) => (form.companyAddress = clip(next, MAX_COMPANY_ADDRESS_LEN)))
    apply(ocr.business_scope, (next) => (form.businessScope = clip(next, MAX_BUSINESS_SCOPE_LEN)))
    apply(ocr.business_license_expires_on, (next) => (form.businessLicenseExpiresOn = next))
    // 地址拿到了就把「企业所在省市」按渠道省市表认领填好（认不出则留给用户选）
    const region = matchRegionFromAddress(form.companyAddress)
    if (region.prov) {
      form.companyProvCode = region.prov
      form.companyAreaCode = region.area ?? ''
    }
    const notes = [
      truncated ? `经营范围超过 ${MAX_BUSINESS_SCOPE_LEN} 字，已截断` : '',
      region.prov ? '已按地址填好所在省市' : '',
    ].filter(Boolean)
    if (filled > 0) {
      showToast(
        `已按营业执照自动填入企业信息${notes.length ? `（${notes.join('；')}）` : ''}，请核对`,
        truncated ? 'warning' : 'success',
      )
    } else {
      showToast('营业执照未识别出可用信息，请手工填写', 'warning')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '营业执照识别失败，请手工填写', 'warning')
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
    showToast('营业执照仅支持 PNG、JPG、WEBP 图片或 PDF 文件', 'warning')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('营业执照文件不能超过 10MB', 'warning')
    return
  }
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }
  businessLicenseUploading.value = true
  try {
    const result = await uploadBusinessLicenseFile(auth.token, file)
    form.businessLicenseFile = result.business_license_file
    showToast('营业执照已上传', 'success')
    // 上传成功后顺手让后端 OCR 识别一次，把企业信息回填；失败不影响上传结果。
    await autoFillFromBusinessLicense(result.business_license_file)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '上传营业执照失败', 'error')
  } finally {
    businessLicenseUploading.value = false
  }
}

async function handleConsentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }

  if (!isAllowedConsentFile(file)) {
    showToast('同意书仅支持 PNG、JPG、WEBP 图片或 PDF 文件', 'warning')
    return
  }
  if (file.size > MAX_CONSENT_FILE_SIZE) {
    showToast('同意书文件不能超过 5MB', 'warning')
    return
  }

  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  consentUploading.value = true
  try {
    const result = await uploadGuardianConsentFile(auth.token, file)
    form.guardianConsentFile = result.guardian_consent_file
    showToast('监护人同意书已上传', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '上传监护人同意书失败', 'error')
  } finally {
    consentUploading.value = false
  }
}

async function startWechatFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (realnameApproved.value && !realnameChanging.value) {
    showToast('实名认证已通过，无需重复核身', 'success')
    return
  }

  if (realnameLocked.value && !realnameRejected.value) {
    showToast('实名认证正在处理中，请稍后查询结果', 'warning')
    return
  }

  const msg = validate()
  if (msg) {
    showToast(msg, 'warning')
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
      const record = await getMyRealnameVerification(auth.token)
      current.value = record
      reviewerAvatarLoadFailed.value = false
      patchForm(record)
      showToast('个人实名认证已提交，等待管理员审核', 'success')
      return
    }
    faceidAuthUrl.value = result.auth_url
    await renderFaceidQrCode(result.auth_url)
    // 重新加载当前实名状态（后端已创建 pending 记录）
    const record = await getMyRealnameVerification(auth.token)
    current.value = record
    patchForm(record)
    showToast('爱签实名认证已发起', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起爱签实名认证失败', 'error')
  } finally {
    faceidStarting.value = false
  }
}

async function startEnterpriseAsign() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  if (realnameLocked.value && !realnameRejected.value) {
    showToast('实名认证正在处理中，请稍后查询结果', 'warning')
    return
  }

  const msg = validate()
  if (msg) {
    showToast(msg, 'warning')
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
      legal_cert_expires_on: form.legalCertExpiresOn.trim(),
    }
    const result = await startCompanyAsignIdentify(auth.token, payload)
    faceidAuthUrl.value = result.auth_url
    await renderFaceidQrCode(result.auth_url)
    const record = await getMyRealnameVerification(auth.token)
    current.value = record
    reviewerAvatarLoadFailed.value = false
    patchForm(record)
    showToast('企业实名认证已发起，请完成认证', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发起爱签企业实名认证失败', 'error')
  } finally {
    faceidStarting.value = false
  }
}

async function checkWechatFaceidResult(options: FaceidCheckOptions = {}) {
  if (faceidCheckInFlight) {
    return
  }

  auth.hydrate()
  if (!auth.token.trim()) {
    stopFaceidAutoPolling()
    if (!options.silent) {
      showToast('登录状态已失效，请重新登录', 'error')
    }
    return
  }

  faceidCheckInFlight = true
  if (!options.background) {
    faceidChecking.value = true
  }
  // 记下调用前的状态：只有「本次真的从处理中变成已通过」才值得弹提示。
  const previousStatus = current.value?.status ?? null
  try {
    const updated = await completeAsignIdentify(auth.token)
    if (options.background && updated.status === 'rejected') {
      return
    }

    current.value = updated
    reviewerAvatarLoadFailed.value = false
    patchForm(updated)
    if (updated.status === 'approved') {
      clearFaceidChallenge()
      // 静默轮询（进页面、回跳、后台定时）每次都弹会变成噪音：只在状态真的发生转变、
      // 且不是静默调用时提示。
      if (previousStatus === 'pending' && !options.silent) {
        showToast('爱签实名认证已通过', 'success')
      }
      await tryRestoreBusinessPage(updated)
    } else if (updated.status === 'rejected') {
      clearFaceidChallenge()
      if (previousStatus === 'pending') {
        showToast(updated.review_note || '爱签实名认证未通过', 'error')
      }
    } else if (!options.silent) {
      // 认证结果仍为处理中（pending）：如实提示，避免误导为「已更新」
      if (faceidAuthUrl.value) {
        showToast('认证仍在处理中，请先完成人脸核身后再查询', 'warning')
      } else {
        showToast('实名认证正在处理中，请稍后查询结果', 'warning')
      }
    }
  } catch (err) {
    if (!options.silent) {
      showToast(err instanceof Error ? err.message : '查询爱签实名认证结果失败', 'error')
    }
  } finally {
    faceidCheckInFlight = false
    if (!options.background) {
      faceidChecking.value = false
    }
  }
}

async function resumeFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  faceidRestoring.value = true
  try {
    const result = await resumeAsignIdentify(auth.token)
    if (result.manual_review || !result.auth_url) {
      // 非大陆证件走人工审核，无需二维码
      showToast('个人实名认证已提交，等待管理员审核', 'success')
      return
    }
    faceidAuthUrl.value = result.auth_url
    await renderFaceidQrCode(result.auth_url)
    showToast('认证二维码已恢复，请继续完成人脸核身', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '恢复实名认证二维码失败', 'error')
  } finally {
    faceidRestoring.value = false
  }
}

async function restoreFaceidChallengeIfNeeded() {
  // 刷新页面后：爱签认证链接仅存于内存，会丢失。
  if (current.value?.status !== 'pending') return
  if (faceidAuthUrl.value) return

  // 企业认证：续发企业认证二维码
  if (enterpriseSelected.value) {
    await resumeEnterpriseFaceid()
    return
  }

  // 个人：仅大陆身份证（走爱签扫码人脸核身）
  if (!identityCardSelected.value) return

  // 流水号在后端，这里直接静默问一次结果；没有进行中的记录会静默失败，不影响续发。
  await checkWechatFaceidResult({ silent: true })
  // 查询后状态可能已更新（通过/驳回），此时无需再续发
  if (current.value?.status !== 'pending' || faceidAuthUrl.value) return

  await resumeFaceid()
}

async function resumeEnterpriseFaceid() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  faceidRestoring.value = true
  try {
    const result = await resumeCompanyAsignIdentify(auth.token)
    faceidAuthUrl.value = result.auth_url
    await renderFaceidQrCode(result.auth_url)
    showToast('企业认证二维码已恢复，请继续完成认证', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '恢复企业认证二维码失败', 'error')
  } finally {
    faceidRestoring.value = false
  }
}

// 人脸核身二维码出现时自动弹出核身弹窗，并收起「提交认证信息」弹窗，避免双弹窗叠放。
watch(faceidAuthUrl, (url) => {
  if (url) {
    faceidDialogVisible.value = true
    realnameDialogVisible.value = false
    // 生成人脸核身二维码后，自动开始轮询认证结果
    startFaceidAutoPolling()
  } else {
    faceidDialogVisible.value = false
  }
})

// 关掉「提交认证信息」弹窗即放弃变更草稿：没提交过的变更，下次打开不该还是解锁态。
watch(realnameDialogVisible, (visible) => {
  if (!visible) {
    realnameChangeMode.value = false
  }
})

async function handleWithdraw() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
    return
  }

  withdrawing.value = true
  try {
    const result = await withdrawMyRealnameVerification(auth.token)
    clearFaceidChallenge()
    if (result.restored) {
      // 取消主体变更：后端已把账号还原成变更前那份主体，这里只需刷新回「已通过」。
      const record = await getMyRealnameVerification(auth.token)
      current.value = record
      reviewerAvatarLoadFailed.value = false
      patchForm(record)
      faceidDialogVisible.value = false
      realnameDialogVisible.value = true
      showToast('已取消主体变更，账号还原为变更前的实名主体', 'success')
      return
    }
    current.value = null
    reviewerAvatarLoadFailed.value = false
    // 重置表单回到「未提交」的可编辑状态
    form.authType = 'IDENTITY_CARD'
    resetRealnameSubjectFields()
    faceidDialogVisible.value = false
    realnameDialogVisible.value = true
    showToast('已撤回实名认证，可重新提交', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '撤回实名认证失败', 'error')
  } finally {
    withdrawing.value = false
  }
}

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
      desc: settleUnderReview.value
        ? '企业收款账户正在渠道审核中，审核通过后即可绑定对公账户'
        : settleSubjectMismatch.value
          ? settleMaterialMissing.value
            ? `实名资料缺${settleMaterialMissingText.value}，补齐后才能重新绑定收款账户`
            : '实名主体已变更，原银行卡需按新主体重新绑定'
          : adapayMember.value?.settleAccountId
            ? '收款银行卡已绑定，可查看或更换'
            : '绑定收款银行卡后，合同款才能结算到账',
      icon: CreditCard,
      // 渠道会员还在审核时**不放开入口**：这时候点进去也绑不上，
      // 只会撞渠道的 member_not_exists，徒增一次失败与一次限流。
      locked: settleUnderReview.value,
      // 标签直接反映「收款银行卡有没有绑」：这才是用户关心的「能不能收款」。
      // （此前是「收款认证：已认证」，读的是渠道会员 onboardingStatus，未绑卡也显示绿色，
      //   会把人误导成「已能收款」，2026-10-04 改回绑卡口径。）
      // 渠道会员还在审核时就别报「未设置」（那会让人以为要自己再绑一次），而是如实写审核中。
      status: settleUnderReview.value
        ? { text: '结算账户：渠道审核中', tone: 'warning' }
        : settleSubjectMismatch.value
          ? { text: '收款账户：待重绑', tone: 'warning' }
          : Boolean(adapayMember.value?.settleAccountId)
            ? { text: '结算账户：已设置', tone: 'success' }
            : { text: '结算账户：未设置', tone: 'info' },
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
        showToast('企业收款账户正在渠道审核中，审核通过后即可绑定对公账户', 'warning')
        return
      }
      void openSettleDialog()
      return
    case 'closeSettle':
      closeSettleDialogVisible.value = true
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
    showToast('暂时拿不到人脸核身链接，可撤回本次认证后重新提交', 'warning')
    return
  }
  faceidDialogVisible.value = true
}

// ── 爱签账户管理（为电子签署准备） ──────────────────────────────
const asignDialogVisible = ref(false)
const asignDialogKind = ref('')

const ASIGN_DIALOG_TITLES: Record<string, string> = {
  mobile: '修改手机号',
  legalPerson: '修改法人',
  company: '企业信息',
  personal: '修改姓名',
}
const asignDialogTitle = computed(
  () => ASIGN_DIALOG_TITLES[asignDialogKind.value] ?? '爱签账户管理',
)

/// 修改手机号：只保留短信验证码方式（运营商三要素那条路 2026-10-04 已删）。
function openMobileDialog() {
  asignDialogKind.value = 'mobile'
  asignDialogVisible.value = true
}

// ── Adapay 结算账户 ──────────────────────────────────────────
const settleDialogVisible = ref(false)
const settleSaving = ref(false)
const settleLoading = ref(false)
/** 注销结算账户确认弹窗 */
const closeSettleDialogVisible = ref(false)
const closeSettleLoading = ref(false)
/**
 * 当前已绑卡的**脱敏**明细（后端从渠道会员对象现取）。
 *
 * 只用于两件事：回填开户行/省市区/账户类型，以及把「正在换哪张卡」显示清楚。
 * 卡号是渠道给的脱敏形态（`621483207******5`），**不能**回填进输入框——提交必须给完整卡号，
 * 而完整卡号后端也没有（渠道只回脱敏形态、平台不落库）。
 */
const settleSnapshot = ref<MySettlementAccountSnapshot | null>(null)
const settleForm = reactive({
  card_id: '',
  bank_code: '',
  prov_code: '',
  area_code: '',
  bank_acct_type: '2',
})

/** 是否已绑定结算账户（决定提交时走「绑定」还是「更换」接口） */
const settleBound = computed(() => Boolean(adapayMember.value?.settleAccountId))

/** 当前实名主体对应的收款账户主体：企业 / 个体工商户走对公账户，其余按个人身份证。 */
const settleExpectedMemberType = computed(() =>
  assignEnterprise.value ? 'enterprise' : 'personal',
)

/**
 * 已绑定的收款账户是否还挂在旧主体上。
 *
 * 实名主体变更（个人 ↔ 企业）后，渠道侧会员与结算账户不会自动跟着换：旧账户挂在旧主体名下，
 * 既改不了也重建不了。此时更换会按当前主体重新开通收款账户，界面必须先说清楚，
 * 否则用户提交后才在渠道侧碰壁。
 */
const settleSubjectMismatch = computed(
  () =>
    Boolean(adapayMember.value?.memberType) &&
    adapayMember.value?.memberType !== settleExpectedMemberType.value,
)

/** 企业主体的收款账户只能是对公账户，持证人固定取实名主体，因此不给用户改。 */
const settleCorporateLocked = computed(() => assignEnterprise.value)

/** 当前实名主体的中文口径，用于把「这张卡为什么不能继续用」讲清楚。 */
const settleSubjectLabel = computed(() =>
  settleCorporateLocked.value ? '企业 / 个体工商户' : '个人',
)

/**
 * 企业主体按新主体重建收款账户前，渠道侧要求实名资料里的企业进件资料齐备。
 *
 * 渠道创建企业会员（对公收款账户）时逐项校验营业执照文件、企业所在省市、注册地址、
 * 经营范围、营业执照有效期、法人证件有效期，缺任一项整条对公收款通道都开不了。
 * 缺资料时重绑一定会被渠道拒绝，必须先回「变更认证类型」补资料，所以这里提前拦在界面层，
 * 别让用户白填一次表单。
 */
const settleMaterialMissing = computed(() => {
  if (!settleCorporateLocked.value) return false
  return settleMaterialMissingLabels.value.length > 0
})

/** 企业进件资料缺了哪几项，用于把「缺什么」直接说给用户，而不是一句笼统的「资料不全」。 */
const settleMaterialMissingLabels = computed(() => missingEnterpriseOnboardingLabels(current.value))

/** 缺资料的清单文本，拼进提示语里。 */
const settleMaterialMissingText = computed(() => settleMaterialMissingLabels.value.join('、'))

/**
 * 渠道侧最近一次拒绝的原话。
 *
 * 只报状态（「未认证 / 未通过」）时，用户不知道该改什么；渠道原话（如
 * 「prov_code 不能为空」）是唯一能对上号的线索，所以在弹窗里原样给出来。
 * 已经开通且卡还在时不再提旧伤——那是一次翻篇的失败；换卡失败导致卡被解绑时
 * 状态仍停在 `active`，这时候原因必须留着，否则用户看到的是「已认证 + 未设置」而无从下手。
 */
/**
 * 渠道会员是否还在审核中（企业会员开通要走渠道审核，这期间绑不了对公账户）。
 */
const settleUnderReview = computed(() => {
  const status = adapayMember.value?.onboardingStatus
  return status === 'under_review' || status === 'pending'
})

const settleProviderError = computed(() => {
  const member = adapayMember.value
  const error = (member?.providerError ?? '').trim()
  if (!error) return ''
  return member?.onboardingStatus === 'active' && member.settleAccountId ? '' : error
})

/** 缺企业资料时不去重绑，直接关掉弹窗并打开实名表单让用户补企业进件资料。 */
function goFixSettleMaterial() {
  settleDialogVisible.value = false
  realnameDialogVisible.value = true
  startRealnameChange()
}

const settleCities = computed(() => getSettlementCities(settleForm.prov_code))

function changeSettleProvince() {
  settleForm.area_code = settleCities.value.length === 1 ? settleCities.value[0]!.value : ''
}

/** 清空银行卡表单，避免上次未提交的输入（尤其是更换时取消）残留到下一次打开 */
function resetSettleForm() {
  settleForm.card_id = ''
  settleForm.bank_code = ''
  settleForm.prov_code = ''
  settleForm.area_code = ''
  // 账户类型跟着实名主体走：企业主体只能绑对公账户，个人主体默认个人卡。
  settleForm.bank_acct_type = settleCorporateLocked.value ? '1' : '2'
}

/** 重新拉取 Adapay 会员状态；失败时置空，让界面退化为「未绑定」而不是继续显示旧卡 */
async function refreshAdapayMember() {
  if (!auth.token) return
  try {
    adapayMember.value = await getMyAdapayMember(auth.token)
  } catch {
    adapayMember.value = null
  }
}

/**
 * 拉取已绑卡的脱敏明细并回填表单。
 *
 * 只回填**能提交出去**的字段（开户行 / 省 / 市 / 账户类型）：这些码与前端字典同源，
 * 选中后就是渠道认的值。卡号例外——渠道只回脱敏形态，提交又必须给完整卡号，
 * 所以卡号留空让用户输入，脱敏卡号只作为「当前是哪张卡」的提示显示。
 */
async function loadSettleSnapshot() {
  settleSnapshot.value = null
  if (!auth.token || !settleBound.value) return
  try {
    const snapshot = await getMySettlementAccountSnapshot(auth.token)
    settleSnapshot.value = snapshot
    if (snapshot.bankCode) settleForm.bank_code = snapshot.bankCode
    if (snapshot.provCode) settleForm.prov_code = snapshot.provCode
    if (snapshot.areaCode) settleForm.area_code = snapshot.areaCode
    if (snapshot.bankAcctType === '1' || snapshot.bankAcctType === '2') {
      settleForm.bank_acct_type = snapshot.bankAcctType
    }
  } catch {
    // 拿不到明细不影响换卡：表单已按实名主体给了默认账户类型，用户自己填即可
    settleSnapshot.value = null
  }
}

/** 卡号输入框的提示：已绑卡时直接显示渠道给的脱敏卡号，让用户一眼看清当前是哪张卡 */
const settleCardPlaceholder = computed(() => {
  if (!settleBound.value) return '请输入收款银行卡号'
  const masked = (settleSnapshot.value?.cardIdMasked ?? '').trim()
  return masked ? `当前 ${masked}（更换请整卡重填）` : '请输入收款银行卡号（需整卡重填）'
})

/** 打开弹窗即进入表单：已绑卡时回填脱敏明细，未绑卡时按实名主体给默认值 */
async function openSettleDialog() {
  settleDialogVisible.value = true
  resetSettleForm()
  settleLoading.value = true
  try {
    await refreshAdapayMember()
    await loadSettleSnapshot()
  } finally {
    settleLoading.value = false
  }
}

/** 关掉弹窗（取消更换 / 未绑定时放弃填写），顺手清掉未提交的输入 */
function closeSettleDialog() {
  settleDialogVisible.value = false
  resetSettleForm()
  settleSnapshot.value = null
}

async function saveSettleAccount() {
  if (!auth.token || settleSaving.value) return
  let payload
  try {
    payload = prepareSettlementAccount(settleForm)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '请检查银行卡信息', 'warning')
    return
  }
  // 提交前定一次语义：更换会先解绑旧卡，失败时界面要按真实状态回落
  const changing = settleBound.value
  settleSaving.value = true
  try {
    const member = changing
      ? await changeMyAdapaySettlementAccount(auth.token, payload)
      : await createMyAdapaySettlementAccount(auth.token, payload)
    adapayMember.value = member
    showToast(changing ? '收款银行卡已更换' : '结算账户已设置', 'success')
    settleDialogVisible.value = false
    resetSettleForm()
    settleSnapshot.value = null
  } catch (err) {
    showToast(
      err instanceof Error ? err.message : changing ? '更换收款银行卡失败' : '设置结算账户失败',
      'error',
    )
    // 更换是「先解绑再重建」，失败可能停在已解绑的中间态，刷新后按真实状态展示
    if (changing) {
      await refreshAdapayMember()
    }
  } finally {
    settleSaving.value = false
  }
}

/**
 * 注销结算账户：先让渠道删掉，成功才清本地绑定。
 *
 * 注销后合同款与分账都进不来，要收款必须重新绑定；如果有在途分账/未结清款项，
 * 渠道会拒绝并回原话，这里把原话透给用户。
 */
async function handleCloseSettleAccount() {
  if (!requireToken()) return
  closeSettleLoading.value = true
  try {
    adapayMember.value = await closeMyAdapaySettlementAccount(auth.token)
    showToast('结算账户已注销', 'success')
    closeSettleDialogVisible.value = false
    settleSnapshot.value = null
  } catch (err) {
    showToast(err instanceof Error ? err.message : '注销结算账户失败', 'error')
    // 失败可能停在「渠道已删、本地未更新」之外的任何状态，刷新一次按真实状态展示
    await refreshAdapayMember()
  } finally {
    closeSettleLoading.value = false
  }
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
    showToast('登录状态已失效，请重新登录', 'error')
    return false
  }
  return true
}

async function handleSendVerifyCode() {
  if (!requireToken()) return
  if (!asign.mobileByCode.mobile.trim()) {
    showToast('请先填写新手机号', 'warning')
    return
  }
  asignLoading.sendCode = true
  try {
    const res = await sendVerifyCode(auth.token, { mobile: asign.mobileByCode.mobile.trim() })
    if (res.success) {
      asign.mobileByCode.ctoken = res.data?.codeToken ?? ''
      showToast('验证码已发送，请查收短信', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送验证码失败', 'error')
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
    showToast('请填写手机号与验证码（需先发送验证码）', 'warning')
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
      showToast('手机号已修改', 'success')
      asign.mobileByCode.mobile = ''
      asign.mobileByCode.code = ''
      asign.mobileByCode.ctoken = ''
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改手机号失败', 'error')
  } finally {
    asignLoading.mobileByCode = false
  }
}

/// 修改法人：爱签侧与「修改企业信息」同接口（`/user/modifyCompanyInfo`），
/// 只是这时法人三要素必须齐全（姓名 + 身份证号 + 证件类型 1=身份证）。
async function handleModifyLegalPerson() {
  if (!requireToken()) return
  if (!asign.legalPerson.name.trim() || !asign.legalPerson.idCard.trim()) {
    showToast('请填写法人姓名与身份证号', 'warning')
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
      showToast('法人信息已修改', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改法人失败', 'error')
  } finally {
    asignLoading.legalPerson = false
  }
}

async function handleModifyCompanyInfo() {
  if (!requireToken()) return
  if (!asign.company.companyName.trim() && !asign.company.legalName.trim()) {
    showToast('请填写企业名称或法人信息', 'warning')
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
      showToast(res.data ? '企业信息已修改，新印章已生成' : '企业信息已修改', 'success')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改企业信息失败', 'error')
  } finally {
    asignLoading.company = false
  }
}

async function handleModifyUserName() {
  if (!requireToken()) return
  if (!asign.personal.personalName.trim()) {
    showToast('请填写姓名', 'warning')
    return
  }
  if (!asign.personal.mobile.trim()) {
    showToast('请填写本人手机号（用于运营商三要素核验）', 'warning')
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
      showToast('姓名已修改', 'success')
      asign.personal.personalName = ''
      asign.personal.mobile = ''
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改姓名失败', 'error')
  } finally {
    asignLoading.personal = false
  }
}

async function submitRealname() {
  auth.hydrate()
  if (!auth.token.trim()) {
    showToast('登录状态已失效，请重新登录', 'error')
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
    showToast('实名认证审核中或已通过时不能修改', 'warning')
    return
  }

  const msg = validate()
  if (msg) {
    showToast(msg, 'warning')
    return
  }

  submitting.value = true
  try {
    const updated = await submitMyRealnameVerification(auth.token, buildPayload())
    current.value = updated
    reviewerAvatarLoadFailed.value = false
    patchForm(updated)
    showToast(
      updated.status === 'approved' ? '实名认证信息已更新' : '实名认证信息已提交，请等待审核',
      'success',
    )
    await tryRestoreBusinessPage(updated)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '提交实名认证失败', 'error')
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
    current.value = record
    reviewerAvatarLoadFailed.value = false
    patchForm(record)
    await tryRestoreBusinessPage(record)
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      return
    }

    showToast(err instanceof Error ? err.message : '加载实名认证状态失败', 'error')
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
    showToast('请先登录后注销账号', 'error')
    return
  }
  if (!accountCloseReady.value) {
    showToast('请输入“注销账号”确认操作', 'warning')
    return
  }

  accountClosing.value = true
  try {
    await closeAccount(auth.token)
    accountCloseDialogVisible.value = false
    auth.logout()
    showToast('账号已注销，第三方绑定已释放', 'success')
    await router.replace({ name: 'home' })
  } catch (err) {
    showToast(err instanceof Error ? err.message : '注销账号失败', 'error')
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
    showToast('请先登录后再绑定', 'error')
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
      showToast(`${providerLabel(provider)} 已解除绑定`, 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : `解除 ${providerLabel(provider)} 绑定失败`,
        'error',
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
    showToast(
      err instanceof Error ? err.message : `发起 ${providerLabel(provider)} 绑定失败`,
      'error',
    )
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
const twoFactorStatusText = computed(() => {
  if (twoFactorChanged.value) {
    return '待保存'
  }
  return twoFactorEnabled.value ? '已开启' : '已关闭'
})
const avatarSrc = computed(() => {
  const currentAvatarUrl = avatarUrl.value.trim()
  return currentAvatarUrl && !failedAvatarUrls.value.has(currentAvatarUrl)
    ? apiUrl(currentAvatarUrl)
    : ''
})
const avatarInitial = computed(
  () => Array.from(auth.username || newUsername.value || '用')[0] ?? '用',
)

async function loadProfile() {
  auth.hydrate()
  if (!auth.isAuthed) {
    return
  }

  profileLoading.value = true
  try {
    const profile = await getProfile(auth.token)
    newUsername.value = profile.username
    avatarUrl.value = profile.avatar_url ?? ''
    profileEmail.value = profile.email ?? ''
    twoFactorEnabled.value = profile.two_factor_enabled
    twoFactorTargetEnabled.value = profile.two_factor_enabled
    wechatBound.value = profile.wechat_bound ?? false
    if (!newEmail.value) {
      newEmail.value = profile.email ?? ''
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载个人资料失败', 'error')
  } finally {
    profileLoading.value = false
  }
}

async function updateUsername() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改用户名', 'error')
    return
  }

  const trimmed = newUsername.value.trim()
  if (trimmed.length === 0) {
    showToast('请输入一个新的用户名', 'error')
    return
  }
  if (trimmed === auth.username) {
    showToast('用户名未发生变化', 'info')
    return
  }

  usernameLoading.value = true
  try {
    const payload = await updateProfile(auth.token, trimmed)
    auth.setToken(payload.token)
    newUsername.value = auth.username
    showToast('用户名已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改用户名失败', 'error')
  } finally {
    usernameLoading.value = false
  }
}

function openAvatarPicker() {
  avatarFileInput.value?.click()
}

function handleAvatarError() {
  const currentAvatarUrl = avatarUrl.value.trim()
  if (!currentAvatarUrl) return

  const next = new Set(failedAvatarUrls.value)
  next.add(currentAvatarUrl)
  failedAvatarUrls.value = next
}

async function handleAvatarChange(event: Event) {
  if (!auth.isAuthed) {
    showToast('请先登录后上传头像', 'error')
    return
  }

  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    showToast('头像仅支持图片格式', 'warning')
    if (input) input.value = ''
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('头像图片请控制在 2MB 以内', 'warning')
    if (input) input.value = ''
    return
  }

  avatarUploading.value = true
  try {
    const profile = await uploadProfileAvatar(auth.token, file)
    const nextAvatarUrl = profile.avatar_url ?? ''
    if (nextAvatarUrl) {
      const nextFailedUrls = new Set(failedAvatarUrls.value)
      nextFailedUrls.delete(nextAvatarUrl)
      failedAvatarUrls.value = nextFailedUrls
    }
    avatarUrl.value = nextAvatarUrl
    showToast('头像已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '上传头像失败', 'error')
  } finally {
    avatarUploading.value = false
    if (input) input.value = ''
  }
}

async function sendEmailVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改邮箱', 'error')
    return
  }

  const trimmed = newEmail.value.trim()
  if (!trimmed) {
    showToast('请输入新的邮箱地址', 'error')
    return
  }
  if (trimmed === profileEmail.value) {
    showToast('新邮箱不能与当前邮箱相同', 'warning')
    return
  }

  emailCodeSending.value = true
  try {
    await sendProfileEmailChangeCode(auth.token, trimmed)
    showToast('验证码已发送到新邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送邮箱验证码失败', 'error')
  } finally {
    emailCodeSending.value = false
  }
}

async function submitEmailChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改邮箱', 'error')
    return
  }

  const trimmedEmail = newEmail.value.trim()
  const trimmedCode = emailCode.value.trim()
  if (!trimmedEmail) {
    showToast('请输入新的邮箱地址', 'error')
    return
  }
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  emailLoading.value = true
  try {
    const profile = await updateProfileEmail(auth.token, trimmedEmail, trimmedCode)
    profileEmail.value = profile.email ?? ''
    newEmail.value = profile.email ?? ''
    emailCode.value = ''
    showToast('邮箱已更新', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改邮箱失败', 'error')
  } finally {
    emailLoading.value = false
  }
}

async function sendPasswordVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改密码', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改密码', 'error')
    return
  }

  passwordCodeSending.value = true
  try {
    await sendProfilePasswordCode(auth.token)
    showToast('验证码已发送到当前绑定邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送密码验证码失败', 'error')
  } finally {
    passwordCodeSending.value = false
  }
}

async function submitPasswordChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改密码', 'error')
    return
  }

  const trimmedPassword = newPassword.value.trim()
  const trimmedConfirm = confirmPassword.value.trim()
  const trimmedCode = passwordCode.value.trim()

  if (trimmedPassword.length < 6) {
    showToast('新密码至少 6 位', 'error')
    return
  }
  if (trimmedPassword !== trimmedConfirm) {
    showToast('两次输入的新密码不一致', 'error')
    return
  }
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
    return
  }

  passwordLoading.value = true
  try {
    await updateProfilePassword(auth.token, trimmedPassword, trimmedCode)
    newPassword.value = ''
    confirmPassword.value = ''
    passwordCode.value = ''
    showToast('密码已更新，请使用新密码登录', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '修改密码失败', 'error')
  } finally {
    passwordLoading.value = false
  }
}

async function sendTwoFactorVerificationCode() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改两步验证', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改两步验证', 'error')
    return
  }
  if (!twoFactorChanged.value) {
    showToast('两步验证设置未发生变化', 'info')
    return
  }

  twoFactorCodeSending.value = true
  try {
    await sendProfileTwoFactorCode(auth.token)
    showToast('验证码已发送到当前绑定邮箱，请查收', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发送两步验证验证码失败', 'error')
  } finally {
    twoFactorCodeSending.value = false
  }
}

async function handleTwoFactorTargetChange(event: Event) {
  const input = event.target as HTMLInputElement | null
  const nextEnabled = input?.checked ?? twoFactorTargetEnabled.value
  twoFactorTargetEnabled.value = nextEnabled
  twoFactorCode.value = ''

  if (nextEnabled && !twoFactorEnabled.value && !twoFactorCodeSending.value) {
    await sendTwoFactorVerificationCode()
  }
}

async function submitTwoFactorChange() {
  if (!auth.isAuthed) {
    showToast('请先登录后修改两步验证', 'error')
    return
  }
  if (!profileEmail.value) {
    showToast('请先绑定邮箱后再修改两步验证', 'error')
    return
  }
  if (!twoFactorChanged.value) {
    showToast('两步验证设置未发生变化', 'info')
    return
  }

  const trimmedCode = twoFactorCode.value.trim()
  if (trimmedCode.length !== 6) {
    showToast('请输入 6 位邮箱验证码', 'error')
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
    showToast(twoFactorEnabled.value ? '两步验证已开启' : '两步验证已关闭', 'success')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新两步验证失败', 'error')
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
    showToast('请先登录后再绑定微信', 'error')
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
    showToast(err instanceof Error ? err.message : '发起微信绑定失败', 'error')
  } finally {
    wechatBindingLoading.value = false
  }
}

async function unbindWechat() {
  if (!auth.isAuthed) {
    showToast('请先登录后再解除微信绑定', 'error')
    return
  }
  if (wechatBindingLoading.value) {
    return
  }

  wechatBindingLoading.value = true
  try {
    await unbindProvider(auth.token, 'wechat')
    wechatBound.value = false
    showToast('微信已解除绑定', 'success')
    await auth.fetchProfile(true).catch(() => undefined)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '解除微信绑定失败', 'error')
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
    showToast('微信绑定成功', 'success')
    await auth.fetchProfile(true).catch(() => undefined)
  } else {
    showToast(`微信绑定失败：${result.error ?? '未完成'}`, 'error')
  }
}

function consumeWechatBindResult() {
  const result = typeof route.query.wechat_bind === 'string' ? route.query.wechat_bind.trim() : ''
  const error =
    typeof route.query.wechat_bind_error === 'string' ? route.query.wechat_bind_error.trim() : ''
  if (result === 'success') {
    showToast('微信绑定成功', 'success')
  } else if (error) {
    showToast(`微信绑定失败：${error}`, 'error')
  }
  if (result || error) {
    const nextQuery = { ...route.query }
    delete nextQuery.wechat_bind
    delete nextQuery.wechat_bind_error
    void router.replace({ query: nextQuery })
  }
}

function scrollToRealname() {
  document
    .getElementById('account-realname')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function consumeProviderBindResult() {
  const result = typeof route.query.bind === 'string' ? route.query.bind.trim() : ''
  const error = typeof route.query.bind_error === 'string' ? route.query.bind_error.trim() : ''
  if (result === 'success') {
    showToast('第三方账号绑定成功', 'success')
    void loadBoundProviders()
  } else if (error) {
    showToast(`第三方账号绑定失败：${error}`, 'error')
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
  try {
    adapayMember.value = await getMyAdapayMember(auth.token)
  } catch {
    adapayMember.value = null
  }
  // 钱包页的「去绑定收款银行卡」入口：带 settle=1 直接打开结算账户弹窗
  if (route.query.settle === '1') {
    void openSettleDialog()
    const nextQuery = { ...route.query }
    delete nextQuery.settle
    void router.replace({ query: nextQuery })
  }
  // 回跳后问一次结果：流水号由后端从库里取，前端不再持有任何渠道凭证。
  await checkWechatFaceidResult({ silent: true })
  // 刷新后尝试恢复丢失的爱签二维码（若仍未完成人脸核身）
  await restoreFaceidChallengeIfNeeded()
})

onBeforeUnmount(() => {
  mobileMatch?.removeEventListener('change', syncMobileViewport)
  mobileMatch = null
  stopFaceidAutoPolling()
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
              <!-- 以下六项是支付渠道创建企业会员（对公收款账户）的必填进件资料：
                   缺任意一项，认证能过但对公收款账户开不了，所以在这里收齐 -->
              <TFormItem :label="`${soleProprietorSelected ? '个体户' : '企业'}所在省市`" required>
                <div class="realname-region-row">
                  <TSelect
                    v-model="form.companyProvCode"
                    filterable
                    clearable
                    placeholder="选择省份"
                    :disabled="realnameLocked"
                    @change="changeEnterpriseProvince"
                  >
                    <TOption
                      v-for="province in settlementProvinces"
                      :key="province.value"
                      :label="province.title"
                      :value="province.value"
                    />
                  </TSelect>
                  <TSelect
                    v-model="form.companyAreaCode"
                    filterable
                    clearable
                    :disabled="realnameLocked || !form.companyProvCode"
                    :placeholder="form.companyProvCode ? '选择城市' : '请先选省份'"
                  >
                    <TOption
                      v-for="city in enterpriseCities"
                      :key="city.value"
                      :label="city.title"
                      :value="city.value"
                    />
                  </TSelect>
                </div>
              </TFormItem>
              <TFormItem :label="`${soleProprietorSelected ? '个体户' : '企业'}注册地址`" required>
                <TInput
                  v-model="form.companyAddress"
                  :maxlength="200"
                  placeholder="按营业执照填写注册地址"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="经营范围" required>
                <TInput
                  v-model="form.businessScope"
                  :maxlength="200"
                  type="textarea"
                  :rows="2"
                  placeholder="按营业执照填写经营范围"
                  :disabled="realnameLocked"
                />
              </TFormItem>
              <TFormItem label="营业执照有效期" required>
                <div class="realname-date-row">
                  <TDatePicker
                    v-model="form.businessLicenseExpiresOn"
                    type="date"
                    value-format="YYYYMMDD"
                    format="YYYY-MM-DD"
                    placeholder="选择有效期截止日"
                    :disabled="realnameLocked"
                  />
                  <TButton
                    variant="text"
                    tone="accent"
                    :disabled="realnameLocked"
                    @click="form.businessLicenseExpiresOn = LONG_TERM_DATE"
                  >
                    长期有效
                  </TButton>
                </div>
              </TFormItem>
              <TFormItem label="法人证件有效期" required>
                <div class="realname-date-row">
                  <TDatePicker
                    v-model="form.legalCertExpiresOn"
                    type="date"
                    value-format="YYYYMMDD"
                    format="YYYY-MM-DD"
                    placeholder="选择证件有效期截止日"
                    :disabled="realnameLocked"
                  />
                  <TButton
                    variant="text"
                    tone="accent"
                    :disabled="realnameLocked"
                    @click="form.legalCertExpiresOn = LONG_TERM_DATE"
                  >
                    长期有效
                  </TButton>
                </div>
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

        <TDialog
          v-model:open="settleDialogVisible"
          title="收款银行卡"
          class="realname-dialog"
          width="520px"
        >
          <TLoading tag="div" :loading="settleLoading" class="settle-dialog">
            <!-- 渠道原话：会员停在「待认证 / 未通过」时，这是唯一能对上号的线索 -->
            <TAlert
              v-if="settleProviderError"
              class="settle-dialog__alert"
              tone="warning"
              :closable="false"
              show-icon
              :title="settleProviderError"
            />

            <!-- 实名主体变更后旧卡不能再收款：先把原因说清楚，再给「按新主体重新绑定」的动作 -->
            <TAlert
              v-if="settleSubjectMismatch"
              class="settle-dialog__alert"
              tone="warning"
              :closable="false"
              show-icon
              :title="
                settleMaterialMissing
                  ? `企业实名资料缺少${settleMaterialMissingText}，收款账户暂时无法按新主体重建`
                  : '实名主体已变更，原银行卡需要按新主体重新绑定'
              "
            >
              <p class="settle-dialog__alert-text">
                合同款只会结算到与当前实名主体一致的收款账户，变更前绑定的卡渠道不会再用。
                <template v-if="settleMaterialMissing">
                  按新主体重建收款账户要读实名资料里的{{
                    settleMaterialMissingText
                  }}，当前企业实名没有；先补齐资料并重新提交企业认证，通过后再回来绑定{{
                    settleCorporateLocked ? '对公账户' : '银行卡'
                  }}。
                </template>
                <template v-else>
                  请按「{{ settleSubjectLabel }}」重新绑定银行卡{{
                    settleCorporateLocked ? '；企业主体需要对公账户' : ''
                  }}。
                </template>
              </p>
              <!-- 表单常驻：不再先给一屏只读态再点「更换」才进表单（2026-10-04 改）；
                   已绑卡时把渠道返回的脱敏明细回填进来，用户只改要改的字段 -->
              <TButton
                variant="solid"
                tone="accent"
                v-if="settleMaterialMissing"
                class="settle-dialog__alert-action"
                size="sm"
                @click="goFixSettleMaterial"
              >
                去「变更认证类型」补齐企业资料
              </TButton>
            </TAlert>

            <TForm
              label-position="left"
              label-width="96px"
              class="settle-form"
              :disabled="settleSaving || settleLoading"
              @submit="saveSettleAccount"
            >
              <TFormItem label="银行卡号" required>
                <TInput v-model="settleForm.card_id" inputmode="numeric" :placeholder="settleCardPlaceholder" />
              </TFormItem>
              <TFormItem label="开户银行" required>
                <TSelect
                  v-model="settleForm.bank_code"
                  :options="settlementBanks"
                  filterable
                  clearable
                  placeholder="搜索或选择银行名称"
                  no-match-text="未找到该银行"
                  style="width: 100%"
                />
              </TFormItem>
              <div class="settle-form__pair">
                <TFormItem label="开户省份" required>
                  <TSelect
                    v-model="settleForm.prov_code"
                    filterable
                    clearable
                    placeholder="选择开户银行所在省份"
                    style="width: 100%"
                    @change="changeSettleProvince"
                  >
                    <TOption
                      v-for="province in settlementProvinces"
                      :key="province.value"
                      :label="province.title"
                      :value="province.value"
                    />
                  </TSelect>
                </TFormItem>
                <TFormItem label="开户城市" required>
                  <TSelect
                    v-model="settleForm.area_code"
                    filterable
                    clearable
                    :disabled="!settleForm.prov_code"
                    :placeholder="settleForm.prov_code ? '选择开户银行所在城市' : '请先选择开户省份'"
                    style="width: 100%"
                  >
                    <TOption
                      v-for="city in settleCities"
                      :key="city.value"
                      :label="city.title"
                      :value="city.value"
                    />
                  </TSelect>
                </TFormItem>
              </div>
              <TFormItem label="账户类型">
                <TSelect v-model="settleForm.bank_acct_type" style="width: 100%">
                  <TOption label="个人银行卡" value="2" />
                  <TOption label="企业对公账户" value="1" />
                </TSelect>
              </TFormItem>
              <TFormItem>
                <div class="settle-form__actions">
                  <TButton :disabled="settleSaving" @click="closeSettleDialog">取消</TButton>
                  <TButton type="submit" variant="solid" tone="accent" :loading="settleSaving">
                    {{ settleSaving ? '保存中...' : settleBound ? '确认更换' : '保存结算账户' }}
                  </TButton>
                </div>
              </TFormItem>
            </TForm>
          </TLoading>
        </TDialog>

        <TDialog
          v-model:open="closeSettleDialogVisible"
          title="注销结算账户"
          class="account-dialog"
          width="420px"
        >
          <p class="asign-hint">
            注销后本账号将无法接收合同款与分账，要恢复收款必须重新绑定银行卡（重新走一次渠道核验）。
            如果还有未结算的合同款或未到账的分账，请先等款项结清再注销——否则渠道可能拒绝，或钱卡在托管里。
          </p>
          <div class="asign-row">
            <TButton
              variant="outline"
              :disabled="closeSettleLoading"
              @click="closeSettleDialogVisible = false"
              >取消</TButton
            >
            <TButton
              variant="solid"
              tone="danger"
              :loading="closeSettleLoading"
              @click="handleCloseSettleAccount"
              >确认注销</TButton
            >
          </div>
        </TDialog>

        <TCard class="realname-card realname-guide-card">
          <h3>认证说明</h3>
          <ul class="realname-guide-card__list">
            <li>认证信息仅用于资质核验，请务必真实有效。</li>
            <li>大陆居民身份证支持即时人脸核验。</li>
            <li>企业认证需平台人工审核，请耐心等待。</li>
            <li>审核通过后可用于合同签署。</li>
            <li>已通过的主体如需更换，可在「认证管理」里点「变更认证类型」重新认证。</li>
          </ul>
        </TCard>

        <TDialog
          v-model:open="faceidDialogVisible"
          :title="enterpriseSelected ? '企业认证' : '人脸核身认证'"
          class="realname-faceid-dialog"
          width="480px"
        >
          <div class="realname-faceid-panel__main">
            <div class="realname-faceid-panel__copy">
              <strong>{{
                isMobile
                  ? enterpriseSelected
                    ? '请完成企业实名认证'
                    : '请完成人脸核身认证'
                  : enterpriseSelected
                    ? '请使用手机扫码，完成企业实名认证'
                    : '请使用手机扫码，完成人脸核身认证'
              }}</strong>
            </div>

            <template v-if="!isMobile">
              <img
                v-if="faceidQrDataUrl"
                class="realname-faceid-panel__qr"
                :src="faceidQrDataUrl"
                alt="爱签实名认证二维码"
              />
              <ol class="realname-faceid-panel__steps">
                <li>用手机 <strong>微信 / 支付宝</strong> 扫描上方二维码</li>
                <li>在手机端按提示完成 <strong>人脸核身</strong></li>
                <li>认证通过后状态自动更新为「已通过」</li>
              </ol>
            </template>

            <div v-else class="realname-faceid-panel__mobile-tip">
              <p>请在手机上完成人脸核身认证。</p>
              <p class="realname-faceid-panel__mobile-sub">
                点击下方「打开认证页面」，将跳转到爱签认证页面完成核身。
              </p>
            </div>
          </div>
          <div class="realname-faceid-panel__actions">
            <TButton class="realname-plain-btn" @click="openWechatFaceidPage">
              <TIcon>
                <Promotion />
              </TIcon>
              {{ isMobile ? '打开认证页面完成核身' : '打开认证页面' }}
            </TButton>
          </div>
          <div class="realname-faceid-panel__actions">
            <TButton variant="outline" tone="danger" :loading="withdrawing" @click="handleWithdraw">
              {{ realnameChangeBacked ? '取消变更，还原原主体' : '撤回认证' }}
            </TButton>
            <TButton
              variant="solid"
              tone="accent"
              class="realname-submit-btn"
              :loading="faceidChecking"
              @click="checkWechatFaceidResult()"
            >
              <TIcon>
                <RefreshRight />
              </TIcon>
              查询结果
            </TButton>
          </div>
          <p class="realname-faceid-panel__hint">
            实名认证需本人完成，二维码有效期约 120
            分钟。若已完成核身，可点击「查询结果」刷新认证状态。
          </p>
        </TDialog>

        <TDialog
          v-model:open="asignDialogVisible"
          :title="asignDialogTitle"
          class="asign-dialog"
          width="520px"
        >
          <template v-if="asignDialogKind === 'mobile'">
            <p class="asign-hint">换绑后，合同签署短信会发到新手机号。</p>
            <div class="asign-row">
              <TInput v-model="asign.mobileByCode.mobile" placeholder="新手机号" />
              <TButton
                variant="outline"
                :loading="asignLoading.sendCode"
                @click="handleSendVerifyCode"
                >发送验证码</TButton
              >
            </div>
            <div class="asign-row">
              <TInput v-model="asign.mobileByCode.code" placeholder="短信验证码" />
              <TButton
                variant="solid"
                tone="accent"
                :loading="asignLoading.mobileByCode"
                @click="handleModifyMobileByCode"
                >确认修改</TButton
              >
            </div>
          </template>


          <template v-else-if="asignDialogKind === 'legalPerson'">
            <p class="asign-hint">变更法人需重新核验：请填写新法人的姓名与身份证号。</p>
            <div class="asign-row">
              <TInput v-model="asign.legalPerson.name" placeholder="法人姓名" />
            </div>
            <div class="asign-row">
              <TInput v-model="asign.legalPerson.idCard" placeholder="法人身份证号" />
            </div>
            <TButton
              variant="solid"
              tone="accent"
              :loading="asignLoading.legalPerson"
              @click="handleModifyLegalPerson"
              >确认修改</TButton
            >
          </template>

          <template v-else-if="asignDialogKind === 'company'">
            <p class="asign-hint">修改企业名称将自动生成新印章，法人信息请配合身份证号填写。</p>
            <div class="asign-row">
              <TInput v-model="asign.company.companyName" placeholder="新企业名称（可选）" />
            </div>
            <div class="asign-row">
              <TInput v-model="asign.company.legalName" placeholder="法人姓名（可选）" />
            </div>
            <div class="asign-row">
              <TInput v-model="asign.company.legalIdCard" placeholder="法人身份证号（可选）" />
            </div>
            <TButton
              variant="solid"
              tone="accent"
              :loading="asignLoading.company"
              @click="handleModifyCompanyInfo"
              >确认修改</TButton
            >
          </template>

          <template v-else-if="asignDialogKind === 'personal'">
            <div class="asign-row">
              <TInput v-model="asign.personal.personalName" placeholder="新姓名" />
            </div>
            <div class="asign-row">
              <TInput
                v-model="asign.personal.mobile"
                inputmode="numeric"
                :maxlength="11"
                :placeholder="
                  current?.mobile_masked
                    ? `请输入本人手机号（当前 ${current.mobile_masked}）`
                    : '请输入本人手机号'
                "
              />
            </div>
            <TButton
              variant="solid"
              tone="accent"
              :loading="asignLoading.personal"
              @click="handleModifyUserName"
              >确认修改</TButton
            >
          </template>
        </TDialog>
      </div>
    </section>

    <TDialog
      v-model:open="emailDialogVisible"
      title="修改邮箱"
      class="account-dialog"
      width="480px"
    >
      <div class="dialog-form">
        <div class="profile-update-row">
          <input
            v-model="newEmail"
            type="email"
            placeholder="请输入新的邮箱地址"
            :disabled="emailLoading || emailCodeSending"
          />
          <button
            class="ghost small"
            type="button"
            :disabled="emailLoading || emailCodeSending"
            @click="sendEmailVerificationCode"
          >
            {{ emailCodeSending ? '发送中...' : '发送验证码' }}
          </button>
        </div>
        <div class="profile-update-row">
          <input
            v-model="emailCode"
            type="text"
            maxlength="6"
            placeholder="输入6位验证码"
            :disabled="emailLoading"
          />
          <button
            class="ghost small"
            type="button"
            :disabled="emailLoading"
            @click="submitEmailChange"
          >
            {{ emailLoading ? '保存中...' : '保存邮箱' }}
          </button>
        </div>
      </div>
    </TDialog>

    <TDialog
      v-model:open="passwordDialogVisible"
      title="修改密码"
      class="account-dialog"
      width="480px"
    >
      <div class="dialog-form">
        <div class="profile-update-row account-password-row account-password-row--send">
          <input
            v-model="newPassword"
            type="password"
            placeholder="请输入新的密码，至少 6 位"
            :disabled="passwordLoading || passwordCodeSending"
          />
          <button
            class="ghost small"
            type="button"
            :disabled="passwordLoading || passwordCodeSending || !profileEmail"
            @click="sendPasswordVerificationCode"
          >
            {{ passwordCodeSending ? '发送中...' : '发送验证码' }}
          </button>
        </div>
        <div
          class="profile-update-row profile-update-row--triple account-password-row account-password-row--confirm"
        >
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            :disabled="passwordLoading"
          />
          <input
            v-model="passwordCode"
            type="text"
            maxlength="6"
            placeholder="输入6位验证码"
            :disabled="passwordLoading"
          />
          <button
            class="ghost small"
            type="button"
            :disabled="passwordLoading || !profileEmail"
            @click="submitPasswordChange"
          >
            {{ passwordLoading ? '保存中...' : '保存密码' }}
          </button>
        </div>
      </div>
    </TDialog>

    <TDialog
      v-model:open="usernameDialogVisible"
      title="修改用户名"
      class="account-dialog"
      width="480px"
    >
      <div class="dialog-form">
        <div class="profile-update-row">
          <input
            v-model="newUsername"
            type="text"
            placeholder="请输入新的用户名"
            :disabled="usernameLoading"
          />
          <button
            class="ghost small"
            type="button"
            :disabled="usernameLoading"
            @click="updateUsername"
          >
            {{ usernameLoading ? '保存中...' : '保存用户名' }}
          </button>
        </div>
      </div>
    </TDialog>

    <TDialog
      v-model:open="twoFactorDialogVisible"
      title="两步验证"
      class="account-dialog"
      width="480px"
    >
      <div class="dialog-form">
        <div class="account-2fa-methods">
          <button
            class="account-2fa-method"
            :class="{ active: twoFactorMethod === 'email' }"
            type="button"
            @click="twoFactorMethod = 'email'"
          >
            <span class="account-2fa-method__name">邮箱验证码</span>
            <small class="account-2fa-method__desc">通过绑定邮箱接收验证码</small>
          </button>
          <button
            class="account-2fa-method"
            :class="{ active: twoFactorMethod === 'mobile' }"
            type="button"
            disabled
          >
            <span class="account-2fa-method__name">手机号验证码</span>
            <small class="account-2fa-method__desc">通过绑定手机号接收验证码</small>
            <TTag size="sm" tone="info" class="account-2fa-method__tag">暂不支持</TTag>
          </button>
        </div>

        <template v-if="twoFactorMethod === 'email'">
          <label class="account-security-toggle-row">
            <span class="account-security-toggle-copy">
              <strong>邮箱验证码保护</strong>
              <small class="requirement-note">当前邮箱：{{ accountEmailLabel }}</small>
            </span>
            <span class="account-switch-control" :class="{ active: twoFactorTargetEnabled }">
              <input
                v-model="twoFactorTargetEnabled"
                type="checkbox"
                :disabled="twoFactorLoading || twoFactorCodeSending || !profileEmail"
                @change="handleTwoFactorTargetChange"
              />
              <span class="account-switch-track" aria-hidden="true">
                <span class="account-switch-thumb"></span>
              </span>
            </span>
          </label>
          <div class="account-security-actions">
            <input
              v-model="twoFactorCode"
              type="text"
              maxlength="6"
              placeholder="输入 6 位验证码"
              :disabled="twoFactorLoading || !profileEmail || !twoFactorChanged"
            />
            <button
              class="ghost small"
              type="button"
              :disabled="
                twoFactorCodeSending || twoFactorLoading || !profileEmail || !twoFactorChanged
              "
              @click="sendTwoFactorVerificationCode"
            >
              {{ twoFactorCodeSending ? '发送中...' : '发送验证码' }}
            </button>
            <button
              class="ghost small"
              type="button"
              :disabled="twoFactorLoading || !profileEmail || !twoFactorChanged"
              @click="submitTwoFactorChange"
            >
              {{ twoFactorLoading ? '保存中...' : '保存设置' }}
            </button>
          </div>
        </template>

        <div v-else class="account-2fa-unsupported">
          <TTag tone="info">手机号两步验证暂不支持，请使用邮箱验证码</TTag>
        </div>
      </div>
    </TDialog>

    <TDialog
      v-model:open="accountCloseDialogVisible"
      title="注销账号"
      class="account-dialog account-close-dialog"
      width="480px"
    >
      <div class="dialog-form account-close-form">
        <TAlert
          tone="warning"
          :closable="false"
          show-icon
          title="注销后将无法登录当前账号"
          description="历史合同、支付和业务记录会保留；微信、GitHub、Gitee、QQ 等第三方绑定会被释放，可重新绑定到其他账号。"
        />
        <label class="account-close-confirm-label" for="account-close-confirmation">
          请输入“注销账号”确认
        </label>
        <TInput
          id="account-close-confirmation"
          v-model="accountCloseConfirmation"
          placeholder="注销账号"
          :disabled="accountClosing"
          autocomplete="off"
        />
        <div class="account-close-actions">
          <TButton :disabled="accountClosing" @click="accountCloseDialogVisible = false">
            取消
          </TButton>
          <TButton
            variant="solid"
            tone="danger"
            :loading="accountClosing"
            :disabled="!accountCloseReady"
            @click="handleCloseAccount"
          >
            确认注销
          </TButton>
        </div>
      </div>
    </TDialog>

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

.account-coupons-summary__head {
  align-items: flex-start;
}

.account-coupons-summary__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.account-coupons-summary__grid article,
.account-settings-card {
  padding: 18px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
}

.account-coupons-summary__grid article {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.account-coupons-summary__grid strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 24px;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-coupons-summary__grid span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.account-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.account-settings-card h4 {
  margin: 0 0 14px;
  color: #0f172a;
  font-size: 16px;
}

.account-settings-card .profile-update-row:last-child {
  margin-bottom: 0;
}

/* 输入框圆角与工作台其他面板保持一致 */
.account-settings-card .profile-update-row input {
  border-radius: 16px;
}

.account-avatar-card {
  display: grid;
  align-content: start;
}

.account-avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.account-avatar-button {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 76px;
  height: 76px;
  overflow: hidden;
  border: 1px solid rgba(183, 201, 238, 0.95);
  border-radius: 50%;
  background: linear-gradient(135deg, #eef5ff, #ffffff);
  color: #1d4ed8;
  cursor: pointer;
  font-size: 28px;
  font-weight: 900;
}

.account-avatar-button:disabled {
  cursor: wait;
  opacity: 0.78;
}

.account-avatar-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-avatar-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.account-avatar-copy strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-avatar-copy .ghost.small {
  justify-self: start;
}

.account-avatar-input {
  display: none;
}

.account-password-card {
  display: grid;
  gap: 12px;
}

.account-password-card .account-password-row {
  display: grid;
  gap: 10px;
  margin-bottom: 0;
}

.account-password-row--send {
  grid-template-columns: minmax(0, 1fr) auto;
}

.account-password-row--confirm {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
}

.account-password-card .ghost.small {
  min-width: 110px;
  justify-self: end;
}

.account-avatar-card {
  grid-column: 1 / -1;
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

.account-security-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.account-security-head h4 {
  margin-bottom: 6px;
}

.account-security-status {
  flex: 0 0 auto;
  min-width: 62px;
  padding: 5px 10px;
  border: 1px solid rgba(134, 239, 172, 0.92);
  border-radius: 999px;
  background: rgba(240, 253, 244, 0.96);
  color: #166534;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  text-align: center;
}

.account-security-status.pending {
  border-color: rgba(253, 230, 138, 0.95);
  background: rgba(255, 251, 235, 0.98);
  color: #92400e;
}

.account-security-toggle-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid rgba(224, 232, 255, 0.92);
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.account-security-toggle-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.account-security-toggle-copy strong {
  color: #0f172a;
  font-weight: 800;
}

.account-switch-control {
  position: relative;
  display: inline-grid;
  width: 46px;
  height: 26px;
}

.account-switch-control input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  opacity: 0;
}

.account-switch-control input:disabled {
  cursor: not-allowed;
}

.account-switch-track {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(203, 213, 225, 0.98);
  border-radius: 999px;
  background: #e2e8f0;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
}

.account-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 2px 5px rgba(15, 23, 42, 0.2);
  transition: transform 0.18s ease;
}

.account-switch-control.active .account-switch-track {
  border-color: rgba(37, 99, 235, 0.92);
  background: #2563eb;
}

.account-switch-control.active .account-switch-thumb {
  transform: translateX(20px);
}

.account-security-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.account-security-actions input {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  padding: 12px 14px;
  background: #ffffff;
  color: #0f172a;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.account-security-actions input:disabled {
  background: #f8fafc;
  color: #94a3b8;
}

.account-security-actions input::placeholder {
  color: #94a3b8;
}

.account-2fa-methods {
  display: grid;
  /* 同上：允许两列收缩，窄弹窗里不让卡片把容器顶宽 */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.account-2fa-methods > * {
  min-width: 0;
}

.account-2fa-method {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid rgba(224, 232, 255, 0.92);
  border-radius: 14px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
  color: #0f172a;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;
}

.account-2fa-method.active {
  border-color: rgba(37, 99, 235, 0.92);
  box-shadow: 0 10px 26px rgba(76, 103, 172, 0.14);
  background: linear-gradient(180deg, #eef4ff 0%, #ffffff 100%);
}

.account-2fa-method:disabled {
  cursor: not-allowed;
  opacity: 0.66;
}

.account-2fa-method__name {
  font-weight: 800;
  font-size: 14px;
}

.account-2fa-method__desc {
  color: #64748b;
  font-size: 12px;
}

.account-2fa-method__tag {
  justify-self: start;
  margin-top: 2px;
}

.account-2fa-unsupported {
  display: flex;
  justify-content: center;
  padding: 22px 0;
}

.account-security-actions .ghost.small {
  min-width: 104px;
}

.account-security-actions .ghost.small:disabled {
  border-color: rgba(226, 232, 240, 0.96);
  background: #f8fafc;
  color: #94a3b8;
  box-shadow: none;
}

@media (max-width: 1100px) {
  .account-coupons-summary__grid,
  .account-settings-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .wallet-header,
  .account-coupons-summary__grid,
  .account-settings-grid {
    grid-template-columns: 1fr;
  }

  .wallet-header {
    align-items: stretch;
  }

  .account-coupons-summary__grid strong {
    white-space: normal;
  }

  .account-password-row--send,
  .account-password-row--confirm,
  .account-security-actions,
  .account-security-toggle-row {
    grid-template-columns: 1fr;
  }

  .account-2fa-methods {
    grid-template-columns: 1fr;
  }

  .account-security-head {
    align-items: flex-start;
  }

  .account-switch-control {
    justify-self: start;
  }

  .account-password-card .ghost.small,
  .account-security-actions .ghost.small {
    width: 100%;
    justify-self: stretch;
  }
}

.dialog-form {
  display: grid;
  gap: 12px;
}

.account-close-form {
  gap: 16px;
}

.account-close-confirm-label {
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.account-close-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.realname-page-shell {
  min-height: calc(100vh - 120px);
  gap: 26px;
}

.realname-guide-card {
  margin-top: 16px;
}

.realname-guide-card h3 {
  margin: 0 0 10px;
  font-size: 16px;
  color: #0f172a;
}

.realname-guide-card__list {
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  list-style: none;
}

.realname-guide-card__list li {
  position: relative;
  padding-left: 18px;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.realname-guide-card__list li::before {
  content: '';
  position: absolute;
  top: 7px;
  left: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
}

.realname-metrics {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.realname-reviewer {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.realname-reviewer__avatar {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: rgba(219, 234, 254, 0.94);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.realname-reviewer__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.realname-reviewer__avatar > span {
  color: inherit;
  font-size: inherit;
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

.realname-form-layout {
  display: grid;
  gap: 20px;
}

.realname-form {
  min-width: 0;
}

/* 企业进件资料：省市两个下拉并排一行，日期与「长期有效」并排一行 */
.realname-region-row {
  display: grid;
  /* 与 .settle-form__pair 同理：列与子项都必须允许收缩到比内容窄，
     否则 TSelect 的最小宽度会把整张表单顶得比弹窗还宽、右侧被裁 */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  width: 100%;
}

.realname-region-row > * {
  min-width: 0;
}

.realname-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
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

.realname-faceid-panel {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid rgba(147, 197, 253, 0.55);
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.96), rgba(248, 250, 252, 0.92));
}

.realname-faceid-panel__main {
  display: grid;
  gap: 14px;
  justify-items: center;
  text-align: center;
}

.realname-faceid-panel__copy {
  display: grid;
  gap: 6px;
}

.realname-faceid-panel__copy strong {
  color: #0f172a;
  font-size: 16px;
}

.realname-faceid-panel__copy span {
  color: #64748b;
  font-size: 13px;
}

.realname-faceid-panel__qr {
  width: 148px;
  height: 148px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid rgba(198, 210, 236, 0.78);
  background: #fff;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.12);
}

.realname-faceid-panel__steps {
  margin: 2px 0 0;
  padding: 0 0 0 20px;
  display: grid;
  gap: 6px;
  text-align: left;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.realname-faceid-panel__steps li {
  list-style: decimal;
}

.realname-faceid-panel__steps strong {
  color: #0f172a;
}

.realname-faceid-panel__mobile-tip {
  display: grid;
  gap: 6px;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.realname-faceid-panel__mobile-sub {
  color: #64748b;
}

.realname-faceid-panel__hint {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.6;
  text-align: center;
}

.realname-faceid-panel__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 780px) {
  .entry-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
}

.asign-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.asign-row:last-child {
  margin-bottom: 0;
}

.asign-hint {
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
  margin: 0 0 12px;
}

.settle-dialog {
  display: grid;
  gap: 16px;
}

/* 已绑定结算账户时的只读态：说明 + 更换入口 */
/* 实名主体变更提示：间距交给弹窗自身的 gap，不再叠 margin */
.settle-dialog__alert {
  margin: 0;
}

.settle-dialog__alert-text {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

/* 缺企业资料时的指路按钮：跟在说明文字后面，与正文留出呼吸 */
.settle-dialog__alert-action {
  margin-top: 10px;
}

/* 开户省份 + 开户城市并成一行；窄屏（弹窗变全宽）时再拆回上下两行。
   两列都用 minmax(0, 1fr) 且子项 min-width: 0 —— grid 子项默认 min-width: auto，
   下拉框的最小宽度会把整张表单顶得比弹窗还宽，右侧（含按钮）被裁掉。 */
.settle-form__pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.settle-form__pair > * {
  min-width: 0;
}

/* TForm 本身是弹窗 body 的 flex 子项，同样要允许收缩到比内容窄 */
.settle-form {
  min-width: 0;
}

@media (max-width: 460px) {
  .settle-form__pair {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 表单底部动作条：取消 + 确认（主操作）靠右，两者留 12px 间距 */
.settle-form__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
</style>
